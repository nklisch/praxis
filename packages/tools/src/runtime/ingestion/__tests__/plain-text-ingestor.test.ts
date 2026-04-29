import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlainTextIngestor } from "../plain-text-ingestor.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-txt-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("PlainTextIngestor", () => {
  it("is always available", async () => {
    const ingestor = new PlainTextIngestor();
    expect(await ingestor.isAvailable()).toBe(true);
  });

  it("has correct id, label, extensions, mimeTypes", () => {
    const ingestor = new PlainTextIngestor();
    expect(ingestor.id).toBe("plain-text");
    expect(ingestor.label).toBe("Plain Text");
    expect(ingestor.extensions).toContain(".txt");
    expect(ingestor.mimeTypes).toContain("text/plain");
  });

  it("parses a plain text file into chunks", async () => {
    const ingestor = new PlainTextIngestor();
    const filePath = join(tmpDir, "notes.txt");
    await writeFile(filePath, "Hello world.\n\nThis is a second paragraph.\n\nAnd a third one.");

    const result = await ingestor.parse(filePath);

    expect(result.ingestorId).toBe("plain-text");
    expect(result.title).toBe("notes");
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0]?.text).toContain("Hello world");
  });

  it("uses filename (without extension) as title", async () => {
    const ingestor = new PlainTextIngestor();
    const filePath = join(tmpDir, "my-document.txt");
    await writeFile(filePath, "Some content here.");

    const result = await ingestor.parse(filePath);
    expect(result.title).toBe("my-document");
  });

  it("respects maxChars splitting paragraphs into multiple chunks", async () => {
    const ingestor = new PlainTextIngestor();
    const filePath = join(tmpDir, "long.txt");
    const para = "A".repeat(100);
    await writeFile(filePath, `${para}\n\n${para}\n\n${para}`);

    const result = await ingestor.parse(filePath, { maxChars: 150 });
    // 3 paragraphs of 100 chars each; maxChars=150 means 2nd+3rd don't fit in one chunk
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("assigns sequential chunkIndex values starting at 0", async () => {
    const ingestor = new PlainTextIngestor();
    const filePath = join(tmpDir, "idx.txt");
    await writeFile(filePath, "Para one.\n\nPara two.\n\nPara three.");

    const result = await ingestor.parse(filePath);
    for (let i = 0; i < result.chunks.length; i++) {
      expect(result.chunks[i]?.chunkIndex).toBe(i);
    }
  });
});
