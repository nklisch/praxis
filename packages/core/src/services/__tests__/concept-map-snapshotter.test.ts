/**
 * ConceptMapSnapshotter tests.
 *
 * Uses a real temp DB + ConceptMapServiceImpl to exercise the full round-trip.
 * Also tests graceful failure paths via a mock service.
 */

import { openDb } from "@praxis/core/db";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import type {
  ConceptMapId,
  ConceptMapService,
  ConceptMapSummary,
  CourseId,
  IndexerContext,
  SessionId,
  StudentId,
  Timestamp,
  TldrawSnapshot,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { ConceptMapServiceImpl } from "../concept-map-service.js";
import { ConceptMapSnapshotter } from "../concept-map-snapshotter.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUDENT_A = brandId<"StudentId">("student-snap-a") as StudentId;
const COURSE_X = brandId<"CourseId">("course-snap-x") as CourseId;
const SESSION_1 = brandId<"SessionId">("session-snap-1") as SessionId;

const SCENE_A = {
  shapes: { "shape:1": { type: "text", text: "concept alpha" } },
} as unknown as TldrawSnapshot;

const dbCtx = useTempDb();

function makeLog() {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => log),
  };
  return log;
}

function makeCtx(): IndexerContext {
  return {
    studentId: STUDENT_A,
    sessionId: SESSION_1,
    events: [],
    log: makeLog(),
  };
}

function makeService() {
  const { db } = openDb({ path: dbCtx.dbPath });
  return {
    conceptMaps: new ConceptMapServiceImpl({ db, log: makeLog() }),
    db,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ConceptMapSnapshotter — sessionCourseId returns null", () => {
  it("returns early without touching conceptMaps when no courseId", async () => {
    const { conceptMaps } = makeService();
    const listSpy = vi.spyOn(conceptMaps, "list");

    const snapshotter = new ConceptMapSnapshotter({
      log: makeLog(),
      conceptMaps,
      sessionCourseId: () => null,
    });

    await snapshotter.run(makeCtx());
    expect(listSpy).not.toHaveBeenCalled();
  });
});

describe("ConceptMapSnapshotter — no maps for course", () => {
  it("completes without calling snapshotIfDirty when course has no maps", async () => {
    const { conceptMaps } = makeService();
    const snapshotSpy = vi.spyOn(conceptMaps, "snapshotIfDirty");

    const snapshotter = new ConceptMapSnapshotter({
      log: makeLog(),
      conceptMaps,
      sessionCourseId: () => COURSE_X,
    });

    await snapshotter.run(makeCtx());
    expect(snapshotSpy).not.toHaveBeenCalled();
  });
});

describe("ConceptMapSnapshotter — dirty map gets snapshotted", () => {
  it("creates a new version when the map has changed since the last snapshot", async () => {
    const { conceptMaps } = makeService();

    // Create a map and update its scene so it's dirty.
    const map = await conceptMaps.create({
      studentId: STUDENT_A,
      courseId: COURSE_X,
      title: "Dirty Map",
    });
    await conceptMaps.updateScene({ id: map.id, scene: SCENE_A, conceptLinks: [] });

    const versionsBefore = await conceptMaps.listVersions(map.id);

    const log = makeLog();
    const snapshotter = new ConceptMapSnapshotter({
      log,
      conceptMaps,
      sessionCourseId: () => COURSE_X,
    });

    await snapshotter.run(makeCtx());

    const versionsAfter = await conceptMaps.listVersions(map.id);
    expect(versionsAfter.length).toBe(versionsBefore.length + 1);
    expect(log.info).toHaveBeenCalledWith(
      "conceptMap.snapshotted",
      expect.objectContaining({ mapId: map.id }),
    );
  });
});

describe("ConceptMapSnapshotter — clean map is not snapshotted", () => {
  it("does not add a version when the map matches the last snapshot", async () => {
    const { conceptMaps } = makeService();

    // Create a map but don't change the scene (so it equals the initial version).
    const map = await conceptMaps.create({
      studentId: STUDENT_A,
      courseId: COURSE_X,
      title: "Clean Map",
    });

    const versionsBefore = await conceptMaps.listVersions(map.id);

    const snapshotter = new ConceptMapSnapshotter({
      log: makeLog(),
      conceptMaps,
      sessionCourseId: () => COURSE_X,
    });

    await snapshotter.run(makeCtx());

    const versionsAfter = await conceptMaps.listVersions(map.id);
    expect(versionsAfter.length).toBe(versionsBefore.length);
  });
});

describe("ConceptMapSnapshotter — per-map failure is non-fatal", () => {
  it("logs a warn but continues to subsequent maps when one throws", async () => {
    // Use a mock ConceptMapService that throws on the first map's snapshotIfDirty.
    let callCount = 0;
    const mockMaps: ConceptMapService = {
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn().mockResolvedValue([
        { id: brandId<"ConceptMapId">("map-fail") as ConceptMapId, title: "Map 1" },
        { id: brandId<"ConceptMapId">("map-ok") as ConceptMapId, title: "Map 2" },
      ] satisfies Partial<ConceptMapSummary>[] as ConceptMapSummary[]),
      rename: vi.fn(),
      delete: vi.fn(),
      updateScene: vi.fn(),
      listVersions: vi.fn(),
      snapshotIfDirty: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error("DB write failed");
        return { snapshotted: true, versionId: "v-ok" };
      }),
      setDivergences: vi.fn(),
      setNodeLink: vi.fn(),
      computeRipples: vi.fn(),
      convertFromSketch: vi.fn(),
    };

    const log = makeLog();
    const snapshotter = new ConceptMapSnapshotter({
      log,
      conceptMaps: mockMaps,
      sessionCourseId: () => COURSE_X,
    });

    await snapshotter.run(makeCtx());

    // First map failed → warn logged.
    expect(log.warn).toHaveBeenCalledWith(
      "conceptMap.snapshot_failed",
      expect.objectContaining({ mapId: brandId<"ConceptMapId">("map-fail") }),
    );

    // Second map succeeded → info logged.
    expect(log.info).toHaveBeenCalledWith(
      "conceptMap.snapshotted",
      expect.objectContaining({ mapId: brandId<"ConceptMapId">("map-ok") }),
    );
  });
});

describe("ConceptMapSnapshotter — multiple maps for course", () => {
  it("snapshots all dirty maps in the course", async () => {
    const { conceptMaps } = makeService();

    const mapA = await conceptMaps.create({
      studentId: STUDENT_A,
      courseId: COURSE_X,
      title: "Map Alpha",
    });
    const mapB = await conceptMaps.create({
      studentId: STUDENT_A,
      courseId: COURSE_X,
      title: "Map Beta",
    });

    // Dirty both maps.
    await conceptMaps.updateScene({ id: mapA.id, scene: SCENE_A, conceptLinks: [] });
    await conceptMaps.updateScene({
      id: mapB.id,
      scene: { shapes: { "shape:2": { type: "text", text: "beta" } } } as unknown as TldrawSnapshot,
      conceptLinks: [],
    });

    const snapshotter = new ConceptMapSnapshotter({
      log: makeLog(),
      conceptMaps,
      sessionCourseId: () => COURSE_X,
    });

    await snapshotter.run(makeCtx());

    // Both should have gotten a new version row (initial + snapshot = 2).
    const versA = await conceptMaps.listVersions(mapA.id);
    const versB = await conceptMaps.listVersions(mapB.id);
    expect(versA.length).toBeGreaterThanOrEqual(2);
    expect(versB.length).toBeGreaterThanOrEqual(2);

    // Version should be associated with the session.
    const lastA = versA[versA.length - 1];
    const lastB = versB[versB.length - 1];
    expect(lastA?.sessionId).toBe(SESSION_1);
    expect(lastB?.sessionId).toBe(SESSION_1);
  });
});
