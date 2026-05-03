import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsSketchStore, sketchRelativePath } from "../fs-sketch-store.js";

describe("sketchRelativePath", () => {
  it("returns <first-2-chars>/<id>.png", () => {
    const id = "abcdef1234567890";
    expect(sketchRelativePath(id)).toBe(`ab/${id}.png`);
  });
});

describe("FsSketchStore", () => {
  let tmpDir: string;
  let store: FsSketchStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "praxis-sketch-store-test-"));
    store = new FsSketchStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const id = "deadbeef1234567890abcdef12345678deadbeef1234567890abcdef12345678";
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]); // PNG magic bytes

  it("put returns the expected relative path", async () => {
    const path = await store.put(id, png);
    expect(path).toBe(sketchRelativePath(id));
  });

  it("has returns false before put", async () => {
    const rel = sketchRelativePath(id);
    expect(await store.has(rel)).toBe(false);
  });

  it("has returns true after put", async () => {
    const rel = await store.put(id, png);
    expect(await store.has(rel)).toBe(true);
  });

  it("get round-trips the bytes written by put", async () => {
    const rel = await store.put(id, png);
    const retrieved = await store.get(rel);
    expect(Buffer.compare(retrieved, png)).toBe(0);
  });

  it("put is idempotent — re-putting same id overwrites cleanly", async () => {
    const rel = await store.put(id, png);
    const newPng = Buffer.from([0x00, 0x01, 0x02]);
    await store.put(id, newPng);
    const retrieved = await store.get(rel);
    expect(Buffer.compare(retrieved, newPng)).toBe(0);
  });

  it("get throws for a missing file", async () => {
    const rel = sketchRelativePath(id);
    await expect(store.get(rel)).rejects.toThrow("FsSketchStore.get: file not found");
  });

  it("creates shard subdirectory on put", async () => {
    await store.put(id, png);
    const rel = sketchRelativePath(id);
    // The shard dir must exist for has() to succeed
    expect(await store.has(rel)).toBe(true);
  });
});
