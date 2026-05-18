import { notes as notesTable } from "@praxis/artifacts/schema";
import { configuratorSnapshots } from "@praxis/core/schema";
import { openDb } from "@praxis/core/db";
import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import type {
  ConceptId,
  ConceptLink,
  ConceptMapId,
  CourseId,
  NoteId,
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

  describe("setNodeLink", () => {
    it("adds a new link with best_guess state", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Link Map",
      });

      const updated = await service.setNodeLink({
        mapId: map.id,
        elementId: "shape:node1",
        candidateId: "concept-algebra-1",
        state: "best_guess",
      });

      expect(updated.conceptLinks).toHaveLength(1);
      const link = updated.conceptLinks[0];
      expect(link?.elementId).toBe("shape:node1");
      expect(link?.linkState).toBe("best_guess");
      expect(link?.conceptId as string).toBe("concept-algebra-1");
    });

    it("promotes best_guess to linked and sets confidence to 1.0", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Promote Map",
      });

      // First set as best_guess.
      await service.setNodeLink({
        mapId: map.id,
        elementId: "shape:node1",
        candidateId: "concept-geo-1",
        state: "best_guess",
      });

      // Confirm (promote to linked).
      const confirmed = await service.setNodeLink({
        mapId: map.id,
        elementId: "shape:node1",
        candidateId: "concept-geo-1",
        state: "linked",
      });

      const link = confirmed.conceptLinks.find((l) => l.elementId === "shape:node1");
      expect(link?.linkState).toBe("linked");
      expect(link?.confidence).toBe(1.0);
    });

    it("clears a link when state is unlinked and candidateId is null", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Clear Map",
      });

      await service.setNodeLink({
        mapId: map.id,
        elementId: "shape:node1",
        candidateId: "concept-bio-1",
        state: "linked",
      });

      const cleared = await service.setNodeLink({
        mapId: map.id,
        elementId: "shape:node1",
        candidateId: null,
        state: "unlinked",
      });

      expect(cleared.conceptLinks.find((l) => l.elementId === "shape:node1")).toBeUndefined();
    });

    it("throws when the map does not exist", async () => {
      const { service } = makeService();
      await expect(
        service.setNodeLink({
          mapId: brandId<"ConceptMapId">("nonexistent") as ConceptMapId,
          elementId: "shape:x",
          candidateId: "concept-x",
          state: "linked",
        }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("computeRipples", () => {
    it("returns zero counts for an empty map with no notes/sessions", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Ripple Map",
      });

      const ripples = await service.computeRipples({
        mapId: map.id,
        elementId: "shape:node1",
        candidateId: brandId<"ConceptId">("concept-new") as ConceptId,
      });

      // No notes, no open sessions → all zeros; adding a new concept counts as +1.
      expect(ripples.conceptCountDelta).toBe(1);
      expect(ripples.notesRetagged).toBe(0);
      expect(ripples.tutorRefsAffected).toBe(0);
    });

    it("returns conceptCountDelta of 0 when candidate is already linked on another node", async () => {
      const { service } = makeService();
      const map = await service.create({
        studentId: STUDENT_A,
        courseId: COURSE_X,
        title: "Dup Map",
      });

      // Link another node to the same candidate first.
      await service.setNodeLink({
        mapId: map.id,
        elementId: "shape:node1",
        candidateId: "concept-dup",
        state: "linked",
      });

      const ripples = await service.computeRipples({
        mapId: map.id,
        elementId: "shape:node2",
        candidateId: brandId<"ConceptId">("concept-dup") as ConceptId,
      });

      expect(ripples.conceptCountDelta).toBe(0);
    });

    it("returns zeros gracefully for a nonexistent map", async () => {
      const { service } = makeService();
      const ripples = await service.computeRipples({
        mapId: brandId<"ConceptMapId">("nonexistent") as ConceptMapId,
        elementId: "shape:x",
        candidateId: brandId<"ConceptId">("concept-x") as ConceptId,
      });
      expect(ripples).toEqual({ conceptCountDelta: 0, notesRetagged: 0, tutorRefsAffected: 0 });
    });
  });
});

// ── ConceptMapServiceImpl.convertFromSketch ───────────────────────────────────

describe("ConceptMapServiceImpl — convertFromSketch", () => {
  const NOTE_ID = brandId<"NoteId">("note-sketch-1") as NoteId;

  /** Build a minimal tldraw snapshot with text shapes and arrows. */
  function makeSketchScene(options?: {
    withNodes?: boolean;
    withArrow?: boolean;
    arrowLabel?: string;
  }): unknown {
    if (!options?.withNodes) {
      return { store: {} };
    }
    const store: Record<string, unknown> = {
      "shape:n1": {
        id: "shape:n1",
        type: "text",
        props: { text: "  Photosynthesis  " },
      },
      "shape:n2": {
        id: "shape:n2",
        type: "text",
        props: { text: "Chloroplast" },
      },
      "shape:geo1": {
        id: "shape:geo1",
        type: "geo",
        props: { geo: "rectangle", text: "" }, // empty — should be skipped
      },
    };
    if (options.withArrow) {
      store["shape:a1"] = {
        id: "shape:a1",
        type: "arrow",
        props: {
          start: { boundShapeId: "shape:n1" },
          end: { boundShapeId: "shape:n2" },
          text: options.arrowLabel ?? "",
        },
      };
    }
    return { store };
  }

  function seedSketchNote(
    drizzle: ReturnType<typeof openDb>["db"],
    sceneJson: unknown,
    courseId?: string,
  ) {
    drizzle
      .insert(notesTable)
      .values({
        id: NOTE_ID,
        studentId: STUDENT_A,
        contextJson: courseId ? { courseId } : {},
        format: "sketch",
        body: null,
        sketchSceneJson: sceneJson,
        linksJson: [],
        annotationsJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  }

  it("creates a concept map from labelled text shapes", async () => {
    const { service, db: drizzle } = makeService();
    seedSketchNote(drizzle, makeSketchScene({ withNodes: true }), COURSE_X);

    const result = await service.convertFromSketch(NOTE_ID, STUDENT_A);

    expect(result.originalSketchNoteId).toBe(NOTE_ID);
    expect(result.nodeCount).toBe(2); // shape:n1 and shape:n2 — geo1 is empty
    expect(result.conceptMapId).toBeTruthy();

    // Verify the map was created
    const map = await service.get(result.conceptMapId);
    expect(map).not.toBeNull();
    expect(map?.studentId).toBe(STUDENT_A);
    expect(map?.courseId).toBe(COURSE_X);
    expect(map?.title).toBe("From sketch");
  });

  it("preserves the original sketch note after conversion", async () => {
    const { service, db: drizzle } = makeService();
    seedSketchNote(drizzle, makeSketchScene({ withNodes: true }), COURSE_X);

    await service.convertFromSketch(NOTE_ID, STUDENT_A);

    // Sketch note must still exist in the DB.
    const noteRows = drizzle.select({ id: notesTable.id }).from(notesTable).all();
    expect(noteRows.some((r) => r.id === NOTE_ID)).toBe(true);
  });

  it("extracts edges with known relation labels", async () => {
    const { service, db: drizzle } = makeService();
    seedSketchNote(
      drizzle,
      makeSketchScene({ withNodes: true, withArrow: true, arrowLabel: "causes" }),
      COURSE_X,
    );

    const result = await service.convertFromSketch(NOTE_ID, STUDENT_A);
    expect(result.nodeCount).toBe(2);

    const map = await service.get(result.conceptMapId);
    // The scene should have arrows (edge shapes) for the arrow
    const scene = map?.scene as { store?: Record<string, { type?: string }> };
    const arrowShapes = Object.values(scene?.store ?? {}).filter((s) => s.type === "arrow");
    expect(arrowShapes.length).toBe(1);
  });

  it("returns nodeCount = 0 for an empty sketch scene", async () => {
    const { service, db: drizzle } = makeService();
    seedSketchNote(drizzle, makeSketchScene({ withNodes: false }), COURSE_X);

    const result = await service.convertFromSketch(NOTE_ID, STUDENT_A);
    expect(result.nodeCount).toBe(0);
  });

  it("records a configurator action + snapshot for undo", async () => {
    const { db: drizzle } = openDb({ path: db.dbPath });
    const service = new ConceptMapServiceImpl({
      db: drizzle,
      log: makeLog(),
      configuratorId: () => "default" as import("../../types/index.js").ConfiguratorId,
    });
    seedSketchNote(drizzle, makeSketchScene({ withNodes: true }), COURSE_X);

    const result = await service.convertFromSketch(NOTE_ID, STUDENT_A);

    // A configurator_snapshot row must exist keyed by the new concept map id.
    const snapshots = drizzle.select().from(configuratorSnapshots).all();
    const matchingSnapshot = snapshots.find(
      (s) => s.entityKind === "conceptMap.create" && s.entityKeyJson === result.conceptMapId,
    );
    expect(matchingSnapshot).toBeDefined();
    expect(matchingSnapshot?.restoredAt).toBeNull();
  });

  it("throws when the note is not found", async () => {
    const { service } = makeService();
    await expect(
      service.convertFromSketch(brandId<"NoteId">("missing-note") as NoteId, STUDENT_A),
    ).rejects.toThrow("note not found");
  });

  it("throws when the note is not a sketch format", async () => {
    const { service, db: drizzle } = makeService();
    // Insert a non-sketch note
    drizzle
      .insert(notesTable)
      .values({
        id: brandId<"NoteId">("note-free") as NoteId,
        studentId: STUDENT_A,
        contextJson: { courseId: COURSE_X },
        format: "free",
        body: JSON.stringify({ kind: "free", text: "hello" }),
        sketchSceneJson: null,
        linksJson: [],
        annotationsJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    await expect(
      service.convertFromSketch(brandId<"NoteId">("note-free") as NoteId, STUDENT_A),
    ).rejects.toThrow("not a sketch");
  });

  it("throws when the sketch has no courseId in context", async () => {
    const { service, db: drizzle } = makeService();
    seedSketchNote(drizzle, makeSketchScene({ withNodes: true }), undefined);
    await expect(service.convertFromSketch(NOTE_ID, STUDENT_A)).rejects.toThrow("no courseId");
  });
});
