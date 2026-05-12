import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsEmbeddedImageStore } from "@praxis/core/ingestion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocxIngestor } from "../docx-ingestor.js";

// ---------------------------------------------------------------------------
// Mock mammoth — keeps the heavy DOCX parser out of unit tests.
// Tests verify DocxIngestor's orchestration logic using synthetic markdown
// strings rather than real DOCX bytes.
// ---------------------------------------------------------------------------

// The mock is typed as `any` below because mammoth exports as `= mammoth`
// (CommonJS compat); we only need to control the two call sites.

vi.mock("mammoth", () => {
  const convertToMarkdown = vi.fn();
  return {
    default: {
      convertToMarkdown,
      images: {
        imgElement: (
          fn: (img: { contentType: string; readAsBase64String: () => Promise<string> }) => Promise<{
            src: string;
          }>,
        ) => ({ __mammothBrand: "ImageConverter" as const, _fn: fn }),
      },
    },
    convertToMarkdown,
    images: {
      imgElement: (
        fn: (img: { contentType: string; readAsBase64String: () => Promise<string> }) => Promise<{
          src: string;
        }>,
      ) => ({ __mammothBrand: "ImageConverter" as const, _fn: fn }),
    },
  };
});

/** Get the mocked convertToMarkdown function. */
async function getMockConvertToMarkdown() {
  const mod = await import("mammoth");
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  return vi.mocked((mod as any).convertToMarkdown as (...args: any[]) => unknown);
}

/**
 * Make a fake mammoth image object for use in imgElement callbacks.
 * `contentType` is a sync string in mammoth@1.12.0.
 */
function makeFakeImage(opts: {
  contentType?: string;
  base64?: string;
}): { contentType: string; readAsBase64String: () => Promise<string> } {
  return {
    contentType: opts.contentType ?? "image/png",
    readAsBase64String: async () =>
      opts.base64 ?? Buffer.from("fake-image-bytes").toString("base64"),
  };
}

/**
 * Simulate what mammoth does with convertImage: call the imgElement callback
 * for each fake image and collect the srcs. Returns { value, messages } with
 * image markdown references embedded.
 *
 * The mock convertToMarkdown calls this when `options.convertImage` is present,
 * allowing tests to inject fake images without real DOCX bytes.
 */
async function simulateConvertToMarkdownWithImages(
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  options: any,
  images: Array<{ contentType?: string; base64?: string; altText?: string }>,
  baseMarkdown: string,
): Promise<{ value: string; messages: [] }> {
  if (!options?.convertImage?._fn) {
    return { value: baseMarkdown, messages: [] };
  }

  let markdown = baseMarkdown;
  for (const img of images) {
    const fakeImg = makeFakeImage(img);
    const attrs = await options.convertImage._fn(fakeImg);
    // mammoth renders imgElement result as markdown image reference
    markdown += `\n\n![image](${attrs.src})`;
  }
  return { value: markdown, messages: [] };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-docx-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("DocxIngestor — metadata", () => {
  it("is always available", async () => {
    const ingestor = new DocxIngestor();
    expect(await ingestor.isAvailable()).toBe(true);
  });

  it("has correct id, label, extensions, mimeTypes", () => {
    const ingestor = new DocxIngestor();
    expect(ingestor.id).toBe("docx");
    expect(ingestor.label).toBe("DOCX");
    expect(ingestor.extensions).toContain(".docx");
    expect(ingestor.mimeTypes).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });
});

describe("DocxIngestor — text extraction (Unit 1: convertToMarkdown)", () => {
  it("returns ingestorId = docx", async () => {
    const mock = await getMockConvertToMarkdown();
    mock.mockResolvedValue({ value: "Some content.", messages: [] });

    const filePath = join(tmpDir, "doc.docx");
    await writeFile(filePath, "fake docx bytes");

    const result = await new DocxIngestor().parse(filePath);
    expect(result.ingestorId).toBe("docx");
  });

  it("uses first H1 heading as title", async () => {
    const mock = await getMockConvertToMarkdown();
    mock.mockResolvedValue({
      value: "# Introduction to Algebra\n\nThis chapter covers the basics.",
      messages: [],
    });

    const filePath = join(tmpDir, "algebra.docx");
    await writeFile(filePath, "fake docx bytes");

    const result = await new DocxIngestor().parse(filePath);
    expect(result.title).toBe("Introduction to Algebra");
  });

  it("falls back to filename stem when no H1 is present", async () => {
    const mock = await getMockConvertToMarkdown();
    mock.mockResolvedValue({ value: "Just a paragraph with no heading.", messages: [] });

    const filePath = join(tmpDir, "my-notes.docx");
    await writeFile(filePath, "fake docx bytes");

    const result = await new DocxIngestor().parse(filePath);
    expect(result.title).toBe("my-notes");
  });

  it("produces at least one chunk for non-empty content", async () => {
    const mock = await getMockConvertToMarkdown();
    mock.mockResolvedValue({
      value: "# Chapter 1\n\nFirst paragraph.\n\n## Section 1.1\n\nSecond paragraph.",
      messages: [],
    });

    const filePath = join(tmpDir, "chapters.docx");
    await writeFile(filePath, "fake docx bytes");

    const result = await new DocxIngestor().parse(filePath);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.every((c) => c.text.length > 0)).toBe(true);
  });

  it("assigns sequential chunkIndex values starting from 0", async () => {
    const mock = await getMockConvertToMarkdown();
    mock.mockResolvedValue({
      value:
        "# Title\n\nParagraph one.\n\n## Section Two\n\nParagraph two.\n\n## Section Three\n\nParagraph three.",
      messages: [],
    });

    const filePath = join(tmpDir, "indexed.docx");
    await writeFile(filePath, "fake docx bytes");

    const result = await new DocxIngestor().parse(filePath);
    const indices = result.chunks.map((c) => c.chunkIndex);
    expect(indices[0]).toBe(0);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("respects maxChars option (proxied to chunkMarkdown)", async () => {
    const mock = await getMockConvertToMarkdown();
    // Long content that chunkMarkdown will split if maxChars is small.
    const longParagraph = "word ".repeat(500).trim();
    mock.mockResolvedValue({ value: longParagraph, messages: [] });

    const filePath = join(tmpDir, "long.docx");
    await writeFile(filePath, "fake docx bytes");

    const resultDefault = await new DocxIngestor().parse(filePath);
    const resultSmall = await new DocxIngestor().parse(filePath, { maxChars: 100 });

    // Smaller maxChars should produce more chunks (or equal, never fewer)
    expect(resultSmall.chunks.length).toBeGreaterThanOrEqual(resultDefault.chunks.length);
  });

  it("no pendingEmbeddedImageDocId when no store is provided", async () => {
    const mock = await getMockConvertToMarkdown();
    mock.mockResolvedValue({ value: "# Doc\n\nSome text.", messages: [] });

    const filePath = join(tmpDir, "no-store.docx");
    await writeFile(filePath, "fake docx bytes");

    const result = await new DocxIngestor().parse(filePath);
    expect(result.pendingEmbeddedImageDocId).toBeUndefined();
  });

  it("no imageNames on chunks when no store is provided", async () => {
    const mock = await getMockConvertToMarkdown();
    mock.mockResolvedValue({ value: "# Doc\n\nText only, no images.", messages: [] });

    const filePath = join(tmpDir, "text-only.docx");
    await writeFile(filePath, "fake docx bytes");

    const result = await new DocxIngestor().parse(filePath);
    for (const c of result.chunks) {
      expect(c.imageNames).toBeUndefined();
    }
  });
});

describe("DocxIngestor — embedded image extraction (Unit 2: convertImage)", () => {
  it("saves an embedded image and sets pendingEmbeddedImageDocId", async () => {
    const mock = await getMockConvertToMarkdown();
    mock.mockImplementation(
      async (_input: unknown, options: unknown) =>
        await simulateConvertToMarkdownWithImages(
          options,
          [{ contentType: "image/png" }],
          "# Doc with image\n\nHere is some text.",
        ),
    );

    const filePath = join(tmpDir, "with-image.docx");
    await writeFile(filePath, "fake docx bytes");

    const storeDir = join(tmpDir, "store");
    const store = new FsEmbeddedImageStore(storeDir);
    const saveSpy = vi.spyOn(store, "save");

    const result = await new DocxIngestor({ embeddedImageStore: store }).parse(filePath);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        imageName: "image-1.png",
        mimeType: "image/png",
        bytes: expect.any(Buffer),
      }),
    );
    expect(result.pendingEmbeddedImageDocId).toBeDefined();
    expect(result.pendingEmbeddedImageDocId).toMatch(/^_pending_/);
  });

  it("saves multiple images with sequential names", async () => {
    const mock = await getMockConvertToMarkdown();
    mock.mockImplementation(
      async (_input: unknown, options: unknown) =>
        await simulateConvertToMarkdownWithImages(
          options,
          [{ contentType: "image/png" }, { contentType: "image/jpeg" }],
          "# Multi-image doc\n\nText here.",
        ),
    );

    const filePath = join(tmpDir, "two-images.docx");
    await writeFile(filePath, "fake docx bytes");

    const storeDir = join(tmpDir, "store-two");
    const store = new FsEmbeddedImageStore(storeDir);
    const saveSpy = vi.spyOn(store, "save");

    const result = await new DocxIngestor({ embeddedImageStore: store }).parse(filePath);

    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ imageName: "image-1.png" }));
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ imageName: "image-2.jpg" }));
    expect(result.pendingEmbeddedImageDocId).toMatch(/^_pending_/);
  });

  it("populates imageNames on chunks containing image references", async () => {
    const mock = await getMockConvertToMarkdown();
    mock.mockImplementation(
      async (_input: unknown, options: unknown) =>
        await simulateConvertToMarkdownWithImages(
          options,
          [{ contentType: "image/png" }],
          "# Doc\n\nParagraph before image.",
        ),
    );

    const filePath = join(tmpDir, "chunk-tag.docx");
    await writeFile(filePath, "fake docx bytes");

    const storeDir = join(tmpDir, "store-chunk-tag");
    const store = new FsEmbeddedImageStore(storeDir);

    const result = await new DocxIngestor({ embeddedImageStore: store }).parse(filePath);

    // At least one chunk should carry imageNames
    const taggedChunks = result.chunks.filter((c) => c.imageNames !== undefined);
    expect(taggedChunks.length).toBeGreaterThan(0);
    expect(taggedChunks[0]!.imageNames).toContain("image-1.png");
  });

  it("does not set pendingEmbeddedImageDocId when document has no embedded images", async () => {
    const mock = await getMockConvertToMarkdown();
    // No images — simulateConvertToMarkdownWithImages with empty images array
    mock.mockImplementation(
      async (_input: unknown, options: unknown) =>
        await simulateConvertToMarkdownWithImages(
          options,
          [],
          "# Text only\n\nNo images in this doc.",
        ),
    );

    const filePath = join(tmpDir, "no-images.docx");
    await writeFile(filePath, "fake docx bytes");

    const storeDir = join(tmpDir, "store-no-images");
    const store = new FsEmbeddedImageStore(storeDir);
    const saveSpy = vi.spyOn(store, "save");

    const result = await new DocxIngestor({ embeddedImageStore: store }).parse(filePath);

    expect(saveSpy).not.toHaveBeenCalled();
    expect(result.pendingEmbeddedImageDocId).toBeUndefined();
  });

  it("decodes Base64 before saving (bytes are not Base64 strings)", async () => {
    const rawBytes = Buffer.from("real binary image data \x89PNG");
    const mock = await getMockConvertToMarkdown();
    mock.mockImplementation(
      async (_input: unknown, options: unknown) =>
        await simulateConvertToMarkdownWithImages(
          options,
          [{ contentType: "image/png", base64: rawBytes.toString("base64") }],
          "# Decode test\n\nSome text.",
        ),
    );

    const filePath = join(tmpDir, "decode-test.docx");
    await writeFile(filePath, "fake docx bytes");

    const storeDir = join(tmpDir, "store-decode");
    const store = new FsEmbeddedImageStore(storeDir);
    const saveSpy = vi.spyOn(store, "save");

    await new DocxIngestor({ embeddedImageStore: store }).parse(filePath);

    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ bytes: expect.any(Buffer) }));
    const savedBytes: Buffer = saveSpy.mock.calls[0]?.[0]?.bytes as Buffer;
    expect(savedBytes.equals(rawBytes)).toBe(true);
  });

  it("text-only path (no store): no imageNames, no pendingEmbeddedImageDocId", async () => {
    const mock = await getMockConvertToMarkdown();
    mock.mockResolvedValue({ value: "# Plain\n\nJust text, no images.", messages: [] });

    const filePath = join(tmpDir, "plain.docx");
    await writeFile(filePath, "fake docx bytes");

    const result = await new DocxIngestor().parse(filePath);

    expect(result.pendingEmbeddedImageDocId).toBeUndefined();
    for (const c of result.chunks) {
      expect(c.imageNames).toBeUndefined();
    }
  });

  it("each parse() call is independent (pendingDocId resets between calls)", async () => {
    const mock = await getMockConvertToMarkdown();

    // First call: with images
    mock.mockImplementationOnce(
      async (_input: unknown, options: unknown) =>
        await simulateConvertToMarkdownWithImages(
          options,
          [{ contentType: "image/png" }],
          "# With image\n\nText.",
        ),
    );
    // Second call: no images (text-only response)
    mock.mockImplementationOnce(
      async (_input: unknown, options: unknown) =>
        await simulateConvertToMarkdownWithImages(options, [], "# No image\n\nText."),
    );

    const filePath = join(tmpDir, "reset-test.docx");
    await writeFile(filePath, "fake docx bytes");

    const storeDir = join(tmpDir, "store-reset");
    const store = new FsEmbeddedImageStore(storeDir);
    const ingestor = new DocxIngestor({ embeddedImageStore: store });

    const first = await ingestor.parse(filePath);
    const second = await ingestor.parse(filePath);

    expect(first.pendingEmbeddedImageDocId).toMatch(/^_pending_/);
    expect(second.pendingEmbeddedImageDocId).toBeUndefined();
  });
});

describe("DocxIngestor — mimeToExt coverage", () => {
  const cases: Array<[string, string]> = [
    ["image/jpeg", "image-1.jpg"],
    ["image/jpg", "image-1.jpg"],
    ["image/png", "image-1.png"],
    ["image/gif", "image-1.gif"],
    ["image/webp", "image-1.webp"],
    ["image/svg+xml", "image-1.svg"],
    ["image/tiff", "image-1.bin"], // fallback
  ];

  for (const [mime, expectedName] of cases) {
    it(`saves ${mime} as ${expectedName}`, async () => {
      const mock = await getMockConvertToMarkdown();
      mock.mockImplementation(
        async (_input: unknown, options: unknown) =>
          await simulateConvertToMarkdownWithImages(
            options,
            [{ contentType: mime }],
            "# Mime test\n\nText.",
          ),
      );

      const filePath = join(tmpDir, `mime-${mime.replace(/[/+]/g, "-")}.docx`);
      await writeFile(filePath, "fake docx bytes");

      const storeDir = join(tmpDir, `store-${mime.replace(/[/+]/g, "-")}`);
      const store = new FsEmbeddedImageStore(storeDir);
      const saveSpy = vi.spyOn(store, "save");

      await new DocxIngestor({ embeddedImageStore: store }).parse(filePath);
      expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ imageName: expectedName }));
    });
  }
});
