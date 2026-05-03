import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "@praxis/core/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { FsSketchStore } from "../../sketch/index.js";
import type { SketchId, StudentId } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { SketchServiceImpl } from "../sketch-service.js";

const db = useTempDb();

function makeLog() {
  const log = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => log,
  };
  return log;
}

const studentId = brandId<"StudentId">("student-test") as StudentId;

describe("SketchServiceImpl", () => {
  let storeDir: string;
  let service: SketchServiceImpl;

  beforeEach(() => {
    storeDir = mkdtempSync(join(tmpdir(), "praxis-sketch-svc-test-"));
    const { db: drizzle } = openDb({ path: db.dbPath });
    const store = new FsSketchStore(storeDir);
    service = new SketchServiceImpl({ db: drizzle, log: makeLog(), store });
  });

  afterEach(() => {
    rmSync(storeDir, { recursive: true, force: true });
  });

  const snapshot = { version: 1, shapes: [{ id: "s1", type: "geo" }] };
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header stub

  function expectedId(snap: unknown): string {
    return createHash("sha256").update(JSON.stringify(snap)).digest("hex");
  }

  describe("put", () => {
    it("returns a SketchSummary with the sha256 id", async () => {
      const summary = await service.put({
        studentId,
        snapshot,
        image: png,
        width: 320,
        height: 240,
      });
      expect(summary.id).toBe(expectedId(snapshot));
      expect(summary.width).toBe(320);
      expect(summary.height).toBe(240);
      expect(typeof summary.createdAt).toBe("number");
    });

    it("two identical snapshots return the same id", async () => {
      const a = await service.put({ studentId, snapshot, image: png, width: 320, height: 240 });
      const b = await service.put({ studentId, snapshot, image: png, width: 320, height: 240 });
      expect(a.id).toBe(b.id);
    });

    it("different snapshots produce different ids", async () => {
      const snap2 = { version: 1, shapes: [{ id: "s2", type: "draw" }] };
      const a = await service.put({ studentId, snapshot, image: png, width: 320, height: 240 });
      const b = await service.put({
        studentId,
        snapshot: snap2,
        image: png,
        width: 320,
        height: 240,
      });
      expect(a.id).not.toBe(b.id);
    });

    it("second identical put does not write to the store again (idempotent)", async () => {
      const storeRef = new FsSketchStore(storeDir);
      const storePutSpy = vi.spyOn(storeRef, "put");
      const { db: drizzle } = openDb({ path: db.dbPath });
      const svc = new SketchServiceImpl({ db: drizzle, log: makeLog(), store: storeRef });

      await svc.put({ studentId, snapshot, image: png, width: 100, height: 100 });
      await svc.put({ studentId, snapshot, image: png, width: 100, height: 100 });

      // store.put is called only on the first insert
      expect(storePutSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("get", () => {
    it("returns the full sketch with snapshot and image bytes", async () => {
      const summary = await service.put({
        studentId,
        snapshot,
        image: png,
        width: 320,
        height: 240,
      });
      const sketch = await service.get(summary.id as SketchId);

      expect(sketch.id).toBe(summary.id);
      expect(sketch.width).toBe(320);
      expect(sketch.height).toBe(240);
      expect(sketch.snapshot).toEqual(snapshot);
      expect(Buffer.compare(sketch.image, png)).toBe(0);
    });

    it("throws for an unknown id", async () => {
      const unknownId = "a".repeat(64) as SketchId;
      await expect(service.get(unknownId)).rejects.toThrow("sketch not found");
    });
  });

  describe("getSummary", () => {
    it("returns null for an unknown id", async () => {
      const unknownId = "b".repeat(64) as SketchId;
      const result = await service.getSummary(unknownId);
      expect(result).toBeNull();
    });

    it("returns the summary for a known id", async () => {
      const summary = await service.put({
        studentId,
        snapshot,
        image: png,
        width: 160,
        height: 90,
      });
      const fetched = await service.getSummary(summary.id as SketchId);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(summary.id);
      expect(fetched?.width).toBe(160);
      expect(fetched?.height).toBe(90);
    });

    it("never throws even for invalid ids", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test passthrough of unknown type
      const result = await service.getSummary(undefined as any);
      expect(result).toBeNull();
    });
  });
});
