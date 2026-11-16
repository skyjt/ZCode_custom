import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseLocator } from "#office/domain/anchor.ts";
import { parseDocx } from "#office/adapters/parse/docx.ts";
import { parsePptx } from "#office/adapters/parse/pptx.ts";
import { parseXlsx } from "#office/adapters/parse/xlsx.ts";
import { parsePdf } from "#office/adapters/parse/pdf.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixture = async (name: string) =>
  new Uint8Array(await readFile(join(root, "fixtures", name)));
// 按模块解析定位 pdfjs-dist：仓库使用 hoisted node_modules，包目录下不一定有自己的 node_modules。
const pdfjs = `${dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"))}/`;
const assets = { cMapUrl: `${pdfjs}cmaps/`, standardFontDataUrl: `${pdfjs}standard_fonts/` };

describe("parsers", () => {
  it("preserves inherited Word headings, overrides and anchors with rich style formatting", async () => {
    const make = async (rich: boolean, inheritedLevel = 1) => {
      const zip = new JSZip();
      const formatting = rich
        ? `<w:rPr><w:rFonts w:ascii="Calibri"/><w:color w:val="234567"/></w:rPr>
           <w:tblPr><w:tblBorders><w:top w:val="single"/></w:tblBorders></w:tblPr>
           <w:trPr><w:trHeight w:val="240"/></w:trPr><w:tcPr><w:tcW w:w="120"/></w:tcPr>
           ${'<w:tblStylePr w:type="band1Horz"><w:tcPr><w:shd w:fill="EFEFEF"/></w:tcPr><w:pPr><w:outlineLvl w:val="8"/></w:pPr></w:tblStylePr>'.repeat(100)}`
        : "";
      zip.file(
        "word/styles.xml",
        `<?xml version="1.0"?><!DOCTYPE w:styles [<!ENTITY custom "Heading 9">]>
         <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
           ${rich ? '<w:docDefaults><w:rPrDefault><w:rPr><w:b/></w:rPr></w:rPrDefault></w:docDefaults><w:latentStyles><w:lsdException w:name="Heading 9"/></w:latentStyles>' : ""}
           <w:style w:styleId="Base中"><w:name w:val="正文"/><w:pPr><w:outlineLvl w:val="${inheritedLevel}"/></w:pPr>${formatting}</w:style>
           <w:style w:styleId="Derived"><w:name w:val="&custom;"/><w:basedOn w:val="Base&#x4E2D;"/>${formatting}</w:style>
           <w:style w:styleId="List"><w:name w:val="List &amp; 中文"/>${formatting}</w:style>
           <w:style w:styleId="A"><w:basedOn w:val="B"/>${formatting}</w:style>
           <w:style w:styleId="B"><w:basedOn w:val="A"/>${formatting}</w:style>
         </w:styles>`,
      );
      zip.file(
        "word/document.xml",
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
          <w:p><w:pPr><w:pStyle w:val="Derived"/></w:pPr><w:r><w:t>继承标题 &amp; 中文</w:t></w:r></w:p>
          <w:p><w:pPr><w:pStyle w:val="Derived"/><w:outlineLvl w:val="2"/></w:pPr><w:r><w:t>直接覆盖</w:t></w:r></w:p>
          <w:p><w:pPr><w:pStyle w:val="List"/></w:pPr><w:r><w:t>列表正文</w:t></w:r></w:p>
          <w:p><w:pPr><w:pStyle w:val="A"/></w:pPr><w:r><w:t>循环继承正文</w:t></w:r></w:p>
          <w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格正文</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        </w:body></w:document>`,
      );
      return parseDocx(await zip.generateAsync({ type: "uint8array" }), "中文.docx");
    };
    const rich = await make(true);
    const plain = await make(false);
    expect(rich.outline).toEqual([
      { at: "p:1", label: "继承标题 & 中文", level: 2 },
      { at: "p:2", label: "直接覆盖", level: 3 },
    ]);
    expect(rich.title).toBe("继承标题 & 中文");
    expect(rich.read(null, 0)).toEqual(plain.read(null, 0));
    expect(rich.outline).toEqual(plain.outline);
    expect(rich.blocks).toEqual(plain.blocks);
    expect(rich.read(null, 0).text).toContain("- 列表正文");
    expect(rich.read(parseLocator("docx", "t:1/r1c1"), 0).text).toContain("表格正文");
    expect(rich.search("正文", 10)).toEqual(plain.search("正文", 10));
    expect(rich.read(null, 0).text).not.toContain("Heading 9");
    // 不共享不同文档的样式事实：相同 id 的新文档必须读到自己的 outlineLvl。
    expect((await make(true, 0)).outline[0].level).toBe(1);
    expect(rich.outline[0].level).toBe(2);
  });

  it("reads docx blocks, headings and tables", async () => {
    const doc = await parseDocx(await fixture("report.docx"), "report.docx");
    expect(doc.title).toBe("Quarterly Report");
    expect(doc.outline.map((item) => item.label)).toEqual([
      "Quarterly Report",
      "Revenue",
      "Outlook",
      "Appendix",
    ]);
    const all = doc.read(null, 0).text;
    expect(all).toContain("[p:1] # Quarterly Report");
    expect(all).toContain("| Region | Revenue |");
    expect(all).toContain("- Risk item 1");
    expect(doc.read(parseLocator("docx", "t:1/r2c2"), 0).text).toContain("120");
    expect(doc.search("growth", 5).map((hit) => hit.at)).toEqual(["p:6"]);
    expect(doc.search("South", 5)[0].at).toBe("t:1/r3c1");
    expect(doc.blocks?.[3]).toEqual({
      at: "p:4",
      text: "Revenue grew by 12 percent compared with the previous quarter.",
    });
    expect(() => doc.read(parseLocator("docx", "p:999"), 0)).toThrow(/does not exist/);
  });

  it("reads pptx slides, shapes and notes", async () => {
    const doc = await parsePptx(await fixture("launch.pptx"), "launch.pptx");
    expect(doc.units).toBe(3);
    expect(doc.outline.map((item) => item.label)).toEqual(["Product Launch", "Timeline", "Budget"]);
    const slide2 = doc.read(parseLocator("pptx", "slide:2"), 0).text;
    expect(slide2).toContain("## Slide 2: Timeline");
    expect(slide2).toContain("十一月：复盘");
    expect(slide2).toContain("Speaker notes: Mention the beta feedback numbers.");
    const owner = doc.search("Dana", 5);
    expect(owner).toHaveLength(1);
    expect(doc.read(parseLocator("pptx", owner[0].at), 0).text).toContain("Owner: Dana");
    expect(doc.read(parseLocator("pptx", "slide:3"), 0).text).toContain("| Ads | 40k | Lee |");
  });

  it("reads xlsx ranges with formulas", async () => {
    const doc = await parseXlsx(await fixture("budget.xlsx"), "budget.xlsx");
    expect(doc.outline.map((item) => item.at)).toEqual(["Revenue", "Notes"]);
    const range = doc.read(parseLocator("xlsx", "Revenue!A1:E3"), 0).text;
    expect(range).toContain("| 2 | North | 100 | 110 | 120 |");
    expect(range).toContain("E2: =SUM(B2:D2)");
    expect(doc.read(null, 0).text).toContain("Merged cells: A7:E7");
    expect(doc.search("east", 5).map((hit) => hit.at)).toEqual(["Revenue!A4"]);
    expect(() => doc.check(parseLocator("xlsx", "Missing!A1"))).toThrow(/Sheets: Revenue, Notes/);
  });

  it("reads pdf pages, outline and CJK text", async () => {
    const doc = await parsePdf(await fixture("paper.pdf"), "paper.pdf", assets);
    expect(doc.units).toBe(2);
    expect(doc.title).toBe("Research Paper");
    expect(doc.outline).toEqual([
      { at: "page:1", label: "Introduction", level: 1 },
      { at: "page:2", label: "Method", level: 1 },
    ]);
    expect(doc.read(parseLocator("pdf", "page:1"), 0).text).toContain("缓存显著降低延迟");
    expect(doc.search("cache sizes", 5)).toEqual([
      { at: "page:2", snippet: expect.stringContaining("three cache sizes") },
    ]);
  });

  it("reads non-embedded CJK fonts and maps ToUnicode radicals back to ideographs", async () => {
    const doc = await parsePdf(await fixture("cjk.pdf"), "cjk.pdf", assets);
    const text = doc.read(parseLocator("pdf", "page:1"), 0).text;
    expect(text).toContain("宋体：中文排版测试");
    expect(text).toContain("黑体名称：中文排版测试");
    // ToUnicode 写的是 ⽞(U+2F5E) ⻩(U+2EE9) ⽂(U+2F42)，Chrome 打印的 PDF 常见。
    expect(text).toContain("天地玄黄，中文排版");
    expect(text).not.toMatch(/[⺀-⿟]/);
    expect(doc.search("文", 10)).toHaveLength(4);
    expect(doc.search("玄黄", 5)).toEqual([
      { at: "page:1", snippet: expect.stringContaining("天地玄黄") },
    ]);
  });
});
