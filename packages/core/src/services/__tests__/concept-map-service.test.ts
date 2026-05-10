import { openDb } from "@praxis/core/db";
import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import type {
  ConceptLink,
  ConceptMapId,
  CourseId,
  SessionId,
  StudentId,
  TldrawSnapshot,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { ConceptMapServiceImpl } from "../concept-map-service.js";

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

function makeService() {
  const { db: drizzle } = openDb({ path: db.dbPath });
  return { service: new ConceptMapServiceImpl({ db: drizzle, log: makeLog() }), db: drizzle };
}

const STUDENT_A = brandId<"StudentId">("student-a") as StudentId;
const COURSE_X = brandId<"CourseId">("course-x") as CourseId;
const COURSE_Y = brandId<"CourseId">("course-y") as CourseId;
const SESSION_1 = brandId<"SessionId">("session-1") as SessionId;

const SCENE_EMPTY = {} as TldrawSnapshot;
const SCENE_A = {
  shapes: { "shape:1": { type: "text", text: "hello" } },
} as unknown as TldrawSnapshot;
const SCENE_B = {
  shapes: { "shape:2": { type: "text", text: "world" } },
} as unknown as TldrawSnapshot;

const LINKS_A: ConceptLink[] = [
  { elementId: "shape:1", conceptId: brandId<"ConceptId">("concept-1"), confidence: 0.9 },
];

describe("ConceptMapServiceImpl", () => {
  describe("create", () => {
    it("returns a ConceptMapDrawing with empty scene and empty links", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "My First Map",
      });

      expect(map.id).toBeDefined();
      expect(map.studentId).toBe(STUDENT_A);
      expect(map.courseId).toBe(COURSE_X);
      expect(map.title).toBe("My First Map");
      expect(map.conceptLinks).toEqual([]);
      expect(map.divergences).toBeUndefined();
      expect(map.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it("creates an initial version row so the chain is non-empty", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Map With Version",
      });

      const versions = await service.listVersions(map.id);
      expect(versions).toHaveLength(1);
      const firstVersion = versions[0];
      expect(firstVersion?.sessionId).toBeUndefined(); // initial version has no session
      expect(firstVersion?.conceptMapId).toBe(map.id);
    });
  });

  describe("get", () => {
    it("returns null for unknown id", async () => {
      const { service } = makeService();
      const result = await service.get(brandId<"ConceptMapId">("nonexistent") as ConceptMapId);
      expect(result).toBeNull();
    });

    it("returns the map for a known id", async () => {
      const { service } = makeService();
      const created = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Test",
      });
      const found = await service.get(created.id);
      expect(found?.id).toBe(created.id);
    });
  });

  describe("list", () => {
    it("returns empty array when no maps exist for course", async () => {
      const { service } = makeService();
      const result = await service.list({ studentId: STUDENT_A, courseId: COURSE_Y });
      expect(result).toEqual([]);
    });

    it("lists maps for a (student, course), ordered by updatedAt descending", async () => {
      const { service } = makeService();
      await service.create({ studentId: STUDENT_A, courseId: COURSE_X, title: "Map A" });
      // Small delay to ensure different timestamps.
      await new Promise((r) => setTimeout(r, 5));
      await service.create({ studentId: STUDENT_A, courseId: COURSE_X, title: "Map B" });

      const summaries = await service.list({ studentId: STUDENT_A, courseId: COURSE_X });
      expect(summaries).toHaveLength(2);
      // Most-recently created comes first.
      const [first, second] = summaries;
      expect(first?.title).toBe("Map B");
      expect(second?.title).toBe("Map A");
    });

    it("summary includes versionCount and hasDivergences", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Div Map",
      });
      await service.setDivergences(map.id, [
        { kind: "missing-concept", description: "Missing X", elementIds: [] },
      ]);

      const [summary] = await service.list({ studentId: STUDENT_A, courseId: COURSE_X });
      expect(summary?.versionCount).toBe(1); // initial version
      expect(summary?.hasDivergences).toBe(true);
    });

    it("does not list maps from other courses", async () => {
      const { service } = makeService();
      await service.create({ studentId: STUDENT_A, courseId: COURSE_X, title: "Course X Map" });
      const others = await service.list({ studentId: STUDENT_A, courseId: COURSE_Y });
      expect(others).toHaveLength(0);
    });
  });

  describe("rename", () => {
    it("updates the title and bumps updatedAt", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Old Name",
      });
      const t0 = map.updatedAt;
      await new Promise((r) => setTimeout(r, 5));
      const renamed = await service.rename(map.id, "New Name");
      expect(renamed.title).toBe("New Name");
      expect(renamed.updatedAt).toBeGreaterThan(t0);
    });
  });

  describe("updateScene", () => {
    it("persists scene + links and bumps updatedAt without adding a version", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Scene Map",
      });
      const beforeVersionCount = (await service.listVersions(map.id)).length;

      await new Promise((r) => setTimeout(r, 5));
      const updated = await service.updateScene({
        id: map.id,
        scene: SCENE_A,
        conceptLinks: LINKS_A,
      });

      expect(updated.conceptLinks).toHaveLength(1);
      expect(updated.updatedAt).toBeGreaterThan(map.updatedAt);

      // No new version row should be added.
      const afterVersionCount = (await service.listVersions(map.id)).length;
      expect(afterVersionCount).toBe(beforeVersionCount);
    });
  });

  describe("delete", () => {
    it("removes the map and cascades to versions", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Delete Me",
      });

      await service.delete(map.id);

      const found = await service.get(map.id);
      expect(found).toBeNull();

      // Versions should also be gone (cascade FK).
      const versions = await service.listVersions(map.id);
      expect(versions).toHaveLength(0);
    });
  });

  describe("listVersions", () => {
    it("returns versions ordered by snapshotAt ascending", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Versioned",
      });

      // Update scene to create a dirty state.
      await service.updateScene({ id: map.id, scene: SCENE_A, conceptLinks: LINKS_A });
      await new Promise((r) => setTimeout(r, 5));
      await service.snapshotIfDirty({ id: map.id, sessionId: SESSION_1 });

      await service.updateScene({ id: map.id, scene: SCENE_B, conceptLinks: [] });
      await new Promise((r) => setTimeout(r, 5));
      await service.snapshotIfDirty({ id: map.id, sessionId: SESSION_1 });

      const versions = await service.listVersions(map.id);
      // Initial + 2 snapshots = 3 total.
      expect(versions.length).toBeGreaterThanOrEqual(3);
      // Verify ascending order.
      for (let i = 1; i < versions.length; i++) {
        // biome-ignore lint/suspicious/noExplicitAny: vitest index access in a loop, bounds checked
        const curr = (versions as any)[i] as (typeof versions)[number];
        // biome-ignore lint/suspicious/noExplicitAny: vitest index access in a loop, bounds checked
        const prev = (versions as any)[i - 1] as (typeof versions)[number];
        expect(curr.snapshotAt).toBeGreaterThanOrEqual(prev.snapshotAt);
      }
    });
  });

  describe("snapshotIfDirty", () => {
    it("adds a version when scene changed", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Dirty",
      });

      await service.updateScene({ id: map.id, scene: SCENE_A, conceptLinks: LINKS_A });

      const result = await service.snapshotIfDirty({ id: map.id, sessionId: SESSION_1 });
      expect(result.snapshotted).toBe(true);
      expect(result.versionId).toBeDefined();

      const versions = await service.listVersions(map.id);
      const newVersion = versions.find((v) => v.id === result.versionId);
      expect(newVersion?.sessionId).toBe(SESSION_1);
    });

    it("returns { snapshotted: false } when scene has not changed", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Clean",
      });
      // Scene matches initial version — no change.
      const result = await service.snapshotIfDirty({ id: map.id, sessionId: SESSION_1 });
      expect(result.snapshotted).toBe(false);
      expect(result.versionId).toBeUndefined();
    });

    it("is idempotent: calling twice with no change between calls adds only one version", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Idempotent",
      });

      await service.updateScene({ id: map.id, scene: SCENE_A, conceptLinks: [] });

      await service.snapshotIfDirty({ id: map.id, sessionId: SESSION_1 });
      // Second call — no change since first snapshot.
      const second = await service.snapshotIfDirty({ id: map.id, sessionId: SESSION_1 });
      expect(second.snapshotted).toBe(false);
    });

    it("returns false for unknown map id", async () => {
      const { service } = makeService();
      const result = await service.snapshotIfDirty({
        id: brandId<"ConceptMapId">("ghost") as ConceptMapId,
        sessionId: SESSION_1,
      });
      expect(result.snapshotted).toBe(false);
    });
  });

  describe("setDivergences", () => {
    it("persists divergences and round-trips", async () => {
      const { service } = makeService();
      const map = await service.create({ studentId: STUDENT_A, courseId: COURSE_X, title: "Div" });

      const divergences = [
        { kind: "missing-edge" as const, description: "Missing edge A→B", elementIds: ["shape:1"] },
        { kind: "extra-edge" as const, description: "Extra edge C→D", elementIds: ["shape:2"] },
      ];

      await service.setDivergences(map.id, divergences);
      const updated = await service.get(map.id);
      expect(updated?.divergences).toEqual(divergences);
    });
  });
});
