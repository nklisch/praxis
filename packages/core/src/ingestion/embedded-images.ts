import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, dirname, join } from "node:path";

/**
 * Content-addressed storage for embedded images extracted from office documents
 * (PPTX slides, future: DOCX). Saved during PptxIngestor when an
 * EmbeddedImageStore is injected; sibling of PageImageStore.
 *
 * Storage layout:
 *   <baseDir>/<documentId>/<sanitizedImageName>
 * baseDir defaults to the OS user data directory; can be overridden via
 * `PRAXIS_EMBEDDED_IMAGES_DIR` environment variable.
 */
export interface EmbeddedImageStore {
  /** Save an embedded image and return the absolute path where it was written. */
  save(input: {
    documentId: string;
    imageName: string;
    bytes: Buffer;
    mimeType: string;
  }): Promise<string>;
  /** Read an embedded image, or return null if not found. */
  read(input: { documentId: string; imageName: string }): Promise<Buffer | null>;
  /** Delete all embedded images for a document. Called when the document is removed. */
  deleteByDocumentId(documentId: string): Promise<void>;
  /** Absolute path to the directory that holds all embedded images for a document. */
  dirFor(input: { documentId: string }): string;
  /** Absolute path where an embedded image would be (or is) stored. */
  pathFor(input: { documentId: string; imageName: string }): string;
}

export class FsEmbeddedImageStore implements EmbeddedImageStore {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? defaultBaseDir();
  }

  dirFor(input: { documentId: string }): string {
    return join(this.baseDir, input.documentId);
  }

  pathFor(input: { documentId: string; imageName: string }): string {
    return join(this.dirFor(input), sanitizeImageName(input.imageName));
  }

  async save(input: {
    documentId: string;
    imageName: string;
    bytes: Buffer;
    mimeType: string;
  }): Promise<string> {
    const path = this.pathFor(input);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.bytes);
    return path;
  }

  async read(input: { documentId: string; imageName: string }): Promise<Buffer | null> {
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

/**
 * Sanitize an image name so it is safe to use as a filename component.
 * Strips directory traversal by taking only the basename, then replaces any
 * character that is not alphanumeric, `.`, `_`, or `-` with `_`.
 *
 * Example: "../../evil.png"  → "evil.png"
 *          "image 1 (copy).png" → "image_1__copy_.png"
 *          "image1.png" → "image1.png"  (no change — typical PPTX name)
 */
export function sanitizeImageName(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function defaultBaseDir(): string {
  const env = process.env.PRAXIS_EMBEDDED_IMAGES_DIR;
  if (env) return env;
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Praxis", "document-embedded-images");
    case "win32":
      return join(process.env.APPDATA ?? home, "Praxis", "document-embedded-images");
    default:
      return join(home, ".local", "share", "praxis", "document-embedded-images");
  }
}
