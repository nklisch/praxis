import { promises as fs } from "node:fs";
import { join } from "node:path";

/**
 * Port: sketch PNG storage. Implemented by FsSketchStore; test doubles can
 * inject an in-memory implementation.
 */
export interface SketchStore {
  /**
   * Write the PNG bytes for `sketchId`. Returns the relative path (under root)
   * that should be stored in the `sketches.image_path` column.
   * Idempotent — content-addressed, so re-writes are safe no-ops in effect.
   */
  put(sketchId: string, png: Buffer): Promise<string>;

  /** Read the PNG bytes back. Throws if not found. */
  get(relativePath: string): Promise<Buffer>;

  /** True if a sketch's PNG exists. */
  has(relativePath: string): Promise<boolean>;
}

/**
 * Sharded relative path: first 2 chars of id as subdir, then `<id>.png`.
 * Example: `ab/abc123…def.png`.
 *
 * Sharding caps any single directory at ~256 entries for the first ~65 k
 * unique sketches — fine for v1.
 */
export function sketchRelativePath(sketchId: string): string {
  return `${sketchId.slice(0, 2)}/${sketchId}.png`;
}

/**
 * Filesystem implementation of SketchStore. Stores rendered PNGs under
 * `root`, sharded by the first 2 hex chars of the sketch id.
 *
 * root is typically `${dataDir}/sketches`; created on first put.
 */
export class FsSketchStore implements SketchStore {
  /** root: usually `${dbDir}/sketches`. Created lazily on first put. */
  constructor(private readonly root: string) {}

  async put(sketchId: string, png: Buffer): Promise<string> {
    const relativePath = sketchRelativePath(sketchId);
    const absPath = join(this.root, relativePath);
    // mkdir -p the shard directory on every put; this is idempotent and cheap.
    await fs.mkdir(join(this.root, sketchId.slice(0, 2)), { recursive: true });
    await fs.writeFile(absPath, png);
    return relativePath;
  }

  async get(relativePath: string): Promise<Buffer> {
    const absPath = join(this.root, relativePath);
    try {
      return await fs.readFile(absPath);
    } catch (err) {
      throw new Error(
        `FsSketchStore.get: file not found at ${absPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async has(relativePath: string): Promise<boolean> {
    const absPath = join(this.root, relativePath);
    try {
      await fs.access(absPath);
      return true;
    } catch {
      return false;
    }
  }
}
