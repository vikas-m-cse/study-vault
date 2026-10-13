import { describe, expect, it } from "vitest";
import { escapeWordText, extractPdfTextOperators } from "./documentConversion";

describe("document conversion text handling", () => {
  it("escapes XML characters for Word documents", () => {
    expect(escapeWordText("A & B < C")).toBe("A &amp; B &lt; C");
    expect(escapeWordText('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("extracts PDF literal strings, octal escapes, arrays, and hex strings", () => {
    expect(extractPdfTextOperators("BT (Hello\\040world) Tj <576F726C64> Tj ET")).toEqual(["Hello world", "World"]);
    expect(extractPdfTextOperators("BT [(first) -20 (second)] TJ ET")).toEqual(["firstsecond"]);
  });

  it("does not treat arbitrary non-text operators as extracted content", () => {
    expect(extractPdfTextOperators("BT 12 30 Td 0.5 w ET")).toEqual([]);
  });
});
