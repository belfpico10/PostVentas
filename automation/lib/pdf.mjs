// Generador PDF mínimo sin dependencias: A4 vertical, Helvetica (WinAnsi),
// texto, rectángulos y líneas. Suficiente para reportes tabulares.

export const A4 = { width: 595.28, height: 841.89 };

// Anchos AFM de Helvetica para los caracteres más frecuentes en cifras.
const WIDTHS = {
  " ": 278, ".": 278, ",": 278, "-": 333, "%": 889, "+": 584, "$": 556,
  "(": 333, ")": 333, "/": 278, ":": 278, "—": 1000, "–": 556
};
for (const digit of "0123456789") WIDTHS[digit] = 556;

export function textWidth(text, size, bold = false) {
  let units = 0;
  for (const char of String(text)) {
    units += WIDTHS[char] ?? (char === char.toUpperCase() ? (bold ? 722 : 667) : bold ? 611 : 556);
  }
  return (units / 1000) * size;
}

function hexColor(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4]
    .map((index) => (parseInt(value.slice(index, index + 2), 16) / 255).toFixed(3))
    .join(" ");
}

// WinAnsi: Latin-1 más guiones tipográficos en 0x96/0x97.
function encodeText(text) {
  const bytes = [];
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    let byte;
    if (char === "–") byte = 0x96;
    else if (char === "—") byte = 0x97;
    else if (char === "•") byte = 0x95;
    else if (code < 256) byte = code;
    else byte = 0x3f;
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) bytes.push(0x5c);
    bytes.push(byte);
  }
  return Buffer.from(bytes).toString("latin1");
}

export class PdfDocument {
  constructor() {
    this.pages = [];
    this.addPage();
  }

  addPage() {
    this.current = [];
    this.pages.push(this.current);
  }

  // Coordenadas con origen arriba-izquierda para facilitar el layout.
  text(x, y, value, { size = 10, bold = false, color = "#172033", align = "left" } = {}) {
    let left = x;
    if (align === "right") left = x - textWidth(value, size, bold);
    else if (align === "center") left = x - textWidth(value, size, bold) / 2;
    this.current.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${hexColor(color)} rg ${left.toFixed(2)} ${(
        A4.height - y
      ).toFixed(2)} Td (${encodeText(value)}) Tj ET`
    );
  }

  rect(x, y, width, height, color) {
    this.current.push(
      `${hexColor(color)} rg ${x.toFixed(2)} ${(A4.height - y - height).toFixed(
        2
      )} ${width.toFixed(2)} ${height.toFixed(2)} re f`
    );
  }

  line(x1, y1, x2, y2, color = "#e3e7f1", width = 0.6) {
    this.current.push(
      `${hexColor(color)} RG ${width} w ${x1.toFixed(2)} ${(A4.height - y1).toFixed(
        2
      )} m ${x2.toFixed(2)} ${(A4.height - y2).toFixed(2)} l S`
    );
  }

  toBuffer() {
    const objects = [];
    const add = (body) => {
      objects.push(body);
      return objects.length;
    };
    const catalogId = add(null);
    const pagesId = add(null);
    const fontRegular = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    );
    const fontBold = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    );
    const pageIds = this.pages.map((commands) => {
      const stream = commands.join("\n");
      const contentId = add(
        `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`
      );
      return add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] ` +
          `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
          `/Contents ${contentId} 0 R >>`
      );
    });
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] /Count ${pageIds.length} >>`;

    let output = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
    const offsets = [];
    objects.forEach((body, index) => {
      offsets.push(Buffer.byteLength(output, "latin1"));
      output += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(output, "latin1");
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) output += `${String(offset).padStart(10, "0")} 00000 n \n`;
    output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(output, "latin1");
  }
}
