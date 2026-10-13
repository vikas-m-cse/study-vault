export function buildWordXmlForTest(title: string, text: string): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<w:document><w:p><w:t>${escape(title)}</w:t></w:p><w:p><w:t>${escape(text)}</w:t></w:p></w:document>`;
}
export function extractPdfTextFromContentForTest(content: string): string {
  const found: string[] = [];
  const pattern = /\(((?:\\.|[^\\)])*)\)\s*Tj|<([0-9a-fA-F\s]+)>\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    if (match[1] !== undefined) found.push(match[1].replace(/\\([0-7]{1,3})/g, (_m, octal: string) => String.fromCharCode(parseInt(octal, 8))).replace(/\\([nrtbf()\\])/g, "$1"));
    else if (match[2] !== undefined) {
      const hex = match[2].replace(/\s/g, "");
      let value = "";
      for (let i = 0; i + 1 < hex.length; i += 2) value += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      found.push(value);
    }
  }
  return found.join("\n");
}
