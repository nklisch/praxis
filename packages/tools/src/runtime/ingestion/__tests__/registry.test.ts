import { describe, expect, it, vi } from "vitest";
import type { Ingestor, IngestorOptions, IngestorResult } from "../ingestor.js";
import { IngestorRegistry } from "../registry.js";

function makeIngestor(overrides: Partial<Ingestor> & Pick<Ingestor, "id">): Ingestor {
  return {
    id: overrides.id,
    label: overrides.label ?? overrides.id,
    extensions: overrides.extensions ?? [],
    mimeTypes: overrides.mimeTypes ?? [],
    isAvailable: overrides.isAvailable ?? (() => Promise.resolve(true)),
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    parse: overrides.parse ?? (vi.fn() as any),
  };
}

const txtIngestor = makeIngestor({
  id: "plain-text",
  extensions: [".txt"],
  mimeTypes: ["text/plain"],
});

const mdIngestor = makeIngestor({
  id: "markdown",
  extensions: [".md", ".markdown"],
  mimeTypes: ["text/markdown"],
});

const jsPdfIngestor = makeIngestor({
  id: "js-pdf",
  extensions: [".pdf"],
  mimeTypes: ["application/pdf"],
});

const visionPdfIngestor = makeIngestor({
  id: "vision-pdf",
  extensions: [".pdf"],
  mimeTypes: ["application/pdf"],
});

describe("IngestorRegistry.candidatesFor", () => {
  it("matches by mime type", () => {
    const reg = new IngestorRegistry([txtIngestor, mdIngestor]);
    const c = reg.candidatesFor({ mimeType: "text/plain", filename: "foo.bin" });
    expect(c.map((i) => i.id)).toEqual(["plain-text"]);
  });

  it("matches by extension when mime is application/octet-stream", () => {
    const reg = new IngestorRegistry([txtIngestor, mdIngestor]);
    const c = reg.candidatesFor({ mimeType: "application/octet-stream", filename: "README.md" });
    expect(c.map((i) => i.id)).toEqual(["markdown"]);
  });

  it("returns multiple candidates for the same extension in registration order", () => {
    const reg = new IngestorRegistry([jsPdfIngestor, visionPdfIngestor]);
    const c = reg.candidatesFor({ mimeType: "application/pdf", filename: "book.pdf" });
    expect(c.map((i) => i.id)).toEqual(["js-pdf", "vision-pdf"]);
  });

  it("returns empty array when no match", () => {
    const reg = new IngestorRegistry([txtIngestor]);
    const c = reg.candidatesFor({ mimeType: "application/zip", filename: "archive.zip" });
    expect(c).toHaveLength(0);
  });
});

describe("IngestorRegistry.select", () => {
  it("returns the first available matching ingestor", async () => {
    const reg = new IngestorRegistry([jsPdfIngestor, visionPdfIngestor]);
    const selected = await reg.select({ mimeType: "application/pdf", filename: "book.pdf" });
    expect(selected?.id).toBe("js-pdf");
  });

  it("skips unavailable ingestors and returns the next", async () => {
    const unavailableVision = makeIngestor({
      id: "vision-pdf",
      extensions: [".pdf"],
      mimeTypes: ["application/pdf"],
      isAvailable: () => Promise.resolve(false),
    });
    const reg = new IngestorRegistry([unavailableVision, jsPdfIngestor]);
    const selected = await reg.select({ mimeType: "application/pdf", filename: "book.pdf" });
    expect(selected?.id).toBe("js-pdf");
  });

  it("returns null when all candidates are unavailable", async () => {
    const unavailable = makeIngestor({
      id: "js-pdf",
      extensions: [".pdf"],
      mimeTypes: ["application/pdf"],
      isAvailable: () => Promise.resolve(false),
    });
    const reg = new IngestorRegistry([unavailable]);
    const selected = await reg.select({ mimeType: "application/pdf", filename: "book.pdf" });
    expect(selected).toBeNull();
  });

  it("honors preferIngestorId when the specified ingestor is available", async () => {
    const reg = new IngestorRegistry([jsPdfIngestor, visionPdfIngestor]);
    const selected = await reg.select({
      mimeType: "application/pdf",
      filename: "book.pdf",
      preferIngestorId: "vision-pdf",
    });
    expect(selected?.id).toBe("vision-pdf");
  });

  it("falls back to matching when preferIngestorId is unavailable", async () => {
    const unavailableVision = makeIngestor({
      id: "vision-pdf",
      extensions: [".pdf"],
      mimeTypes: ["application/pdf"],
      isAvailable: () => Promise.resolve(false),
    });
    const reg = new IngestorRegistry([jsPdfIngestor, unavailableVision]);
    const selected = await reg.select({
      mimeType: "application/pdf",
      filename: "book.pdf",
      preferIngestorId: "vision-pdf",
    });
    expect(selected?.id).toBe("js-pdf");
  });

  it("returns null for unknown preferIngestorId and no mime/ext match", async () => {
    const reg = new IngestorRegistry([txtIngestor]);
    const selected = await reg.select({
      mimeType: "application/zip",
      filename: "archive.zip",
      preferIngestorId: "nonexistent",
    });
    expect(selected).toBeNull();
  });
});

describe("IngestorRegistry.all", () => {
  it("returns all registered ingestors", () => {
    const reg = new IngestorRegistry([txtIngestor, mdIngestor, jsPdfIngestor]);
    expect(reg.all().map((i) => i.id)).toEqual(["plain-text", "markdown", "js-pdf"]);
  });

  it("returns a copy (mutation does not affect registry)", () => {
    const reg = new IngestorRegistry([txtIngestor]);
    reg.all().push(mdIngestor);
    expect(reg.all()).toHaveLength(1);
  });
});
