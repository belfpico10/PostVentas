import { createHash } from "node:crypto";
import {
  monthlyFileName,
  monthlyFromDaily,
  normalizedToDaily,
  trimDailyMonths
} from "./lib/dashboard.mjs";
import { reportSchema } from "./lib/report-schema.mjs";

const env = {
  tenantId: process.env.MS_TENANT_ID || "",
  clientId: process.env.MS_WORKER_CLIENT_ID || "",
  clientSecret: process.env.MS_WORKER_CLIENT_SECRET || "",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
  hostname: process.env.SHAREPOINT_HOSTNAME || "",
  sitePath: process.env.SHAREPOINT_SITE_PATH || "",
  library: process.env.SHAREPOINT_LIBRARY || "Documentos",
  dataRoot: process.env.SHAREPOINT_DATA_ROOT || "Tikee Adoption 360",
  dataMonths: Math.min(
    Math.max(Number.parseInt(process.env.DATA_MONTHS || "24", 10) || 24, 1),
    36
  ),
  allowedSender: (process.env.ALLOWED_OUTLOOK_SENDER || "").toLowerCase().trim(),
  allowedSubject: (process.env.ALLOWED_OUTLOOK_SUBJECT || "").trim()
};

const required = [
  ["MS_TENANT_ID", env.tenantId],
  ["MS_WORKER_CLIENT_ID", env.clientId],
  ["MS_WORKER_CLIENT_SECRET", env.clientSecret],
  ["ANTHROPIC_API_KEY", env.anthropicKey],
  ["SHAREPOINT_HOSTNAME", env.hostname],
  ["SHAREPOINT_SITE_PATH", env.sitePath]
];
const missing = required.filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  throw new Error(`Faltan variables o secretos: ${missing.join(", ")}`);
}

let graphToken = "";
let driveId = "";

function normalize(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  if (value && typeof value === "object") {
    value =
      value.address ||
      value.email ||
      (value.emailAddress && value.emailAddress.address) ||
      value.mail ||
      "";
  }
  const raw = normalize(value).toLowerCase();
  const bracketed = raw.match(/<([^>]+)>/);
  return normalize(bracketed ? bracketed[1] : raw);
}

function bodyContent(value) {
  if (value && typeof value === "object") {
    return normalize(value.content || value.body || value.value);
  }
  return normalize(value);
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeFilePart(value) {
  return normalize(value)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function encodePath(path) {
  return path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

async function graphRequest(path, options = {}) {
  const response = await fetch(
    /^https:\/\//i.test(path)
      ? path
      : `https://graph.microsoft.com/v1.0${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${graphToken}`,
        ...(options.headers || {})
      }
    }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(
      payload?.error?.message ||
        `Microsoft Graph respondió con código ${response.status}.`
    );
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }
  return response;
}

async function graphJson(path, options = {}) {
  const response = await graphRequest(path, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });
  return response.json();
}

async function tokenForGraph() {
  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials"
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(
      env.tenantId
    )}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        "Microsoft Entra no entregó un token para Microsoft Graph."
    );
  }
  return payload.access_token;
}

async function resolveDrive() {
  const site = await graphJson(
    `/sites/${env.hostname}:${env.sitePath}?$select=id,displayName,webUrl`
  );
  const drives = await graphJson(
    `/sites/${encodeURIComponent(site.id)}/drives?$select=id,name,webUrl`
  );
  const drive = (drives.value || []).find(
    (item) => normalize(item.name).toLowerCase() === env.library.toLowerCase()
  );
  if (!drive) {
    throw new Error(
      `No se encontró la biblioteca “${env.library}” en ${site.displayName}.`
    );
  }
  return drive.id;
}

async function ensureFolderPath(relativePath) {
  let parent = await graphJson(
    `/drives/${encodeURIComponent(driveId)}/root?$select=id`
  );
  const parts = relativePath
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  for (const part of parts) {
    const children = await graphJson(
      `/drives/${encodeURIComponent(
        driveId
      )}/items/${encodeURIComponent(parent.id)}/children?$select=id,name,folder`
    );
    let child = (children.value || []).find(
      (item) =>
        item.folder &&
        normalize(item.name).toLowerCase() === normalize(part).toLowerCase()
    );
    if (!child) {
      try {
        child = await graphJson(
          `/drives/${encodeURIComponent(
            driveId
          )}/items/${encodeURIComponent(parent.id)}/children`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: part,
              folder: {},
              "@microsoft.graph.conflictBehavior": "fail"
            })
          }
        );
      } catch (error) {
        if (error.status !== 409) throw error;
        const refreshed = await graphJson(
          `/drives/${encodeURIComponent(
            driveId
          )}/items/${encodeURIComponent(parent.id)}/children?$select=id,name,folder`
        );
        child = (refreshed.value || []).find(
          (item) =>
            item.folder &&
            normalize(item.name).toLowerCase() === normalize(part).toLowerCase()
        );
        if (!child) throw error;
      }
    }
    parent = child;
  }
  return parent;
}

async function listFolder(relativePath) {
  const folder = await ensureFolderPath(relativePath);
  const items = [];
  let next =
    `/drives/${encodeURIComponent(
      driveId
    )}/items/${encodeURIComponent(folder.id)}/children?$select=id,name,file,size,lastModifiedDateTime`;
  while (next) {
    const page = await graphJson(next);
    items.push(...(page.value || []));
    next = page["@odata.nextLink"] || "";
  }
  return items;
}

async function downloadItem(itemId) {
  const response = await graphRequest(
    `/drives/${encodeURIComponent(
      driveId
    )}/items/${encodeURIComponent(itemId)}/content`
  );
  return response.text();
}

async function readJson(relativePath, fallback) {
  try {
    const response = await graphRequest(
      `/drives/${encodeURIComponent(driveId)}/root:/${encodePath(
        `${env.dataRoot}/${relativePath}`
      )}:/content`
    );
    return await response.json();
  } catch (error) {
    if (error.status === 404) return fallback;
    throw error;
  }
}

async function writeJson(relativePath, payload) {
  const fullPath = `${env.dataRoot}/${relativePath}`.replace(
    /^\/+|\/+$/g,
    ""
  );
  const parentPath = fullPath.split("/").slice(0, -1).join("/");
  await ensureFolderPath(parentPath);
  await graphRequest(
    `/drives/${encodeURIComponent(driveId)}/root:/${encodePath(
      fullPath
    )}:/content`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: `${JSON.stringify(payload, null, 2)}\n`
    }
  );
}

async function moveItem(item, relativeFolder) {
  const folder = await ensureFolderPath(`${env.dataRoot}/${relativeFolder}`);
  await graphJson(
    `/drives/${encodeURIComponent(
      driveId
    )}/items/${encodeURIComponent(item.id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentReference: { id: folder.id },
        name: item.name,
        "@microsoft.graph.conflictBehavior": "rename"
      })
    }
  );
}

function parseEnvelope(fileName, rawContent) {
  if (/\.json$/i.test(fileName)) {
    const parsed = JSON.parse(rawContent);
    return {
      messageId: normalize(parsed.message_id || parsed.messageId || fileName),
      sender: normalizeEmail(parsed.sender || parsed.from),
      subject: normalize(parsed.subject),
      receivedAt: normalize(
        parsed.received_at || parsed.receivedDateTime || parsed.receivedAt
      ),
      body: bodyContent(
        parsed.body_html ||
          parsed.body_text ||
          parsed.body ||
          parsed.content ||
          ""
      )
    };
  }
  return {
    messageId: fileName,
    sender: "",
    subject: "",
    receivedAt: "",
    body: rawContent
  };
}

function validateEnvelope(envelope) {
  if (!envelope.body) throw new Error("El archivo no contiene el cuerpo del correo.");
  if (envelope.body.length > 800000) {
    throw new Error("El cuerpo del correo supera el límite de 800.000 caracteres.");
  }
  if (env.allowedSender && envelope.sender !== env.allowedSender) {
    throw new Error(
      `Remitente no autorizado: ${envelope.sender || "sin remitente"}.`
    );
  }
  if (env.allowedSubject && envelope.subject !== env.allowedSubject) {
    throw new Error(
      `Asunto no autorizado: ${envelope.subject || "sin asunto"}.`
    );
  }
}

function validatePayload(payload) {
  const blocking = [];
  const warnings = Array.isArray(payload?.advertencias)
    ? payload.advertencias.map(normalize).filter(Boolean)
    : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalize(payload?.fecha_emision))) {
    blocking.push("La fecha de emisión no tiene formato YYYY-MM-DD.");
  } else if (
    Number.isNaN(
      new Date(`${normalize(payload.fecha_emision)}T00:00:00Z`).getTime()
    )
  ) {
    blocking.push("La fecha de emisión no es válida.");
  }

  const blocks = [
    ["usuarios", payload?.usuarios],
    ["transferencias", payload?.transferencias],
    ["pagos de servicios", payload?.pagos_servicios]
  ];

  for (const [label, rows] of blocks) {
    if (!Array.isArray(rows) || !rows.length) {
      blocking.push(`No se detectaron filas en el bloque ${label}.`);
      continue;
    }
    const seen = new Set();
    for (const row of rows) {
      const name = normalize(row?.nombre_ifi);
      const key = name.toLowerCase().replace(/\s+/g, " ");
      if (!name) blocking.push(`Existe una fila sin IFI en ${label}.`);
      if (key && seen.has(key)) {
        blocking.push(`La IFI “${name}” está duplicada en ${label}.`);
      }
      seen.add(key);
      for (const [field, value] of Object.entries(row || {})) {
        if (field === "nombre_ifi") continue;
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0) {
          blocking.push(`Valor inválido en ${label}: ${name} / ${field}.`);
        }
      }
    }
  }

  const sets = blocks
    .filter(([, rows]) => Array.isArray(rows) && rows.length)
    .map(([label, rows]) => ({
      label,
      names: new Set(
        rows.map((row) =>
          normalize(row.nombre_ifi).toLowerCase().replace(/\s+/g, " ")
        )
      )
    }));
  if (sets.length === 3) {
    for (const set of sets.slice(1)) {
      const missing = [...sets[0].names].filter(
        (name) => !set.names.has(name)
      );
      if (missing.length) {
        warnings.push(
          `${set.label}: faltan ${missing.length} IFI(s) presentes en usuarios.`
        );
      }
    }
  }

  payload.advertencias = [...new Set(warnings)];
  if (blocking.length) throw new Error(blocking.join(" "));
}

async function parseWithClaude(emailBody) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.anthropicKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: env.anthropicModel,
      max_tokens: 20000,
      system:
        "Eres un procesador de datos de Tikee. Extrae fielmente las tres tablas del reporte diario de canales electrónicos. No inventes valores. Convierte separadores de miles y decimales al formato numérico correcto. Si una celda está vacía, usa 0 y registra una advertencia. Conserva el nombre de cada IFI. Devuelve exclusivamente el objeto solicitado por el esquema.",
      messages: [
        {
          role: "user",
          content:
            "Extrae el reporte recibido por correo. Debe contener Usuarios Activos, Transferencias y Pagos de servicios. Texto del correo:\n\n" +
            emailBody
        }
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: reportSchema
        }
      }
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Claude API respondió ${response.status}: ${
        result?.error?.message || "error sin detalle"
      }`
    );
  }
  if (result.stop_reason === "refusal") {
    throw new Error("Claude rechazó procesar el contenido del correo.");
  }
  if (result.stop_reason === "max_tokens") {
    throw new Error("La respuesta de Claude se truncó por límite de tokens.");
  }
  const textBlock = (result.content || []).find((item) => item.type === "text");
  if (!textBlock?.text) {
    throw new Error("Claude no devolvió un objeto JSON procesable.");
  }
  return {
    payload: JSON.parse(textBlock.text),
    model: result.model || env.anthropicModel,
    inputTokens: result.usage?.input_tokens ?? null,
    outputTokens: result.usage?.output_tokens ?? null
  };
}

function ingestionRecord(envelope, item, status, details = {}) {
  return {
    source_file: item.name,
    source_item_id: item.id,
    message_id: envelope.messageId || item.name,
    sender: envelope.sender,
    subject: envelope.subject,
    received_at: envelope.receivedAt || item.lastModifiedDateTime,
    processed_at: new Date().toISOString(),
    status,
    report_date: details.payload?.fecha_emision || null,
    rows_users: details.payload?.usuarios?.length || 0,
    rows_transfers: details.payload?.transferencias?.length || 0,
    rows_service_payments: details.payload?.pagos_servicios?.length || 0,
    warnings: details.payload?.advertencias || [],
    model_id: details.model || null,
    input_tokens: details.inputTokens ?? null,
    output_tokens: details.outputTokens ?? null,
    body_hash: details.bodyHash || null,
    error_message: details.error || null
  };
}

graphToken = await tokenForGraph();
driveId = await resolveDrive();
await ensureFolderPath(`${env.dataRoot}/entrada`);

const state = await readJson("estado/procesados.json", {
  updated_at: null,
  items: []
});
const dashboard = await readJson("publicado/dashboard.json", {
  generated_at: null,
  monthly: {},
  daily: {},
  ingestions: []
});
const origins = await readJson("config/origenes.json", {});
const knownIds = new Set((state.items || []).map((item) => item.source_item_id));
const knownMessages = new Set(
  (state.items || []).map((item) => item.message_id).filter(Boolean)
);
const knownHashes = new Set(
  (state.items || []).map((item) => item.body_hash).filter(Boolean)
);

const inputItems = (await listFolder(`${env.dataRoot}/entrada`))
  .filter((item) => item.file && /\.(json|txt|html?)$/i.test(item.name))
  .sort((left, right) =>
    String(left.lastModifiedDateTime).localeCompare(right.lastModifiedDateTime)
  );

if (!inputItems.length) {
  console.log("Sin correos pendientes en SharePoint. Claude no fue invocado.");
  process.exit(0);
}

let changed = false;
const pendingMoves = [];
for (const item of inputItems) {
  let envelope = {
    messageId: item.name,
    sender: "",
    subject: "",
    receivedAt: item.lastModifiedDateTime,
    body: ""
  };
  let bodyHash = null;
  try {
    const rawContent = await downloadItem(item.id);
    envelope = parseEnvelope(item.name, rawContent);
    validateEnvelope(envelope);
    const cleanBody = /<[^>]+>/.test(envelope.body)
      ? htmlToText(envelope.body)
      : envelope.body;
    bodyHash = hash(
      `${envelope.sender}\n${envelope.subject}\n${cleanBody}`.normalize("NFKC")
    );

    if (
      knownIds.has(item.id) ||
      knownMessages.has(envelope.messageId) ||
      knownHashes.has(bodyHash)
    ) {
      await moveItem(item, "procesado/entrada/duplicados");
      console.log(`Duplicado omitido: ${item.name}`);
      continue;
    }

    const claude = await parseWithClaude(cleanBody);
    validatePayload(claude.payload);
    const reportDate = claude.payload.fecha_emision;
    dashboard.daily[reportDate] = normalizedToDaily(claude.payload);
    const normalizedPath = `procesado/diario/${reportDate.slice(
      0,
      4
    )}/${reportDate.slice(5, 7)}/${reportDate}__${bodyHash.slice(0, 12)}.json`;
    await writeJson(normalizedPath, {
      source: {
        message_id: envelope.messageId,
        sender: envelope.sender,
        subject: envelope.subject,
        received_at: envelope.receivedAt,
        sharepoint_item_id: item.id,
        body_hash: bodyHash
      },
      extraction: {
        processed_at: new Date().toISOString(),
        model: claude.model,
        input_tokens: claude.inputTokens,
        output_tokens: claude.outputTokens
      },
      report: claude.payload
    });

    const record = ingestionRecord(envelope, item, "processed", {
      ...claude,
      bodyHash
    });
    state.items.push(record);
    dashboard.ingestions = [record, ...(dashboard.ingestions || [])].slice(
      0,
      100
    );
    knownIds.add(item.id);
    knownMessages.add(envelope.messageId);
    knownHashes.add(bodyHash);
    pendingMoves.push({
      item,
      folder: `procesado/entrada/${reportDate.slice(0, 4)}/${reportDate.slice(
        5,
        7
      )}`
    });
    changed = true;
    console.log(
      `Procesado: ${item.name} → ${reportDate} (${record.rows_users} IFI usuarios).`
    );
  } catch (error) {
    const record = ingestionRecord(envelope, item, "failed", {
      bodyHash,
      error: error.message
    });
    state.items.push(record);
    dashboard.ingestions = [record, ...(dashboard.ingestions || [])].slice(
      0,
      100
    );
    knownIds.add(item.id);
    if (envelope.messageId) knownMessages.add(envelope.messageId);
    if (bodyHash) knownHashes.add(bodyHash);
    pendingMoves.push({ item, folder: "rechazado" });
    changed = true;
    console.error(`Rechazado: ${item.name}: ${error.message}`);
  }
}

if (changed) {
  dashboard.daily = trimDailyMonths(dashboard.daily || {}, env.dataMonths);
  dashboard.monthly = monthlyFromDaily(dashboard.daily, origins);
  dashboard.generated_at = new Date().toISOString();
  dashboard.source = {
    system: "SharePoint + Outlook + Claude",
    data_months: env.dataMonths,
    site: `${env.hostname}${env.sitePath}`,
    library: env.library,
    data_root: env.dataRoot
  };
  state.updated_at = dashboard.generated_at;
  state.items = (state.items || []).slice(-2000);

  for (const [label, data] of Object.entries(dashboard.monthly)) {
    await writeJson(`consolidado/mensual/${monthlyFileName(label)}`, {
      generated_at: dashboard.generated_at,
      month: label,
      data
    });
  }
  await writeJson("publicado/dashboard.json", dashboard);
  await writeJson("estado/procesados.json", state);
  for (const move of pendingMoves) {
    await moveItem(move.item, move.folder).catch((error) => {
      console.warn(
        `No se pudo archivar ${move.item.name}; se reintentará: ${error.message}`
      );
    });
  }
  console.log(
    `Consolidado actualizado: ${Object.keys(dashboard.daily).length} días y ${
      Object.keys(dashboard.monthly).length
    } meses.`
  );
}
