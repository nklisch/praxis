import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MarkdownIngestor } from "../markdown-ingestor.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-md-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const SAMPLE_MD = `# My Document Title

Introduction paragraph with some content about the topic.

## Section One

Content of section one goes here. It has some interesting details.

### Subsection 1.1

More detailed content in the subsection.

## Section Two

Content of section two is different from section one.
`;

describe("MarkdownIngestor", () => {
  it("is always available", async () => {
    const ingestor = new MarkdownIngestor();
    expect(await ingestor.isAvailable()).toBe(true);
  });

  it("has correct metadata", () => {
    const ingestor = new MarkdownIngestor();
    expect(ingestor.id).toBe("markdown");
    expect(ingestor.extensions).toContain(".md");
    expect(ingestor.extensions).toContain(".markdown");
    expect(ingestor.mimeTypes).toContain("text/markdown");
  });

  it("extracts H1 as document title", async () => {
    const ingestor = new MarkdownIngestor();
    const filePath = join(tmpDir, "doc.md");
    await writeFile(filePath, SAMPLE_MD);

    const result = await ingestor.parse(filePath);
    expect(result.title).toBe("My Document Title");
  });

  it("falls back to filename when no H1 is present", async () => {
    const ingestor = new MarkdownIngestor();
    const filePath = join(tmpDir, "my-notes.md");
    await writeFile(filePath, "## Only a H2 heading\n\nSome content.");

    const result = await ingestor.parse(filePath);
    expect(result.title).toBe("my-notes");
  });

  it("produces section header chunks for headings", async () => {
    const ingestor = new MarkdownIngestor();
    const filePath = join(tmpDir, "doc.md");
    await writeFile(filePath, SAMPLE_MD);

    const result = await ingestor.parse(filePath);
    const sectionHeaders = result.chunks.filter((c) => c.blockType === "SectionHeader");
    expect(sectionHeaders.length).toBeGreaterThan(0);
    expect(sectionHeaders.some((c) => c.section === "Section One")).toBe(true);
  });

  it("assigns correct section to body chunks following a heading", async () => {
    const ingestor = new MarkdownIngestor();
    const filePath = join(tmpDir, "doc.md");
    await writeFile(filePath, SAMPLE_MD);

    const result = await ingestor.parse(filePath);
    const sec2Body = result.chunks.find(
      (c) => c.blockType !== "SectionHeader" && c.section === "Section Two",
    );
    expect(sec2Body).toBeDefined();
    expect(sec2Body?.text).toContain("section two");
  });

  it("returns ingestorId = markdown", async () => {
    const ingestor = new MarkdownIngestor();
    const filePath = join(tmpDir, "doc.md");
    await writeFile(filePath, "# Title\n\nContent.");

    const result = await ingestor.parse(filePath);
    expect(result.ingestorId).toBe("markdown");
  });
});
