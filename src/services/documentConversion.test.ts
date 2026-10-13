import { describe, expect, it } from "vitest";
import { buildWordXmlForTest, extractPdfTextFromContentForTest } from "./documentConversionTestHelpers";

describe("document conversion helpers", () => {
  it("escapes special characters in Word text", () => {
    expect(buildWordXmlForTest("A & B", "x < y")).toContain("A &amp; B");
    expect(buildWordXmlForTest("Title", "x < y")).toContain("x &lt; y");
  });
  it("extracts simple PDF literal and hex text tokens", () => {
    expect(extractPdfTextFromContentForTest("BT (Hello\\040world) Tj <576F726C64> Tj ET")).toContain("Hello world");
    expect(extractPdfTextFromContentForTest("BT (Hello\\040world) Tj <576F726C64> Tj ET")).toContain("World");
  });
});
