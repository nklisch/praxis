/**
 * Slow integration tests for PptxIngestor against the real fixture file.
 *
 * These tests use the real `officeparser` library (NOT mocked) to verify
 * end-to-end behavior against `sample.pptx`. They are gated behind
 * `PRAXIS_RUN_SLOW_TESTS` per the `slow-test-gating` pattern.
 *
 * This file is intentionally separate from `pptx-ingestor.test.ts` because
 * that file uses `vi.mock("officeparser", ...)` at module scope, which would
 * intercept the lazy import inside PptxIngestor and prevent real parsing.
 *
 * Known fixture contents (sample.pptx — from officeparser test suite, MIT):
 *   - 9 slides
 *   - 4 slides with speaker notes (slides 1–4)
 *   - 1 embedded image: image1.png on slide 7
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FsEmbeddedImageStore } from "@praxis/core/ingestion";
import { PptxIngestor } from "../pptx-ingestor.js";

const fixturePath = join(import.meta.dirname, "fixtures", "sample.pptx");

describe.skipIf(!process.env.PRAXIS_RUN_SLOW_TESTS)(
  "PptxIngestor against real fixture (slow)",
  () => {
    it("extracts chunks spanning all 9 slides", async () => {
      const ingestor = new PptxIngestor();
      const result = await ingestor.parse(fixturePath);
      expect(result.chunks.length).toBeGreaterThan(0);
      const pages = new Set(result.chunks.map((c) => c.page).filter((p) => p !== undefined));
      expect(pages.size).toBeGreaterThanOrEqual(9);
    }, 120_000);

    it("produces notes chunks for at least 4 slides", async () => {
      const ingestor = new PptxIngestor();
      const result = await ingestor.parse(fixturePath);
      const notesChunks = result.chunks.filter((c) => c.section?.includes("(notes)"));
      expect(notesChunks.length).toBeGreaterThanOrEqual(4);
    }, 120_000);

    it("sets ingestorId to 'pptx'", async () => {
      const ingestor = new PptxIngestor();
      const result = await ingestor.parse(fixturePath);
      expect(result.ingestorId).toBe("pptx");
    }, 120_000);

    it("extracts the embedded image (image1.png) into the store", async () => {
      const storeDir = await mkdtemp(join(tmpdir(), "praxis-pptx-slow-"));
      try {
        const store = new FsEmbeddedImageStore(storeDir);
        const ingestor = new PptxIngestor({ embeddedImageStore: store });
        const result = await ingestor.parse(fixturePath);

        // pendingEmbeddedImageDocId must be set
        expect(result.pendingEmbeddedImageDocId).toBeDefined();
        expect(result.pendingEmbeddedImageDocId).toMatch(/^_pending_/);

        // The fixture has one image attachment (image1.png on slide 7).
        // The store saves it under the synthetic doc ID.
        // biome-ignore lint/style/noNonNullAssertion: checked above
        const syntheticDocId = result.pendingEmbeddedImageDocId!;
        const savedImage = await store.read({ documentId: syntheticDocId, imageName: "image1.png" });
        expect(savedImage).not.toBeNull();
        // biome-ignore lint/style/noNonNullAssertion: checked above
        expect(savedImage!.length).toBeGreaterThan(0);
      } finally {
        await rm(storeDir, { recursive: true, force: true });
      }
    }, 120_000);

    it("tags at least one chunk with imageNames: ['image1.png']", async () => {
      const storeDir = await mkdtemp(join(tmpdir(), "praxis-pptx-slow-"));
      try {
        const store = new FsEmbeddedImageStore(storeDir);
        const ingestor = new PptxIngestor({ embeddedImageStore: store });
        const result = await ingestor.parse(fixturePath);

        // image1.png appears on slide 7 — at least the slide 7 body chunk
        // should be tagged.
        const chunksWithImage = result.chunks.filter(
          (c) => c.imageNames?.includes("image1.png"),
        );
        expect(chunksWithImage.length).toBeGreaterThan(0);
      } finally {
        await rm(storeDir, { recursive: true, force: true });
      }
    }, 120_000);

    it("does not set pendingEmbeddedImageDocId when no store is injected", async () => {
      const ingestor = new PptxIngestor();
      const result = await ingestor.parse(fixturePath);
      expect(result.pendingEmbeddedImageDocId).toBeUndefined();
    }, 120_000);
  },
);
