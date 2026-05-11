import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FsEmbeddedImageStore } from "@praxis/core/ingestion";
import { PptxIngestor } from "../pptx-ingestor.js";

// ---------------------------------------------------------------------------
// Mock officeparser — keeps heavy transitive deps (Tesseract.js, PDF.js) out
// of unit tests.  Tests verify PptxIngestor's orchestration logic against
// synthetic AST objects rather than real PPTX bytes.
// No binary fixture was shipped by the officeparser npm package.
// ---------------------------------------------------------------------------

vi.mock("officeparser", () => ({
  OfficeParser: {
    parseOffice: vi.fn(),
  },
}));

/**
 * Build a minimal mock OfficeParserAST for the given slides.
 *
 * Matches the **real officeparser v6.1.x AST shape** (verified against the
 * sample.pptx fixture):
 * - Each slide entry produces a top-level `"slide"` node with children for
 *   body content (headings, paragraphs) and image nodes.
 * - Speaker notes produce a **separate top-level `"note"` node** (sibling of
 *   the slide, NOT a child) with `metadata.slideNumber` linking it back. The
 *   note node contains a single paragraph child carrying the note text.
 * - The mock `toText()` concatenates all slide content.
 */
function makeMockAst(
  slides: Array<{
    slideNumber: number;
    content?: string;
    notes?: string;
    heading?: string;
    /** Attachment names for embedded images in this slide (links to attachments array). */
    imageAttachmentNames?: string[];
  }>,
  opts: {
    metaTitle?: string;
    /** Top-level attachments array — simulates ast.attachments from officeparser. */
    attachments?: Array<{ name: string; type: "image" | "chart"; data: string; mimeType: string }>;
  } = {},
) {
  const contentNodes: Array<{
    type: string;
    text?: string;
    metadata: Record<string, unknown>;
    children: Array<unknown>;
  }> = [];

  for (const s of slides) {
    // Slide node — body text in children (real AST: slide.text is undefined)
    contentNodes.push({
      type: "slide",
      metadata: { slideNumber: s.slideNumber },
      children: [
        ...(s.heading
          ? [{ type: "heading", text: s.heading, metadata: { level: 1 }, children: [] }]
          : []),
        ...(s.content ? [{ type: "paragraph", text: s.content, children: [] }] : []),
        ...(s.imageAttachmentNames ?? []).map((name) => ({
          type: "image",
          text: "",
          metadata: { attachmentName: name },
          children: [],
        })),
      ],
    });

    // Note node — sibling at top level, NOT a child of the slide node.
    // Real AST: note.children contains paragraph nodes carrying the text.
    if (s.notes) {
      contentNodes.push({
        type: "note",
        metadata: { slideNumber: s.slideNumber, noteId: `slide-note-${s.slideNumber}` },
        children: [{ type: "paragraph", text: s.notes, children: [] }],
      });
    }
  }

  return {
    content: contentNodes,
    attachments: opts.attachments ?? [],
    metadata: { title: opts.metaTitle },
    toText: () =>
      slides.map((s) => [s.heading, s.content, s.notes].filter(Boolean).join("\n")).join("\n"),
  };
}

/** Build a fake base64-encoded image attachment for use in mock ASTs. */
function makeFakeAttachment(
  name: string,
  mimeType = "image/png",
): { name: string; type: "image"; data: string; mimeType: string } {
  return {
    name,
    type: "image",
    // "fake image bytes" encoded as Base64
    data: Buffer.from(`fake-bytes-for-${name}`).toString("base64"),
    mimeType,
  };
}

/** Typed reference to the mocked parseOffice function. */
async function getMockParseOffice() {
  const mod = await import("officeparser");
  return vi.mocked(
    // biome-ignore lint/suspicious/noExplicitAny: test mock — OfficeParser.parseOffice typed as vi.fn via vi.mock above
    (mod.OfficeParser as unknown as { parseOffice: (...args: any[]) => unknown }).parseOffice,
  );
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-pptx-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("PptxIngestor — metadata", () => {
  it("is always available", async () => {
    const ingestor = new PptxIngestor();
    expect(await ingestor.isAvailable()).toBe(true);
  });

  it("has correct id, label, extensions, mimeTypes", () => {
    const ingestor = new PptxIngestor();
    expect(ingestor.id).toBe("pptx");
    expect(ingestor.label).toBe("PowerPoint");
    expect(ingestor.extensions).toContain(".pptx");
    expect(ingestor.mimeTypes).toContain(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
  });
});

describe("PptxIngestor — title resolution", () => {
  it("uses document metadata title when available", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(
      makeMockAst([{ slideNumber: 1, content: "Body text" }], { metaTitle: "My Presentation" }),
    );

    const filePath = join(tmpDir, "deck.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);
    expect(result.title).toBe("My Presentation");
  });

  it("falls back to first heading in AST when metadata title is absent", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(
      makeMockAst([
        { slideNumber: 1, heading: "Introduction to Biology", content: "Cell theory." },
        { slideNumber: 2, content: "More content." },
      ]),
    );

    const filePath = join(tmpDir, "bio.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);
    expect(result.title).toBe("Introduction to Biology");
  });

  it("falls back to filename when no metadata title and no heading", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(
      makeMockAst([{ slideNumber: 1, content: "Plain paragraph, no heading." }]),
    );

    const filePath = join(tmpDir, "my-lecture-slides.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);
    expect(result.title).toBe("my-lecture-slides");
  });
});

describe("PptxIngestor — slide chunking", () => {
  it("returns ingestorId = pptx", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(makeMockAst([{ slideNumber: 1, content: "Content." }]));

    const filePath = join(tmpDir, "deck.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);
    expect(result.ingestorId).toBe("pptx");
  });

  it("produces at least one chunk per slide that has content", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(
      makeMockAst([
        { slideNumber: 1, content: "Slide one body." },
        { slideNumber: 2, content: "Slide two body." },
        { slideNumber: 3, content: "Slide three body." },
      ]),
    );

    const filePath = join(tmpDir, "three-slides.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);
    expect(result.chunks.length).toBeGreaterThanOrEqual(3);
    expect(result.chunks.every((c) => c.text.length > 0)).toBe(true);
  });

  it("assigns slide numbers as chunk.page", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(
      makeMockAst([
        { slideNumber: 1, content: "First slide." },
        { slideNumber: 2, content: "Second slide." },
      ]),
    );

    const filePath = join(tmpDir, "paged.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);
    const pages = result.chunks.map((c) => c.page).filter((p) => p !== undefined);
    expect(pages).toContain(1);
    expect(pages).toContain(2);
  });

  it("assigns section label 'Slide N' to slide body chunks", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(makeMockAst([{ slideNumber: 3, content: "Third slide content." }]));

    const filePath = join(tmpDir, "section.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);
    const bodyChunk = result.chunks.find((c) => c.text.includes("Third slide content"));
    expect(bodyChunk).toBeDefined();
    expect(bodyChunk?.section).toBe("Slide 3");
  });

  it("assigns sequential chunkIndex values starting from 0", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(
      makeMockAst([
        { slideNumber: 1, content: "A" },
        { slideNumber: 2, content: "B" },
        { slideNumber: 3, content: "C" },
      ]),
    );

    const filePath = join(tmpDir, "indexed.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);
    const indices = result.chunks.map((c) => c.chunkIndex);
    expect(indices[0]).toBe(0);
    expect(new Set(indices).size).toBe(indices.length);
  });
});

describe("PptxIngestor — speaker notes", () => {
  it("includes speaker notes in the chunk stream", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(
      makeMockAst([
        {
          slideNumber: 1,
          content: "Main slide body.",
          notes: "Remind students about the prior lecture.",
        },
      ]),
    );

    const filePath = join(tmpDir, "notes.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);
    const notesChunk = result.chunks.find((c) =>
      c.text.includes("Remind students about the prior lecture."),
    );
    expect(notesChunk).toBeDefined();
  });

  it("places notes in a section named 'Slide N (notes)'", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(
      makeMockAst([{ slideNumber: 2, content: "Body.", notes: "Speaker note text." }]),
    );

    const filePath = join(tmpDir, "notes-section.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);
    const notesChunk = result.chunks.find((c) => c.text.includes("Speaker note text."));
    expect(notesChunk?.section).toBe("Slide 2 (notes)");
  });

  it("does not create notes chunks for slides with empty notes", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(
      makeMockAst([{ slideNumber: 1, content: "Content only, no notes." }]),
    );

    const filePath = join(tmpDir, "no-notes.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);
    const notesChunk = result.chunks.find((c) => c.section?.includes("(notes)"));
    expect(notesChunk).toBeUndefined();
  });
});

describe("PptxIngestor — fallback path", () => {
  it("falls back to ast.toText() when there are no slide nodes", async () => {
    const mockParse = await getMockParseOffice();

    // AST with no "slide" type nodes — simulates an unusual export
    const flatAst = {
      content: [
        { type: "paragraph", text: "Flat paragraph one.", children: [] },
        { type: "paragraph", text: "Flat paragraph two.", children: [] },
      ],
      attachments: [],
      metadata: {},
      toText: () => "Flat paragraph one.\n\nFlat paragraph two.",
    };
    mockParse.mockResolvedValue(flatAst);

    const filePath = join(tmpDir, "flat.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.some((c) => c.text.includes("Flat paragraph"))).toBe(true);
  });
});

describe("PptxIngestor — officeparser call contract", () => {
  it("calls parseOffice with extractAttachments:false when no store is provided", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(makeMockAst([{ slideNumber: 1, content: "Content." }]));

    const filePath = join(tmpDir, "contract.pptx");
    await writeFile(filePath, "fake pptx bytes");

    // No embeddedImageStore — text-only path
    await new PptxIngestor().parse(filePath);

    expect(mockParse).toHaveBeenCalledWith(
      filePath,
      expect.objectContaining({
        extractAttachments: false,
        ignoreNotes: false,
      }),
    );
  });

  it("calls parseOffice with extractAttachments:true when a store is provided", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(makeMockAst([{ slideNumber: 1, content: "Content." }]));

    const filePath = join(tmpDir, "contract-images.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const store = new FsEmbeddedImageStore(tmpDir);
    await new PptxIngestor({ embeddedImageStore: store }).parse(filePath);

    expect(mockParse).toHaveBeenCalledWith(
      filePath,
      expect.objectContaining({
        extractAttachments: true,
        ignoreNotes: false,
      }),
    );
  });
});

describe("PptxIngestor — embedded image extraction", () => {
  it("saves each unique image attachment exactly once", async () => {
    const mockParse = await getMockParseOffice();
    const att = makeFakeAttachment("image1.png");

    // Two slides both reference the same image
    mockParse.mockResolvedValue(
      makeMockAst(
        [
          { slideNumber: 1, content: "Slide one.", imageAttachmentNames: ["image1.png"] },
          { slideNumber: 2, content: "Slide two.", imageAttachmentNames: ["image1.png"] },
        ],
        { attachments: [att] },
      ),
    );

    const filePath = join(tmpDir, "dedup.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const storeDir = join(tmpDir, "store-dedup");
    const store = new FsEmbeddedImageStore(storeDir);
    const saveSpy = vi.spyOn(store, "save");

    const result = await new PptxIngestor({ embeddedImageStore: store }).parse(filePath);

    // save() should be called exactly once despite two slides referencing the image
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ imageName: "image1.png" }),
    );

    // pendingEmbeddedImageDocId should be set and start with "_pending_"
    expect(result.pendingEmbeddedImageDocId).toBeDefined();
    expect(result.pendingEmbeddedImageDocId).toMatch(/^_pending_/);
  });

  it("populates imageNames on the chunks of slides that reference an image", async () => {
    const mockParse = await getMockParseOffice();
    const att = makeFakeAttachment("image1.png");

    mockParse.mockResolvedValue(
      makeMockAst(
        [
          { slideNumber: 1, content: "Slide with image.", imageAttachmentNames: ["image1.png"] },
          { slideNumber: 2, content: "Slide without image." },
        ],
        { attachments: [att] },
      ),
    );

    const filePath = join(tmpDir, "image-names.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const storeDir = join(tmpDir, "store-image-names");
    const store = new FsEmbeddedImageStore(storeDir);
    const result = await new PptxIngestor({ embeddedImageStore: store }).parse(filePath);

    const slide1Chunks = result.chunks.filter((c) => c.page === 1);
    const slide2Chunks = result.chunks.filter((c) => c.page === 2);

    expect(slide1Chunks.length).toBeGreaterThan(0);
    expect(slide2Chunks.length).toBeGreaterThan(0);

    // Slide 1 chunks should have imageNames set
    for (const c of slide1Chunks) {
      expect(c.imageNames).toEqual(["image1.png"]);
    }
    // Slide 2 chunks should NOT have imageNames (no image on this slide)
    for (const c of slide2Chunks) {
      expect(c.imageNames).toBeUndefined();
    }
  });

  it("saves multiple distinct images (one per unique name)", async () => {
    const mockParse = await getMockParseOffice();
    const att1 = makeFakeAttachment("image1.png");
    const att2 = makeFakeAttachment("image2.jpeg", "image/jpeg");

    mockParse.mockResolvedValue(
      makeMockAst(
        [
          { slideNumber: 1, content: "Slide one.", imageAttachmentNames: ["image1.png"] },
          { slideNumber: 2, content: "Slide two.", imageAttachmentNames: ["image2.jpeg"] },
        ],
        { attachments: [att1, att2] },
      ),
    );

    const filePath = join(tmpDir, "two-images.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const storeDir = join(tmpDir, "store-two-images");
    const store = new FsEmbeddedImageStore(storeDir);
    const saveSpy = vi.spyOn(store, "save");

    const result = await new PptxIngestor({ embeddedImageStore: store }).parse(filePath);

    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(result.pendingEmbeddedImageDocId).toMatch(/^_pending_/);
  });

  it("does not set pendingEmbeddedImageDocId when there are no image attachments", async () => {
    const mockParse = await getMockParseOffice();
    // AST has no attachments (e.g. text-only PPTX)
    mockParse.mockResolvedValue(
      makeMockAst([{ slideNumber: 1, content: "No images here." }], { attachments: [] }),
    );

    const filePath = join(tmpDir, "no-images.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const storeDir = join(tmpDir, "store-no-images");
    const store = new FsEmbeddedImageStore(storeDir);
    const result = await new PptxIngestor({ embeddedImageStore: store }).parse(filePath);

    expect(result.pendingEmbeddedImageDocId).toBeUndefined();
  });

  it("decodes Base64 before saving (bytes are not Base64 strings)", async () => {
    const mockParse = await getMockParseOffice();
    const rawBytes = Buffer.from("real binary image data \x89PNG");
    const att = {
      name: "image1.png",
      type: "image" as const,
      data: rawBytes.toString("base64"),
      mimeType: "image/png",
    };

    mockParse.mockResolvedValue(
      makeMockAst([{ slideNumber: 1, content: "Image slide." }], { attachments: [att] }),
    );

    const filePath = join(tmpDir, "decode-test.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const storeDir = join(tmpDir, "store-decode");
    const store = new FsEmbeddedImageStore(storeDir);
    const saveSpy = vi.spyOn(store, "save");

    await new PptxIngestor({ embeddedImageStore: store }).parse(filePath);

    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: expect.any(Buffer),
      }),
    );
    const savedBytes: Buffer = saveSpy.mock.calls[0]?.[0]?.bytes as Buffer;
    expect(savedBytes.equals(rawBytes)).toBe(true);
  });

  it("text-only path is unaffected (no store → no imageNames, no pendingEmbeddedImageDocId)", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(
      makeMockAst([{ slideNumber: 1, content: "Plain text slide." }]),
    );

    const filePath = join(tmpDir, "text-only.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const result = await new PptxIngestor().parse(filePath);

    expect(result.pendingEmbeddedImageDocId).toBeUndefined();
    for (const c of result.chunks) {
      expect(c.imageNames).toBeUndefined();
    }
  });

  it("notes chunks are also tagged with imageNames when their slide has images", async () => {
    const mockParse = await getMockParseOffice();
    const att = makeFakeAttachment("diagram.png");

    mockParse.mockResolvedValue(
      makeMockAst(
        [
          {
            slideNumber: 1,
            content: "Body text.",
            notes: "Speaker note referencing diagram.",
            imageAttachmentNames: ["diagram.png"],
          },
        ],
        { attachments: [att] },
      ),
    );

    const filePath = join(tmpDir, "notes-images.pptx");
    await writeFile(filePath, "fake pptx bytes");

    const storeDir = join(tmpDir, "store-notes-images");
    const store = new FsEmbeddedImageStore(storeDir);
    const result = await new PptxIngestor({ embeddedImageStore: store }).parse(filePath);

    const notesChunk = result.chunks.find((c) => c.section?.includes("(notes)"));
    expect(notesChunk).toBeDefined();
    expect(notesChunk?.imageNames).toEqual(["diagram.png"]);
  });
});

// Note: slow integration tests that run against the real fixture are in
// pptx-ingestor-integration.test.ts (separate file without the vi.mock so
// officeparser loads for real).
