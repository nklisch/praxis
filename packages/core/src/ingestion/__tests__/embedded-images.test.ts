import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsEmbeddedImageStore, sanitizeImageName } from "../embedded-images.js";

// ---------------------------------------------------------------------------
// FsEmbeddedImageStore unit tests
// Each test gets its own isolated temp directory — never touches the real
// user data directory.
// ---------------------------------------------------------------------------

let baseDir: string;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "praxis-embedded-images-test-"));
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

function makeStore(): FsEmbeddedImageStore {
  return new FsEmbeddedImageStore(baseDir);
}

const DOC_ID = "test-doc-id-123";
const IMAGE_NAME = "image1.png";
const MIME_TYPE = "image/png";
const SAMPLE_BYTES = Buffer.from("fake png bytes");

describe("FsEmbeddedImageStore — save and read round-trip", () => {
  it("saves and reads back the exact bytes", async () => {
    const store = makeStore();
    await store.save({
      documentId: DOC_ID,
      imageName: IMAGE_NAME,
      bytes: SAMPLE_BYTES,
      mimeType: MIME_TYPE,
    });

    const result = await store.read({ documentId: DOC_ID, imageName: IMAGE_NAME });
    expect(result).not.toBeNull();
    expect(result?.equals(SAMPLE_BYTES)).toBe(true);
  });

  it("returns null when the image does not exist", async () => {
    const store = makeStore();
    const result = await store.read({ documentId: DOC_ID, imageName: "nonexistent.png" });
    expect(result).toBeNull();
  });

  it("returns the absolute path from save()", async () => {
    const store = makeStore();
    const path = await store.save({
      documentId: DOC_ID,
      imageName: IMAGE_NAME,
      bytes: SAMPLE_BYTES,
      mimeType: MIME_TYPE,
    });
    expect(path).toContain(DOC_ID);
    expect(path).toContain(IMAGE_NAME);
    // Path returned by save() should match pathFor()
    expect(path).toBe(store.pathFor({ documentId: DOC_ID, imageName: IMAGE_NAME }));
  });

  it("creates intermediate directories automatically", async () => {
    const store = makeStore();
    // Nested doc ID with slashes would normally fail, but we're using flat doc IDs.
    // This test verifies mkdir -p behaviour is in place.
    await expect(
      store.save({
        documentId: "nested-doc",
        imageName: "slide1.jpg",
        bytes: SAMPLE_BYTES,
        mimeType: "image/jpeg",
      }),
    ).resolves.not.toThrow();

    const result = await store.read({ documentId: "nested-doc", imageName: "slide1.jpg" });
    expect(result).not.toBeNull();
  });
});

describe("FsEmbeddedImageStore — dirFor", () => {
  it("returns <baseDir>/<documentId>", () => {
    const store = makeStore();
    const dir = store.dirFor({ documentId: DOC_ID });
    expect(dir).toBe(join(baseDir, DOC_ID));
  });

  it("pathFor delegates to dirFor (path is dirFor + sanitized filename)", () => {
    const store = makeStore();
    const dir = store.dirFor({ documentId: DOC_ID });
    const path = store.pathFor({ documentId: DOC_ID, imageName: IMAGE_NAME });
    expect(path).toBe(join(dir, IMAGE_NAME));
  });
});

describe("FsEmbeddedImageStore — documentId path-traversal guard", () => {
  it("rejects documentId containing forward slash", () => {
    const store = makeStore();
    expect(() => store.dirFor({ documentId: "../../foo" })).toThrow(/Invalid documentId/);
    expect(() => store.dirFor({ documentId: "a/b" })).toThrow(/Invalid documentId/);
  });

  it("rejects documentId containing backslash", () => {
    const store = makeStore();
    expect(() => store.dirFor({ documentId: "a\\b" })).toThrow(/Invalid documentId/);
  });

  it("rejects documentId containing parent-dir component (..)", () => {
    const store = makeStore();
    expect(() => store.dirFor({ documentId: "..evil" })).toThrow(/Invalid documentId/);
  });

  it("rejects documentId containing null byte", () => {
    const store = makeStore();
    expect(() => store.dirFor({ documentId: "abc\0def" })).toThrow(/Invalid documentId/);
  });

  it("rejects documentId starting with tilde", () => {
    const store = makeStore();
    expect(() => store.dirFor({ documentId: "~/secrets" })).toThrow(/Invalid documentId/);
  });

  it("rejects documentId starting with Windows drive letter", () => {
    const store = makeStore();
    expect(() => store.dirFor({ documentId: "C:evil" })).toThrow(/Invalid documentId/);
  });

  it("rejects documentId starting with lowercase Windows drive prefix (c:)", () => {
    const store = makeStore();
    expect(() => store.dirFor({ documentId: "c:foo" })).toThrow(/Invalid documentId/);
  });

  it("rejects documentId starting with mixed-case Windows drive prefix (A:)", () => {
    const store = makeStore();
    expect(() => store.dirFor({ documentId: "A:" })).toThrow(/Invalid documentId/);
  });

  it("rejects traversal in deleteByDocumentId", async () => {
    const store = makeStore();
    await expect(store.deleteByDocumentId("../../foo")).rejects.toThrow(/Invalid documentId/);
  });

  it("allows a standard UUIDv7-shaped documentId", () => {
    const store = makeStore();
    const uuid = "01932e3b-4c4a-7f1b-8f0c-1234567890ab";
    expect(() => store.dirFor({ documentId: uuid })).not.toThrow();
  });

  it("allows a _pending_<uuid> documentId used by first-party ingestors", () => {
    const store = makeStore();
    const pending = "_pending_01932e3b-4c4a-7f1b-8f0c-1234567890ab";
    expect(() => store.dirFor({ documentId: pending })).not.toThrow();
  });
});

describe("FsEmbeddedImageStore — pathFor", () => {
  it("returns a path under <baseDir>/<documentId>/<sanitizedImageName>", () => {
    const store = makeStore();
    const path = store.pathFor({ documentId: DOC_ID, imageName: IMAGE_NAME });
    expect(path).toBe(join(baseDir, DOC_ID, IMAGE_NAME));
  });

  it("sanitizes image names in pathFor", () => {
    const store = makeStore();
    const path = store.pathFor({ documentId: DOC_ID, imageName: "my image (1).png" });
    expect(basename(path)).toBe("my_image__1_.png");
  });

  it("strips directory traversal in pathFor", () => {
    const store = makeStore();
    const path = store.pathFor({ documentId: DOC_ID, imageName: "../../evil.png" });
    expect(basename(path)).toBe("evil.png");
    // Must not escape the baseDir/<documentId> prefix
    expect(path).toContain(join(baseDir, DOC_ID));
  });
});

describe("FsEmbeddedImageStore — sanitization (via save/read)", () => {
  it("sanitizes a name with spaces and parentheses and still round-trips", async () => {
    const store = makeStore();
    const rawName = "my image (copy).png";
    const sanitized = sanitizeImageName(rawName);
    expect(sanitized).toBe("my_image__copy_.png");

    await store.save({
      documentId: DOC_ID,
      imageName: rawName,
      bytes: SAMPLE_BYTES,
      mimeType: MIME_TYPE,
    });
    const result = await store.read({ documentId: DOC_ID, imageName: rawName });
    expect(result?.equals(SAMPLE_BYTES)).toBe(true);
  });

  it("handles a typical PPTX image name without modification", () => {
    expect(sanitizeImageName("image1.png")).toBe("image1.png");
    expect(sanitizeImageName("Image-2.jpeg")).toBe("Image-2.jpeg");
    expect(sanitizeImageName("chart_data.png")).toBe("chart_data.png");
  });
});

describe("FsEmbeddedImageStore — deleteByDocumentId", () => {
  it("removes all images for a document", async () => {
    const store = makeStore();
    await store.save({
      documentId: DOC_ID,
      imageName: "img1.png",
      bytes: SAMPLE_BYTES,
      mimeType: MIME_TYPE,
    });
    await store.save({
      documentId: DOC_ID,
      imageName: "img2.png",
      bytes: SAMPLE_BYTES,
      mimeType: MIME_TYPE,
    });

    await store.deleteByDocumentId(DOC_ID);

    expect(await store.read({ documentId: DOC_ID, imageName: "img1.png" })).toBeNull();
    expect(await store.read({ documentId: DOC_ID, imageName: "img2.png" })).toBeNull();
  });

  it("is idempotent — does not throw when the directory is absent", async () => {
    const store = makeStore();
    await expect(store.deleteByDocumentId("nonexistent-doc-id")).resolves.not.toThrow();
  });

  it("does not affect images under other document IDs", async () => {
    const store = makeStore();
    await store.save({
      documentId: "doc-a",
      imageName: "img.png",
      bytes: SAMPLE_BYTES,
      mimeType: MIME_TYPE,
    });
    await store.save({
      documentId: "doc-b",
      imageName: "img.png",
      bytes: SAMPLE_BYTES,
      mimeType: MIME_TYPE,
    });

    await store.deleteByDocumentId("doc-a");

    expect(await store.read({ documentId: "doc-a", imageName: "img.png" })).toBeNull();
    expect(await store.read({ documentId: "doc-b", imageName: "img.png" })).not.toBeNull();
  });
});

describe("sanitizeImageName", () => {
  it("strips path components (directory traversal)", () => {
    expect(sanitizeImageName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeImageName("/abs/path/image.png")).toBe("image.png");
  });

  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeImageName("foo bar!.png")).toBe("foo_bar_.png");
    expect(sanitizeImageName("img@2x.png")).toBe("img_2x.png");
  });

  it("preserves safe characters unchanged", () => {
    expect(sanitizeImageName("image1.png")).toBe("image1.png");
    expect(sanitizeImageName("IMG-001.JPEG")).toBe("IMG-001.JPEG");
    expect(sanitizeImageName("chart_v2.0.png")).toBe("chart_v2.0.png");
  });
});
