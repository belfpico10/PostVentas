// Periodos, agregación por IFI y render (HTML + PDF) del reporte a clientes.
// Lee el contrato de publicado/dashboard.json:
//   daily[YYYY-MM-DD].u[IFI] = [activos, activos_dia, total_usuarios]
//   daily[YYYY-MM-DD].t[IFI] = [num_web, num_movil, num_total, monto_web, monto_movil, monto_total]
//   daily[YYYY-MM-DD].p[IFI] = igual que t, para pagos de servicios
import { A4, PdfDocument } from "./pdf.mjs";

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];
const BRAND = "#30379f";

// ---------- Fechas (cadenas YYYY-MM-DD, sin zona horaria) ----------

function toDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = toDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

export function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function isoWeek(value) {
  const date = toDate(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function longDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

function shortDate(value) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

// Último periodo cerrado respecto a "today".
export function lastClosedPeriod(type, today) {
  if (type === "weekly") {
    const weekday = toDate(today).getUTCDay() || 7;
    const start = addDays(today, -(weekday - 1) - 7);
    const end = addDays(start, 6);
    return {
      type,
      key: isoWeek(start),
      start,
      end,
      label: `Semana del ${longDate(start)} al ${longDate(end)}`,
      shortLabel: `semana ${isoWeek(start).slice(-2)} (${shortDate(start)}–${shortDate(end)})`
    };
  }
  const [year, month] = today.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, month - 2, 1));
  const endDate = new Date(Date.UTC(year, month - 1, 0));
  const start = iso(startDate);
  const monthName = MONTHS[startDate.getUTCMonth()];
  return {
    type,
    key: start.slice(0, 7),
    start,
    end: iso(endDate),
    label: `${monthName[0].toUpperCase()}${monthName.slice(1)} ${startDate.getUTCFullYear()}`,
    shortLabel: `${monthName} ${startDate.getUTCFullYear()}`
  };
}

export function previousPeriod(period) {
  return lastClosedPeriod(period.type, period.start);
}

function lastWeekday(value) {
  let date = value;
  while ([0, 6].includes(toDate(date).getUTCDay())) date = addDays(date, -1);
  return date;
}

// Un periodo está completo cuando existe información desde su último día hábil
// en adelante (cubre feriados: basta con que llegue el siguiente reporte).
export function isPeriodComplete(daily, period) {
  const required = lastWeekday(period.end);
  return Object.keys(daily).some((date) => date >= required);
}

// ---------- Agregación ----------

function nameKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Devuelve el nombre exacto usado en dashboard.json para una IFI configurada.
export function resolveIfiNames(daily, configuredName, aliases = []) {
  const wanted = new Set([configuredName, ...aliases].map(nameKey));
  const found = new Set();
  for (const day of Object.values(daily)) {
    for (const block of ["u", "t", "p"]) {
      for (const name of Object.keys(day?.[block] || {})) {
        if (wanted.has(nameKey(name))) found.add(name);
      }
    }
  }
  return [...found];
}

function sumRows(target, row) {
  if (!Array.isArray(row)) return;
  row.forEach((value, index) => {
    target[index] += Number(value) || 0;
  });
}

export function aggregateIfi(daily, names, period) {
  const dates = Object.keys(daily)
    .filter((date) => date >= period.start && date <= period.end)
    .sort();
  const result = {
    daysWithData: 0,
    activeUsers: null,
    totalUsers: null,
    activeDaySum: 0,
    transfers: [0, 0, 0, 0, 0, 0],
    payments: [0, 0, 0, 0, 0, 0],
    days: []
  };
  for (const date of dates) {
    const day = daily[date] || {};
    const pick = (block) => {
      for (const name of names) if (day[block]?.[name]) return day[block][name];
      return null;
    };
    const users = pick("u");
    const transfers = pick("t");
    const payments = pick("p");
    if (!users && !transfers && !payments) continue;
    result.daysWithData += 1;
    if (users) {
      result.activeUsers = Number(users[0]) || 0;
      result.totalUsers = Number(users[2]) || 0;
      result.activeDaySum += Number(users[1]) || 0;
    }
    sumRows(result.transfers, transfers);
    sumRows(result.payments, payments);
    result.days.push({
      date,
      activeDay: users ? Number(users[1]) || 0 : 0,
      transfers: transfers ? [Number(transfers[2]) || 0, Number(transfers[5]) || 0] : [0, 0],
      payments: payments ? [Number(payments[2]) || 0, Number(payments[5]) || 0] : [0, 0]
    });
  }
  result.activeDayAverage = result.daysWithData
    ? result.activeDaySum / result.daysWithData
    : 0;
  result.adoption =
    result.totalUsers ? (result.activeUsers || 0) / result.totalUsers : null;
  return result;
}

// ---------- Formato ----------

const integerFormat = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 0 });
const amountFormat = new Intl.NumberFormat("es-EC", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatters(currency) {
  const prefix = currency ? `${currency} ` : "";
  return {
    int: (value) => (value == null ? "—" : integerFormat.format(value)),
    amount: (value) => (value == null ? "—" : `${prefix}${amountFormat.format(value)}`),
    pct: (value) => (value == null ? "—" : `${amountFormat.format(value * 100)}%`),
    delta: (current, previous) => {
      if (previous == null || !Number.isFinite(previous) || previous === 0) return "—";
      const change = (current - previous) / previous;
      return `${change >= 0 ? "+" : ""}${amountFormat.format(change * 100)}%`;
    }
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function metricRows(current, previous, fmt) {
  const prev = previous?.daysWithData ? previous : null;
  return [
    ["Usuarios activos (al cierre)", fmt.int(current.activeUsers), fmt.delta(current.activeUsers, prev?.activeUsers)],
    ["Total de usuarios (al cierre)", fmt.int(current.totalUsers), fmt.delta(current.totalUsers, prev?.totalUsers)],
    ["Tasa de adopción", fmt.pct(current.adoption), "—"],
    ["Promedio diario de usuarios activos", fmt.int(Math.round(current.activeDayAverage)), fmt.delta(current.activeDayAverage, prev?.activeDayAverage)],
    ["Transferencias – número", fmt.int(current.transfers[2]), fmt.delta(current.transfers[2], prev?.transfers[2])],
    ["Transferencias – monto", fmt.amount(current.transfers[5]), fmt.delta(current.transfers[5], prev?.transfers[5])],
    ["Pagos de servicios – número", fmt.int(current.payments[2]), fmt.delta(current.payments[2], prev?.payments[2])],
    ["Pagos de servicios – monto", fmt.amount(current.payments[5]), fmt.delta(current.payments[5], prev?.payments[5])]
  ];
}

function channelRows(current, fmt) {
  return [
    ["Transferencias", fmt.int(current.transfers[0]), fmt.amount(current.transfers[3]), fmt.int(current.transfers[1]), fmt.amount(current.transfers[4])],
    ["Pagos de servicios", fmt.int(current.payments[0]), fmt.amount(current.payments[3]), fmt.int(current.payments[1]), fmt.amount(current.payments[4])]
  ];
}

export function subjectFor(period, ifiName, brand) {
  const kind = period.type === "weekly" ? "Reporte semanal" : "Reporte mensual";
  return `${kind} ${brand} – ${ifiName} – ${period.shortLabel}`;
}

export function fileNameFor(period, ifiName) {
  const safe = ifiName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `${period.type === "weekly" ? "semanal" : "mensual"}-${period.key}-${safe}.pdf`;
}

// ---------- HTML ----------

export function renderHtml({ ifiName, period, current, previous, brand, currency, contact }) {
  const fmt = formatters(currency);
  const kind = period.type === "weekly" ? "semanal" : "mensual";
  const prevLabel = period.type === "weekly" ? "vs. semana anterior" : "vs. mes anterior";
  const cell = "padding:8px 10px;border-bottom:1px solid #eef0f5;font-size:13px;";
  const num = `${cell}text-align:right;white-space:nowrap;`;
  const head = "padding:8px 10px;background:#f4f6fb;color:#667085;font-size:11px;text-transform:uppercase;text-align:left;";
  const metrics = metricRows(current, previous, fmt)
    .map(([label, value, delta]) => `<tr><td style="${cell}">${escapeHtml(label)}</td><td style="${num}font-weight:700;">${escapeHtml(value)}</td><td style="${num}color:#667085;">${escapeHtml(delta)}</td></tr>`)
    .join("");
  const channels = channelRows(current, fmt)
    .map((row) => `<tr>${row.map((value, index) => `<td style="${index ? num : cell}">${escapeHtml(value)}</td>`).join("")}</tr>`)
    .join("");
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f6fa;font-family:Segoe UI,Arial,sans-serif;color:#172033;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border:1px solid #e3e7f1;border-radius:12px;">
<tr><td style="background:${BRAND};color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;">
<div style="font-size:11px;letter-spacing:.08em;font-weight:700;text-transform:uppercase;opacity:.85;">${escapeHtml(brand)} · Reporte ${kind}</div>
<div style="font-size:20px;font-weight:700;margin-top:4px;">${escapeHtml(ifiName)}</div>
<div style="font-size:13px;margin-top:2px;opacity:.9;">${escapeHtml(period.label)}</div></td></tr>
<tr><td style="padding:20px 24px;">
<p style="font-size:13px;color:#475467;margin:0 0 14px;">Estimado equipo de ${escapeHtml(ifiName)}: compartimos el resumen ${kind} de adopción y transaccionalidad de canales electrónicos. El detalle diario se encuentra en el PDF adjunto.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><th style="${head}">Indicador</th><th style="${head}text-align:right;">Valor</th><th style="${head}text-align:right;">${prevLabel}</th></tr>${metrics}</table>
<h3 style="color:${BRAND};font-size:14px;margin:22px 0 8px;">Por canal</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><th style="${head}"></th><th style="${head}text-align:right;">Web #</th><th style="${head}text-align:right;">Web monto</th><th style="${head}text-align:right;">Móvil #</th><th style="${head}text-align:right;">Móvil monto</th></tr>${channels}</table>
<p style="font-size:11px;color:#8a93a6;margin:18px 0 0;">Días con información en el periodo: ${current.daysWithData}. Usuarios activos y total de usuarios corresponden al último día con información.${contact ? ` Consultas: ${escapeHtml(contact)}.` : ""}</p>
</td></tr></table></td></tr></table></body></html>`;
}

// ---------- PDF ----------

export function renderPdf({ ifiName, period, current, previous, brand, currency, generatedAt }) {
  const fmt = formatters(currency);
  const pdf = new PdfDocument();
  const margin = 42;
  const right = A4.width - margin;
  const kind = period.type === "weekly" ? "semanal" : "mensual";
  let y = 0;

  const header = () => {
    pdf.rect(0, 0, A4.width, 92, BRAND);
    pdf.text(margin, 30, `${brand.toUpperCase()} · REPORTE ${kind.toUpperCase()}`, { size: 9, bold: true, color: "#ffffff" });
    pdf.text(margin, 56, ifiName, { size: 18, bold: true, color: "#ffffff" });
    pdf.text(margin, 76, period.label, { size: 11, color: "#ffffff" });
    y = 122;
  };
  const ensure = (height) => {
    if (y + height > A4.height - 50) {
      pdf.addPage();
      header();
    }
  };
  const table = (columns, rows, { boldFirst = false } = {}) => {
    ensure(22);
    pdf.rect(margin, y, right - margin, 20, "#f4f6fb");
    columns.forEach((column) => {
      pdf.text(column.align === "right" ? column.x : column.x + 6, y + 13.5, column.title, {
        size: 8, bold: true, color: "#667085", align: column.align || "left"
      });
    });
    y += 20;
    for (const row of rows) {
      ensure(18);
      row.forEach((value, index) => {
        const column = columns[index];
        pdf.text(column.align === "right" ? column.x : column.x + 6, y + 12.5, value, {
          size: 9, bold: boldFirst && index === 1, color: index === 2 && boldFirst ? "#667085" : "#172033",
          align: column.align || "left"
        });
      });
      y += 18;
      pdf.line(margin, y, right, y);
    }
    y += 14;
  };
  const title = (value) => {
    ensure(40);
    y += 6;
    pdf.text(margin, y, value, { size: 12, bold: true, color: BRAND });
    y += 12;
  };

  header();
  title("Resumen del periodo");
  table(
    [
      { title: "INDICADOR", x: margin },
      { title: "VALOR", x: right - 120, align: "right" },
      { title: period.type === "weekly" ? "VS. SEMANA ANTERIOR" : "VS. MES ANTERIOR", x: right - 6, align: "right" }
    ],
    metricRows(current, previous, fmt),
    { boldFirst: true }
  );

  title("Por canal");
  table(
    [
      { title: "", x: margin },
      { title: "WEB #", x: margin + 205, align: "right" },
      { title: "WEB MONTO", x: margin + 300, align: "right" },
      { title: "MÓVIL #", x: margin + 385, align: "right" },
      { title: "MÓVIL MONTO", x: right - 6, align: "right" }
    ],
    channelRows(current, fmt)
  );

  title("Detalle diario");
  table(
    [
      { title: "FECHA", x: margin },
      { title: "ACTIVOS DÍA", x: margin + 150, align: "right" },
      { title: "TRANSF. #", x: margin + 220, align: "right" },
      { title: "TRANSF. MONTO", x: margin + 330, align: "right" },
      { title: "PAGOS #", x: margin + 395, align: "right" },
      { title: "PAGOS MONTO", x: right - 6, align: "right" }
    ],
    current.days.map((day) => [
      day.date.split("-").reverse().join("/"),
      fmt.int(day.activeDay),
      fmt.int(day.transfers[0]),
      fmt.amount(day.transfers[1]),
      fmt.int(day.payments[0]),
      fmt.amount(day.payments[1])
    ])
  );

  ensure(30);
  pdf.text(margin, y, `Días con información: ${current.daysWithData}. Usuarios activos y total corresponden al último día con información.`, { size: 8, color: "#8a93a6" });
  pdf.text(margin, y + 12, `Generado automáticamente el ${generatedAt}.`, { size: 8, color: "#8a93a6" });

  const total = pdf.pages.length;
  pdf.pages.forEach((commands, index) => {
    pdf.current = commands;
    pdf.text(right, A4.height - 24, `Página ${index + 1} de ${total}`, { size: 8, color: "#98a2b3", align: "right" });
  });
  return pdf.toBuffer();
}
