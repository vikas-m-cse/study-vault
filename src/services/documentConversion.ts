import type { Note } from "../types/note";

export type ConversionNote = Pick<Note, "id" | "title" | "plainText" | "updatedAt">;

export function escapeWordText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function safeFilename(value: string): string {
  return (value.trim() || "StudyVault document").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 100);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: { name: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const u16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true);
  const u32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true);
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0);
    u16(lv, 10, 0); u16(lv, 12, 0); u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length);
    u16(lv, 26, name.length); u16(lv, 28, 0);
    local.set(name, 30); local.set(data, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0);
    u16(cv, 12, 0); u16(cv, 14, 0); u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length);
    u16(cv, 28, name.length); u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0);
    u32(cv, 38, 0); u32(cv, 42, offset); central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 4, 0); u16(ev, 6, 0); u16(ev, 8, files.length); u16(ev, 10, files.length);
  u32(ev, 12, centralSize); u32(ev, 16, offset); u16(ev, 20, 0);
  const result = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, end]) { result.set(part, cursor); cursor += part.length; }
  return result;
}

export function exportWord(title: string, text: string): void {
  const paragraphs = text.split(/\r?\n/).map((line) => {
    const content = line.trim() ? `<w:r><w:t xml:space="preserve">${escapeWordText(line)}</w:t></w:r>` : "<w:r><w:br/></w:r>";
    return `<w:p>${content}</w:p>`;
  }).join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${escapeWordText(title)}</w:t></w:r></w:p>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const bytes = zipStore([
    { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
    { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: "word/document.xml", content: documentXml },
    { name: "word/styles.xml", content: '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>' },
    { name: "word/_rels/document.xml.rels", content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>' },
  ]);
  downloadBlob(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), `${safeFilename(title)}.docx`);
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7e]/g, "?");
}

export function exportPdf(title: string, text: string): void {
  const lines: string[] = [];
  const wrap = (value: string, width: number) => {
    const words = value.split(/\s+/);
    let line = "";
    for (const word of words) {
      if (line && line.length + word.length + 1 > width) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  };
  wrap(title, 78);
  lines.push("");
  text.split(/\r?\n/).forEach((line) => line.trim() ? wrap(line, 92) : lines.push(""));
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 48) pages.push(lines.slice(i, i + 48));
  if (!pages.length) pages.push([]);
  const objects: string[] = [];
  const pageIds: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((page, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    const stream = `BT /F1 10 Tf 54 788 Td 14 TL ${page.map((line) => `(${pdfEscape(line)}) Tj T*`).join(" ")} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadBlob(new Blob([pdf], { type: "application/pdf" }), `${safeFilename(title)}.pdf`);
}

function decodePdfLiteral(value: string): string {
  return value.replace(/\\([nrtbf()\\])/g, (_match, char: string) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }[char] ?? char))
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

export function extractPdfTextOperators(content: string): string[] {
  const found: string[] = [];
  const tokenPattern = /\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:.|\n)*?)\]\s*TJ|<([0-9a-fA-F\s]+)>\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(content))) {
    if (match[1] !== undefined) found.push(decodePdfLiteral(match[1]));
    else if (match[2] !== undefined) {
      const pieces = match[2].match(/\(((?:\\.|[^\\)])*)\)|<([0-9a-fA-F\s]+)>/g) ?? [];
      found.push(pieces.map((piece) => piece.startsWith("(") ? decodePdfLiteral(piece.slice(1, -1)) : decodeHex(piece.slice(1, -1))).join(""));
    } else if (match[3] !== undefined) found.push(decodeHex(match[3]));
  }
  return found;
}

function decodeHex(value: string): string {
  const clean = value.replace(/\s/g, "");
  let result = "";
  for (let i = 0; i + 1 < clean.length; i += 2) result += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  return result.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const raw = new TextDecoder("latin1").decode(bytes);
  if (!raw.startsWith("%PDF-")) throw new Error("This file does not look like a PDF.");
  const streamTexts: string[] = [];
  const streamRegex = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(raw))) {
    const start = streamRegex.lastIndex;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    let streamBytes = bytes.slice(start, end);
    if (raw.slice(Math.max(0, match.index - 500), match.index).includes("/FlateDecode")) {
      if (typeof DecompressionStream === "undefined") continue;
      try {
        const decompressed = new Blob([streamBytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
        streamBytes = new Uint8Array(await new Response(decompressed).arrayBuffer());
      } catch { streamRegex.lastIndex = end + 9; continue; }
    }
    const stream = new TextDecoder("latin1").decode(streamBytes);
    if (/\bBT\b/.test(stream)) streamTexts.push(...extractPdfTextOperators(stream));
    streamRegex.lastIndex = end + 9;
  }
  const result = streamTexts.join("\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").trim();
  if (!result) throw new Error("No extractable text was found. This PDF may be scanned, encrypted, or use unsupported font encoding. OCR is not included in this local converter.");
  return result;
}
