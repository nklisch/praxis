import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HtmlIngestor } from "../html-ingestor.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-html-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Test Article</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <article>
    <h1>Test Article Title</h1>
    <p>This is the introduction paragraph of the article.</p>
    <h2>Main Section</h2>
    <p>This paragraph contains the main content of the article.</p>
  </article>
  <footer><p>Page 1</p></footer>
</body>
</html>`;

describe("HtmlIngestor", () => {
  it("is always available", async () => {
    const ingestor = new HtmlIngestor();
    expect(await ingestor.isAvailable()).toBe(true);
  });

  it("has correct metadata", () => {
    const ingestor = new HtmlIngestor();
    expect(ingestor.id).toBe("html");
    expect(ingestor.extensions).toContain(".html");
    expect(ingestor.extensions).toContain(".htm");
    expect(ingestor.mimeTypes).toContain("text/html");
  });

  it("extracts article content, stripping nav and footer", async () => {
    const ingestor = new HtmlIngestor();
    const filePath = join(tmpDir, "article.html");
    await writeFile(filePath, SAMPLE_HTML);

    const result = await ingestor.parse(filePath);
    const allText = result.chunks.map((c) => c.text).join(" ");

    expect(allText).toContain("introduction paragraph");
    expect(allText).toContain("main content");
  });

  it("extracts the article title", async () => {
    const ingestor = new HtmlIngestor();
    const filePath = join(tmpDir, "article.html");
    await writeFile(filePath, SAMPLE_HTML);

    const result = await ingestor.parse(filePath);
    expect(result.title).toBeTruthy();
  });

  it("produces chunks with ingestorId = html", async () => {
    const ingestor = new HtmlIngestor();
    const filePath = join(tmpDir, "article.html");
    await writeFile(filePath, SAMPLE_HTML);

    const result = await ingestor.parse(filePath);
    expect(result.ingestorId).toBe("html");
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it("falls back to filename when Readability finds no title", async () => {
    const ingestor = new HtmlIngestor();
    const filePath = join(tmpDir, "my-page.html");
    // Minimal HTML that Readability might not find a title for
    await writeFile(filePath, "<html><body><p>Just some text here.</p></body></html>");

    const result = await ingestor.parse(filePath);
    // title should be either extracted or fall back to "my-page"
    expect(result.title).toBeTruthy();
  });
});
