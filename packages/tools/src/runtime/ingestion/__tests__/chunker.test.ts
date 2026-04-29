import { describe, expect, it } from "vitest";
import { chunkMarkdown, chunkParagraphs } from "../chunker.js";

describe("chunkParagraphs", () => {
  it("returns empty array for empty text", () => {
    expect(chunkParagraphs("")).toHaveLength(0);
    expect(chunkParagraphs("   \n\n  ")).toHaveLength(0);
  });

  it("splits on double newlines when chunks exceed maxChars", () => {
    // With maxChars=5, each para forces a new chunk
    const result = chunkParagraphs("Para one.\n\nPara two.\n\nPara three.", { maxChars: 5 });
    expect(result).toHaveLength(3);
    expect(result[0]?.text).toBe("Para one.");
    expect(result[1]?.text).toBe("Para two.");
    expect(result[2]?.text).toBe("Para three.");
  });

  it("merges short paragraphs when within maxChars and assigns single chunkIndex", () => {
    // Short paragraphs within maxChars get merged into one chunk
    const result = chunkParagraphs("A\n\nB\n\nC", { startIndex: 5 });
    // All fit in one chunk (combined text "A\n\nB\n\nC" < 2000 chars)
    expect(result).toHaveLength(1);
    expect(result[0]?.chunkIndex).toBe(5);
  });

  it("merges short paragraphs into one chunk within maxChars", () => {
    const result = chunkParagraphs("Short.\n\nAlso short.", { maxChars: 200 });
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe("Short.\n\nAlso short.");
  });

  it("splits into multiple chunks when paragraphs exceed maxChars", () => {
    const big = "A".repeat(100);
    const result = chunkParagraphs(`${big}\n\n${big}\n\n${big}`, { maxChars: 150 });
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("never breaks mid-paragraph (oversized para gets its own chunk)", () => {
    const oversized = "X".repeat(5000);
    const result = chunkParagraphs(oversized, { maxChars: 2000 });
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe(oversized);
  });

  it("assigns page and section when provided", () => {
    const result = chunkParagraphs("Content.", { page: 3, section: "Intro" });
    expect(result[0]?.page).toBe(3);
    expect(result[0]?.section).toBe("Intro");
  });
});

describe("chunkMarkdown", () => {
  it("returns empty chunks for empty markdown", () => {
    const { chunks } = chunkMarkdown("");
    expect(chunks).toHaveLength(0);
  });

  it("produces SectionHeader chunks for headings", () => {
    const md = "## Introduction\n\nSome text.";
    const { chunks } = chunkMarkdown(md);
    const header = chunks.find((c) => c.blockType === "SectionHeader");
    expect(header).toBeDefined();
    expect(header?.text).toBe("## Introduction");
    expect(header?.section).toBe("Introduction");
  });

  it("assigns the correct section to body chunks after a heading", () => {
    const md = "## Intro\n\nFirst paragraph.\n\n## Methods\n\nSecond paragraph.";
    const { chunks } = chunkMarkdown(md);
    const introBody = chunks.find((c) => c.blockType !== "SectionHeader" && c.section === "Intro");
    const methodsBody = chunks.find(
      (c) => c.blockType !== "SectionHeader" && c.section === "Methods",
    );
    expect(introBody?.text).toContain("First paragraph");
    expect(methodsBody?.text).toContain("Second paragraph");
  });

  it("tracks lastSection returned value", () => {
    const md = "## Alpha\n\nText.\n\n## Beta\n\nMore text.";
    const { lastSection } = chunkMarkdown(md);
    expect(lastSection).toBe("Beta");
  });

  it("returns correct nextIndex for continuation", () => {
    const md = "Para one.\n\nPara two.";
    const { nextIndex } = chunkMarkdown(md, { startIndex: 10 });
    // 2 short paras merge into 1 body chunk → nextIndex should be 11
    expect(nextIndex).toBe(11);
  });

  it("assigns page when provided", () => {
    const md = "## Heading\n\nContent here.";
    const { chunks } = chunkMarkdown(md, { page: 5 });
    for (const c of chunks) {
      expect(c.page).toBe(5);
    }
  });
});
