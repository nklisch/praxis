import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PageImageStore } from "@praxis/core/ingestion";
import type { VisionCapability, VisionDescribeResponse } from "@praxis/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisionPdfIngestor } from "../vision-pdf-ingestor.js";

// Mock canvas to avoid loading the native binary in tests
vi.mock("canvas", () => ({
  createCanvas: (w: number, h: number) => ({
    getContext: () => ({
      // minimal canvas context stub
    }),
    toBuffer: () => Buffer.from("fake-png-data"),
    width: w,
    height: h,
  }),
}));

// Mock pdfjs-dist to avoid loading the real PDF engine
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: (opts: unknown) => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: async (pageNum: number) => ({
        getViewport: () => ({ width: 800, height: 1100, scale: 2.0 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
}));

function makeVision(response: string): VisionCapability {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: test mock, type not critical
    describe: vi.fn(async (_req: any): Promise<VisionDescribeResponse> => ({ text: response })),
  };
}

function makePageImageStore(): PageImageStore {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    save: vi.fn(async ({ documentId, page }: any) => `/fake/${documentId}/${page}.png`),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    read: vi.fn(async (_input: any): Promise<Buffer | null> => null),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    deleteByDocumentId: vi.fn(async (_id: any): Promise<void> => {}),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    pathFor: vi.fn(({ documentId, page }: any): string => `/fake/${documentId}/${page}.png`),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    dirFor: vi.fn(({ documentId }: any): string => `/fake/${documentId}`),
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-vision-pdf-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("VisionPdfIngestor", () => {
  it("is available when vision resolver returns a capability", async () => {
    const ingestor = new VisionPdfIngestor({
      visionResolver: () => makeVision("# Hello\n\nWorld content."),
    });
    expect(await ingestor.isAvailable()).toBe(true);
  });

  it("is not available when vision resolver returns undefined", async () => {
    const ingestor = new VisionPdfIngestor({
      visionResolver: () => undefined,
    });
    expect(await ingestor.isAvailable()).toBe(false);
  });

  it("throws when vision resolver returns undefined at parse time", async () => {
    const ingestor = new VisionPdfIngestor({
      visionResolver: () => undefined,
    });
    const filePath = join(tmpDir, "test.pdf");
    await writeFile(filePath, "fake pdf bytes");

    await expect(ingestor.parse(filePath)).rejects.toThrow("no vision capability");
  });

  it("calls vision.describe once per page", async () => {
    const vision = makeVision("## Section\n\nPage content here.");
    const ingestor = new VisionPdfIngestor({
      visionResolver: () => vision,
    });
    const filePath = join(tmpDir, "test.pdf");
    await writeFile(filePath, "fake pdf bytes");

    await ingestor.parse(filePath);

    // 2 pages (from mock) → 2 calls
    expect(vision.describe).toHaveBeenCalledTimes(2);
  });

  it("produces chunks with page numbers", async () => {
    const vision = makeVision("## Heading\n\nSome content on this page.");
    const ingestor = new VisionPdfIngestor({
      visionResolver: () => vision,
    });
    const filePath = join(tmpDir, "test.pdf");
    await writeFile(filePath, "fake pdf bytes");

    const result = await ingestor.parse(filePath);
    const withPage = result.chunks.filter((c) => c.page !== undefined);
    expect(withPage.length).toBeGreaterThan(0);
  });

  it("skips [BLANK PAGE] pages", async () => {
    const vision = makeVision("[BLANK PAGE]");
    const ingestor = new VisionPdfIngestor({
      visionResolver: () => vision,
    });
    const filePath = join(tmpDir, "blank.pdf");
    await writeFile(filePath, "fake pdf bytes");

    const result = await ingestor.parse(filePath);
    expect(result.chunks).toHaveLength(0);
  });

  it("saves page images to pageImageStore when provided", async () => {
    const vision = makeVision("## Title\n\nContent here.");
    const store = makePageImageStore();
    const ingestor = new VisionPdfIngestor({
      visionResolver: () => vision,
      pageImageStore: store,
    });
    const filePath = join(tmpDir, "test.pdf");
    await writeFile(filePath, "fake pdf bytes");

    const result = await ingestor.parse(filePath);

    // 2 pages → 2 save calls
    expect(store.save).toHaveBeenCalledTimes(2);
    // pendingPageImageDocId should be set
    expect(result.pendingPageImageDocId).toBeTruthy();
    expect(typeof result.pendingPageImageDocId).toBe("string");
  });

  it("does not set pendingPageImageDocId when no pageImageStore", async () => {
    const vision = makeVision("Content.");
    const ingestor = new VisionPdfIngestor({
      visionResolver: () => vision,
    });
    const filePath = join(tmpDir, "test.pdf");
    await writeFile(filePath, "fake pdf bytes");

    const result = await ingestor.parse(filePath);
    expect(result.pendingPageImageDocId).toBeUndefined();
  });

  it("calls onPageProgress for each page", async () => {
    const vision = makeVision("Content.");
    const ingestor = new VisionPdfIngestor({
      visionResolver: () => vision,
    });
    const filePath = join(tmpDir, "test.pdf");
    await writeFile(filePath, "fake pdf bytes");

    const progress: Array<{ page: number; total: number }> = [];
    await ingestor.parse(filePath, {
      onPageProgress: (page, total) => progress.push({ page, total }),
    });

    expect(progress).toHaveLength(2);
    expect(progress[0]).toEqual({ page: 1, total: 2 });
    expect(progress[1]).toEqual({ page: 2, total: 2 });
  });

  it("returns correct metadata", async () => {
    const vision = makeVision("Content.");
    const ingestor = new VisionPdfIngestor({
      visionResolver: () => vision,
    });
    const filePath = join(tmpDir, "my-doc.pdf");
    await writeFile(filePath, "fake pdf bytes");

    const result = await ingestor.parse(filePath);
    expect(result.ingestorId).toBe("vision-pdf");
    expect(result.title).toBe("my-doc");
    expect(result.pageCount).toBe(2);
  });

  it("aborts mid-loop on signal.aborted", async () => {
    const vision = makeVision("Content.");
    const ingestor = new VisionPdfIngestor({
      visionResolver: () => vision,
    });
    const filePath = join(tmpDir, "test.pdf");
    await writeFile(filePath, "fake pdf bytes");

    const controller = new AbortController();
    controller.abort();

    const result = await ingestor.parse(filePath, { signal: controller.signal });
    // Aborted before any pages → no chunks
    expect(result.chunks).toHaveLength(0);
  });
});
