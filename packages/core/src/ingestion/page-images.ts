import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

/**
 * Content-addressed storage for rendered PDF page images. Saved during
 * VisionPdfIngestor; read by `praxis.documents.pageImage` IPC for the
 * "View page" UI.
 *
 * Storage layout:
 *   <baseDir>/<documentId>/<pageNum>.png
 * baseDir defaults to the OS user data directory; can be overridden via
 * `PRAXIS_PAGE_IMAGES_DIR` environment variable.
 */
export interface PageImageStore {
  /** Save a page image and return the absolute path where it was written. */
  save(input: { documentId: string; page: number; pngBytes: Buffer }): Promise<string>;
  /** Read a page image, or return null if not found. */
  read(input: { documentId: string; page: number }): Promise<Buffer | null>;
  /** Delete all page images for a document. Called when the document is removed. */
  deleteByDocumentId(documentId: string): Promise<void>;
  /** Absolute path where a page image would be (or is) stored. */
  pathFor(input: { documentId: string; page: number }): string;
}

export class FsPageImageStore implements PageImageStore {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? defaultBaseDir();
  }

  pathFor(input: { documentId: string; page: number }): string {
    return join(this.baseDir, input.documentId, `${input.page}.png`);
  }

  async save(input: { documentId: string; page: number; pngBytes: Buffer }): Promise<string> {
    const path = this.pathFor(input);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.pngBytes);
    return path;
  }

  async read(input: { documentId: string; page: number }): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(input));
    } catch {
      return null;
    }
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await rm(join(this.baseDir, documentId), { recursive: true, force: true });
  }
}

function defaultBaseDir(): string {
  const env = process.env.PRAXIS_PAGE_IMAGES_DIR;
  if (env) return env;
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Praxis", "document-pages");
    case "win32":
      return join(process.env.APPDATA ?? home, "Praxis", "document-pages");
    default:
      return join(home, ".local", "share", "praxis", "document-pages");
  }
}
