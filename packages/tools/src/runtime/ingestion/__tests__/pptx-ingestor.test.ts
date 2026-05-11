import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
 * Each `slides` entry maps to a "slide" node with optional content text and
 * optional notes text.  The mock `toText()` concatenates all slide content.
 */
function makeMockAst(
  slides: Array<{
    slideNumber: number;
    content?: string;
    notes?: string;
    heading?: string;
  }>,
  opts: { metaTitle?: string } = {},
) {
  const contentNodes = slides.map((s) => ({
    type: "slide",
    text: [s.heading, s.content].filter(Boolean).join("\n"),
    metadata: { slideNumber: s.slideNumber },
    children: [
      ...(s.heading
        ? [{ type: "heading", text: s.heading, metadata: { level: 1 }, children: [] }]
        : []),
      ...(s.content ? [{ type: "paragraph", text: s.content, children: [] }] : []),
      ...(s.notes ? [{ type: "note", text: s.notes, children: [] }] : []),
    ],
  }));

  return {
    content: contentNodes,
    attachments: [],
    metadata: { title: opts.metaTitle },
    toText: () =>
      slides.map((s) => [s.heading, s.content, s.notes].filter(Boolean).join("\n")).join("\n"),
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
  it("calls parseOffice with extractAttachments:false and ignoreNotes:false", async () => {
    const mockParse = await getMockParseOffice();
    mockParse.mockResolvedValue(makeMockAst([{ slideNumber: 1, content: "Content." }]));

    const filePath = join(tmpDir, "contract.pptx");
    await writeFile(filePath, "fake pptx bytes");

    await new PptxIngestor().parse(filePath);

    expect(mockParse).toHaveBeenCalledWith(
      filePath,
      expect.objectContaining({
        extractAttachments: false,
        ignoreNotes: false,
      }),
    );
  });
});
