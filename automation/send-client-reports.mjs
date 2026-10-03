// Envía a cada IFI su reporte semanal y/o mensual (HTML + PDF) desde un buzón
// Microsoft 365. Lee publicado/dashboard.json y config/destinatarios.json de
// SharePoint y registra los envíos en estado/reportes-enviados.json para no
// duplicar. Ver docs/REPORTES_CLIENTES.md.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  aggregateIfi,
  fileNameFor,
  isPeriodComplete,
  lastClosedPeriod,
  previousPeriod,
  renderHtml,
  renderPdf,
  resolveIfiNames,
  subjectFor,
  todayIn
} from "./lib/client-report.mjs";
import { createGraph, openSharePoint, sendMail } from "./lib/graph.mjs";

const flag = (value) => /^(1|true|si|sí|yes)$/i.test(String(value || "").trim());

const env = {
  tenantId: process.env.MS_TENANT_ID || "",
  clientId: process.env.MS_WORKER_CLIENT_ID || "",
  clientSecret: process.env.MS_WORKER_CLIENT_SECRET || "",
  hostname: process.env.SHAREPOINT_HOSTNAME || "",
  sitePath: process.env.SHAREPOINT_SITE_PATH || "",
  library: process.env.SHAREPOINT_LIBRARY || "Documentos",
  dataRoot: process.env.SHAREPOINT_DATA_ROOT || "Tikee Adoption 360",
  mailbox: (process.env.REPORT_SENDER_MAILBOX || "").trim(),
  brand: process.env.REPORT_BRAND || "Tikee Adoption 360",
  currency: process.env.REPORT_CURRENCY || "",
  timeZone: process.env.REPORT_TIMEZONE || "America/Guayaquil",
  types: (process.env.REPORT_TYPES || "weekly,monthly")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => ["weekly", "monthly"].includes(value)),
  maxDelayDays: Number.parseInt(process.env.REPORT_MAX_DELAY_DAYS || "10", 10) || 10,
  testRecipient: (process.env.REPORT_TEST_RECIPIENT || "").trim(),
  dryRun: flag(process.env.REPORT_DRY_RUN),
  outputDir: resolve(process.env.REPORT_OUTPUT_DIR || "report-preview"),
  // Solo para pruebas locales sin SharePoint (requiere REPORT_DRY_RUN).
  localDashboard: process.env.REPORT_DASHBOARD_FILE || "",
  localRecipients: process.env.REPORT_RECIPIENTS_FILE || "",
  today: process.env.REPORT_TODAY || ""
};

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
const useLocal = env.dryRun && env.localDashboard && env.localRecipients;

if (!useLocal) {
  const required = [
    ["MS_TENANT_ID", env.tenantId],
    ["MS_WORKER_CLIENT_ID", env.clientId],
    ["MS_WORKER_CLIENT_SECRET", env.clientSecret],
    ["SHAREPOINT_HOSTNAME", env.hostname],
    ["SHAREPOINT_SITE_PATH", env.sitePath],
    ...(env.dryRun ? [] : [["REPORT_SENDER_MAILBOX", env.mailbox]])
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Faltan variables o secretos: ${missing.join(", ")}`);
}
if (env.testRecipient && !EMAIL.test(env.testRecipient)) {
  throw new Error("REPORT_TEST_RECIPIENT no es un correo válido.");
}

let graph = null;
let store = null;
if (!useLocal) {
  graph = await createGraph(env);
  store = await openSharePoint(graph, env);
}

const readLocal = async (path) => JSON.parse(await readFile(resolve(path), "utf8"));
const dashboard = useLocal
  ? await readLocal(env.localDashboard)
  : await store.readJson("publicado/dashboard.json", { daily: {} });
const recipients = useLocal
  ? await readLocal(env.localRecipients)
  : await store.readJson("config/destinatarios.json", null);
const state = useLocal
  ? { sent: {} }
  : await store.readJson("estado/reportes-enviados.json", { sent: {} });
state.sent ||= {};

if (!recipients || !Array.isArray(recipients.clientes)) {
  throw new Error(
    `No existe ${env.dataRoot}/config/destinatarios.json o no tiene la lista "clientes".`
  );
}

const daily = dashboard.daily || {};
const today = env.today || todayIn(env.timeZone);
const generatedAt = new Intl.DateTimeFormat("es-EC", {
  timeZone: env.timeZone,
  dateStyle: "long",
  timeStyle: "short"
}).format(new Date());
const internalBcc = (recipients.copia_oculta_interna || []).filter((v) => EMAIL.test(v));
const replyTo = EMAIL.test(recipients.responder_a || "") ? [recipients.responder_a] : [];
const errors = [];
let sentCount = 0;

// IFI presentes en los datos que no tienen destinatarios configurados.
const configuredNames = recipients.clientes.flatMap((client) =>
  resolveIfiNames(daily, client.ifi, client.alias || [])
);
const recentDates = Object.keys(daily).sort().slice(-31);
const unconfigured = new Set();
for (const date of recentDates) {
  for (const name of Object.keys(daily[date]?.u || {})) {
    if (!configuredNames.includes(name)) unconfigured.add(name);
  }
}
if (unconfigured.size) {
  console.warn(`IFI sin destinatarios configurados: ${[...unconfigured].join(", ")}`);
}

for (const type of env.types) {
  const period = lastClosedPeriod(type, today);
  const deadline = new Date(`${period.end}T00:00:00Z`);
  deadline.setUTCDate(deadline.getUTCDate() + env.maxDelayDays);
  if (today > deadline.toISOString().slice(0, 10)) {
    console.log(`${type} ${period.key}: fuera de la ventana de envío; se omite.`);
    continue;
  }
  if (!isPeriodComplete(daily, period)) {
    console.log(`${type} ${period.key}: aún no llegan los datos del cierre; se reintentará.`);
    continue;
  }
  const previous = previousPeriod(period);
  const flagName = type === "weekly" ? "semanal" : "mensual";

  for (const client of recipients.clientes) {
    if (client.activo === false || client[flagName] === false) continue;
    const ifiName = String(client.ifi || "").trim();
    const stateKey = `${type}:${period.key}:${ifiName.toLowerCase()}`;
    if (!ifiName) {
      errors.push("Existe un cliente sin nombre de IFI en destinatarios.json.");
      continue;
    }
    if (state.sent[stateKey] && !env.testRecipient) continue;

    try {
      const to = (client.para || []).map((v) => String(v).trim()).filter(Boolean);
      const cc = (client.cc || []).map((v) => String(v).trim()).filter(Boolean);
      const invalid = [...to, ...cc].filter((value) => !EMAIL.test(value));
      if (!to.length) throw new Error("no tiene destinatarios en \"para\"");
      if (invalid.length) throw new Error(`correos inválidos: ${invalid.join(", ")}`);

      const names = resolveIfiNames(daily, ifiName, client.alias || []);
      if (!names.length) throw new Error("el nombre no coincide con ninguna IFI de dashboard.json");
      const displayName = String(client.nombre_visible || names[0]).trim();
      const current = aggregateIfi(daily, names, period);
      if (!current.daysWithData) {
        console.warn(`${type} ${period.key} / ${ifiName}: sin datos en el periodo; no se envía.`);
        continue;
      }
      const prior = aggregateIfi(daily, names, previous);
      const view = { ifiName: displayName, period, current, previous: prior, brand: env.brand, currency: env.currency, contact: recipients.contacto || "", generatedAt };
      const html = renderHtml(view);
      const pdf = renderPdf(view);
      const fileName = fileNameFor(period, displayName);
      const subject = subjectFor(period, displayName, env.brand);

      if (env.dryRun) {
        await mkdir(env.outputDir, { recursive: true });
        await writeFile(resolve(env.outputDir, fileName), pdf);
        await writeFile(resolve(env.outputDir, fileName.replace(/\.pdf$/, ".html")), html);
        console.log(`[simulación] ${subject} → ${to.join(", ")} (${fileName})`);
        continue;
      }

      const test = Boolean(env.testRecipient);
      await sendMail(graph, env.mailbox, {
        subject: test ? `[PRUEBA] ${subject}` : subject,
        html,
        to: test ? [env.testRecipient] : to,
        cc: test ? [] : cc,
        bcc: test ? [] : internalBcc,
        replyTo,
        attachments: [{ name: fileName, contentType: "application/pdf", content: pdf }]
      });
      sentCount += 1;
      if (test) {
        console.log(`[prueba] ${subject} → ${env.testRecipient}`);
        continue;
      }
      const archivePath = `reportes/${flagName}/${period.key}/${fileName}`;
      state.sent[stateKey] = {
        ifi: ifiName,
        type,
        period: period.key,
        to,
        cc,
        sent_at: new Date().toISOString(),
        archive: archivePath
      };
      state.updated_at = state.sent[stateKey].sent_at;
      // El estado se guarda tras cada envío para que un fallo no provoque reenvíos.
      await store.writeJson("estado/reportes-enviados.json", state);
      await store
        .writeBinary(archivePath, pdf, "application/pdf")
        .catch((error) => console.warn(`No se pudo archivar ${fileName}: ${error.message}`));
      console.log(`Enviado: ${subject} → ${to.join(", ")}`);
    } catch (error) {
      errors.push(`${type} ${period.key} / ${ifiName}: ${error.message}`);
    }
  }
}

console.log(`Reportes enviados: ${sentCount}.`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
