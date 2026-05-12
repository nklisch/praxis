/**
 * Unit tests for FsPageImageStore — save / read / deleteByDocumentId.
 * Uses a real temp dir so the filesystem operations are exercised.
 * No SQLite / migrations needed.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsPageImageStore } from "../ingestion/page-images.js";

let tmpDir: string;
let store: FsPageImageStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "praxis-page-images-test-"));
  store = new FsPageImageStore(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const FAKE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes

describe("FsPageImageStore", () => {
  it("save and read a page image round-trip", async () => {
    const path = await store.save({ documentId: "doc-1", page: 1, pngBytes: FAKE_PNG });
    expect(typeof path).toBe("string");
    expect(path).toContain("doc-1");

    const buf = await store.read({ documentId: "doc-1", page: 1 });
    expect(buf).not.toBeNull();
    expect(buf?.compare(FAKE_PNG)).toBe(0);
  });

  it("read returns null when image does not exist", async () => {
    const buf = await store.read({ documentId: "doc-missing", page: 1 });
    expect(buf).toBeNull();
  });

  it("save creates parent directories automatically", async () => {
    const pngBytes = Buffer.from("img-data");
    await store.save({ documentId: "nested-doc", page: 5, pngBytes });

    const buf = await store.read({ documentId: "nested-doc", page: 5 });
    expect(buf?.toString()).toBe("img-data");
  });

  it("save multiple pages for the same document", async () => {
    await store.save({ documentId: "doc-multi", page: 1, pngBytes: Buffer.from("page1") });
    await store.save({ documentId: "doc-multi", page: 2, pngBytes: Buffer.from("page2") });

    const buf1 = await store.read({ documentId: "doc-multi", page: 1 });
    const buf2 = await store.read({ documentId: "doc-multi", page: 2 });
    expect(buf1?.toString()).toBe("page1");
    expect(buf2?.toString()).toBe("page2");
  });

  it("deleteByDocumentId removes all pages for that document", async () => {
    await store.save({ documentId: "doc-del", page: 1, pngBytes: Buffer.from("p1") });
    await store.save({ documentId: "doc-del", page: 2, pngBytes: Buffer.from("p2") });

    await store.deleteByDocumentId("doc-del");

    expect(await store.read({ documentId: "doc-del", page: 1 })).toBeNull();
    expect(await store.read({ documentId: "doc-del", page: 2 })).toBeNull();
  });

  it("deleteByDocumentId is a no-op for non-existent documentId", async () => {
    // Should not throw
    await expect(store.deleteByDocumentId("does-not-exist")).resolves.toBeUndefined();
  });

  it("deleteByDocumentId does not affect other documents", async () => {
    await store.save({ documentId: "doc-keep", page: 1, pngBytes: Buffer.from("keep") });
    await store.save({ documentId: "doc-gone", page: 1, pngBytes: Buffer.from("gone") });

    await store.deleteByDocumentId("doc-gone");

    expect(await store.read({ documentId: "doc-keep", page: 1 })).not.toBeNull();
  });

  it("pathFor returns a stable path under baseDir", () => {
    const path = store.pathFor({ documentId: "doc-1", page: 3 });
    expect(path).toContain("doc-1");
    expect(path).toContain("3.png");
    expect(path.startsWith(tmpDir)).toBe(true);
  });

  it("dirFor returns <baseDir>/<documentId>", () => {
    const dir = store.dirFor({ documentId: "doc-1" });
    expect(dir).toBe(join(tmpDir, "doc-1"));
  });

  it("pathFor delegates to dirFor (path is dirFor + page filename)", () => {
    const dir = store.dirFor({ documentId: "doc-1" });
    const path = store.pathFor({ documentId: "doc-1", page: 7 });
    expect(path).toBe(join(dir, "7.png"));
  });

  it("PRAXIS_PAGE_IMAGES_DIR env var controls the default base dir", () => {
    const customDir = join(tmpDir, "custom");
    process.env.PRAXIS_PAGE_IMAGES_DIR = customDir;

    // Re-construct without explicit baseDir — should pick up env var
    const envStore = new FsPageImageStore();
    const path = envStore.pathFor({ documentId: "d", page: 1 });

    delete process.env.PRAXIS_PAGE_IMAGES_DIR;

    expect(path.startsWith(customDir)).toBe(true);
  });
});

describe("FsPageImageStore — documentId path-traversal guard", () => {
  it("rejects documentId containing forward slash", () => {
    expect(() => store.dirFor({ documentId: "../../foo" })).toThrow(/Invalid documentId/);
    expect(() => store.dirFor({ documentId: "a/b" })).toThrow(/Invalid documentId/);
  });

  it("rejects documentId containing backslash", () => {
    expect(() => store.dirFor({ documentId: "a\\b" })).toThrow(/Invalid documentId/);
  });

  it("rejects documentId containing parent-dir component (..)", () => {
    expect(() => store.dirFor({ documentId: "..evil" })).toThrow(/Invalid documentId/);
  });

  it("rejects documentId containing null byte", () => {
    expect(() => store.dirFor({ documentId: "abc\0def" })).toThrow(/Invalid documentId/);
  });

  it("rejects documentId starting with tilde", () => {
    expect(() => store.dirFor({ documentId: "~/secrets" })).toThrow(/Invalid documentId/);
  });

  it("rejects documentId starting with Windows drive letter", () => {
    expect(() => store.dirFor({ documentId: "C:evil" })).toThrow(/Invalid documentId/);
  });

  it("rejects traversal in deleteByDocumentId", async () => {
    await expect(store.deleteByDocumentId("../../foo")).rejects.toThrow(/Invalid documentId/);
  });

  it("allows a standard UUIDv7-shaped documentId", () => {
    const uuid = "01932e3b-4c4a-7f1b-8f0c-1234567890ab";
    expect(() => store.dirFor({ documentId: uuid })).not.toThrow();
  });

  it("allows a _pending_<uuid> documentId used by first-party ingestors", () => {
    const pending = "_pending_01932e3b-4c4a-7f1b-8f0c-1234567890ab";
    expect(() => store.dirFor({ documentId: pending })).not.toThrow();
  });
});
