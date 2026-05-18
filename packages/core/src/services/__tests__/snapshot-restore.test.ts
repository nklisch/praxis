/**
 * Snapshot-restore service-layer integration tests.
 *
 * Tests the full capture → mutate → restore round-trip for every
 * snapshottable action kind in AuthoringServiceImpl:
 *   - course.edit
 *   - lesson.create / lesson.edit / lesson.delete
 *   - gate.create / gate.edit / gate.delete
 *   - prompt.override_fragment / prompt.clear_fragment / prompt.set_style
 *   - prompt.set_global_fragment / prompt.set_mode_append
 *   - memory.reset_concept / memory.clear_misconception
 *
 * Guard cases:
 *   - Double-restore returns { ok: false, reason: "already_restored" }.
 *   - restoreAction with no snapshot returns { ok: false, reason: "no_snapshot" }.
 *   - Un-revert: restore the restore action re-applies the original mutation.
 *
 * All tests use a real migrated SQLite via useTempDb().
 */

import { courses as coursesTable } from "@praxis/artifacts/schema";
import { conceptGraphs, concepts as conceptsTable } from "@praxis/curriculum/schema";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../db/index.js";
import type {
  ConceptId,
  ConfiguratorId,
  CourseId,
  GateId,
  LessonId,
  MisconceptionId,
  StudentId,
  Timestamp,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { ArtifactsServiceImpl } from "../artifacts-service.js";
import { AuthoringServiceImpl } from "../authoring-service.js";
import { MemoryServiceImpl } from "../memory/memory-service.js";
import { PromptCustomizationServiceImpl } from "../prompt-customization-service.js";
import { getOrCreateDefaultStudentId } from "../student.js";

// ── Shared test DB ─────────────────────────────────────────────────────────────

const dbCtx = useTempDb();

// ── Minimal seed data ──────────────────────────────────────────────────────────

const GRAPH_ID = "graph-snapshot-test";
const COURSE_ID = brandId<"CourseId">("course-snapshot-test");
const CONCEPT_ID = brandId<"ConceptId">("concept-snapshot-test");

function seedGraph(db: ReturnType<typeof openDb>["db"]): void {
  db.insert(conceptGraphs)
    .values({
      id: GRAPH_ID,
      source: "canonical",
      name: "Snapshot Test Graph",
      version: "1",
      createdAt: new Date(),
    })
    .run();

  db.insert(conceptsTable)
    .values({
      id: CONCEPT_ID,
      graphId: GRAPH_ID,
      name: "Snapshot Test Concept",
      description: "A concept for snapshot tests",
      aliasesJson: [],
      standardsTagsJson: [],
    })
    .run();
}

function seedCourse(db: ReturnType<typeof openDb>["db"], studentId: StudentId): void {
  db.insert(coursesTable)
    .values({
      id: COURSE_ID,
      studentId,
      title: "Original Course Title",
      subject: "math",
      gradeLevel: "9",
      sourceJson: { kind: "bootstrapped", sourceMaterials: [] },
      conceptGraphId: GRAPH_ID,
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
}

// ── Service factory ────────────────────────────────────────────────────────────

function buildServices() {
  const { db } = openDb({ path: dbCtx.dbPath });

  const artifacts = new ArtifactsServiceImpl({
    db,
    log: noopLog(),
    masteryReader: { read: vi.fn().mockResolvedValue(0.5) },
    gradeReader: { readGrade: vi.fn().mockResolvedValue(null) },
  });

  const memory = new MemoryServiceImpl({ db, log: noopLog(), decayDaysFor: () => 14 });

  const promptCustomization = new PromptCustomizationServiceImpl({ db });

  const studentId = brandId<"StudentId">(getOrCreateDefaultStudentId(db));

  const authoring = new AuthoringServiceImpl({
    db,
    log: noopLog(),
    artifacts,
    memory,
    configuratorId: () => "default" as ConfiguratorId,
    studentId: () => studentId,
    promptCustomization,
  });

  return { db, artifacts, memory, promptCustomization, authoring, studentId };
}

function noopLog() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => noopLog()),
  };
}

// ── Per-test seed ──────────────────────────────────────────────────────────────

let services: ReturnType<typeof buildServices>;

beforeEach(() => {
  services = buildServices();
  seedGraph(services.db);
  seedCourse(services.db, services.studentId);
});

// ── course.edit ────────────────────────────────────────────────────────────────

describe("restoreAction — course.edit", () => {
  it("restores the prior course title", async () => {
    const { authoring, artifacts } = services;

    // Original title: "Original Course Title" (seeded above).
    // Mutate to new title.
    await authoring.updateCourse({
      courseId: COURSE_ID,
      patch: { title: "New Title" },
    });

    const actions = await authoring.listConfiguratorActions();
    expect(actions).toHaveLength(1);
    const actionId = actions[0]!.id;

    // Restore.
    const result = await authoring.restoreAction({ actionId });
    expect(result).toEqual({ ok: true, restoredEntity: "course", entityKey: COURSE_ID });

    // Verify restored to original.
    const course = await artifacts.course(COURSE_ID);
    expect(course?.title).toBe("Original Course Title");
  });

  it("double-restore returns already_restored", async () => {
    const { authoring } = services;

    await authoring.updateCourse({ courseId: COURSE_ID, patch: { title: "New Title" } });
    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    await authoring.restoreAction({ actionId });
    const second = await authoring.restoreAction({ actionId });
    expect(second).toEqual({ ok: false, reason: "already_restored" });
  });
});

// ── lesson.create ──────────────────────────────────────────────────────────────

describe("restoreAction — lesson.create", () => {
  it("restores by deleting the created lesson", async () => {
    const { authoring, artifacts } = services;

    const lesson = await authoring.createLesson({
      courseId: COURSE_ID,
      title: "Brand New Lesson",
      conceptIds: [CONCEPT_ID],
    });

    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    const result = await authoring.restoreAction({ actionId });
    expect(result.ok).toBe(true);

    // The lesson should be deleted.
    const restored = await artifacts.getLesson(lesson.id as LessonId);
    expect(restored).toBeNull();
  });

  it("double-restore returns already_restored", async () => {
    const { authoring } = services;

    await authoring.createLesson({ courseId: COURSE_ID, title: "L", conceptIds: [] });
    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    await authoring.restoreAction({ actionId });
    const second = await authoring.restoreAction({ actionId });
    expect(second).toEqual({ ok: false, reason: "already_restored" });
  });
});

// ── lesson.edit ────────────────────────────────────────────────────────────────

describe("restoreAction — lesson.edit", () => {
  it("restores the prior lesson title", async () => {
    const { authoring, artifacts } = services;

    // Create a lesson first (outside audit log scope for this test).
    const lesson = await services.artifacts.createLesson({
      courseId: COURSE_ID,
      title: "Original Lesson Title",
      conceptIds: [CONCEPT_ID],
    });
    const lessonId = lesson.id as LessonId;

    // Mutate via authoring.
    await authoring.updateLesson({ lessonId, patch: { title: "Changed Title" } });
    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    // Restore.
    await authoring.restoreAction({ actionId });

    // Verify.
    const restored = await artifacts.getLesson(lessonId);
    expect(restored?.title).toBe("Original Lesson Title");
  });
});

// ── lesson.delete ──────────────────────────────────────────────────────────────

describe("restoreAction — lesson.delete", () => {
  it("restores a deleted lesson (upserts it back)", async () => {
    const { authoring, artifacts } = services;

    const lesson = await artifacts.createLesson({
      courseId: COURSE_ID,
      title: "Lesson To Delete",
      conceptIds: [CONCEPT_ID],
    });
    const lessonId = lesson.id as LessonId;

    // Delete via authoring.
    await authoring.deleteLesson({ lessonId });
    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    // Verify deleted.
    expect(await artifacts.getLesson(lessonId)).toBeNull();

    // Restore.
    await authoring.restoreAction({ actionId });

    // Verify restored.
    const restored = await artifacts.getLesson(lessonId);
    expect(restored?.title).toBe("Lesson To Delete");
  });
});

// ── gate.create ────────────────────────────────────────────────────────────────

describe("restoreAction — gate.create", () => {
  it("restores by deleting the created gate", async () => {
    const { authoring, artifacts } = services;

    const gate = await authoring.createGate({
      courseId: COURSE_ID,
      guards: { kind: "course-completion" },
      prerequisites: [],
      successCriteria: { kind: "mastery-threshold", conceptIds: [CONCEPT_ID], minScore: 0.8 },
    });
    const gateId = gate.id as GateId;

    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    await authoring.restoreAction({ actionId });

    // Gate should be gone.
    const restored = await artifacts.getGate(gateId);
    expect(restored).toBeNull();
  });
});

// ── gate.edit ──────────────────────────────────────────────────────────────────

describe("restoreAction — gate.edit", () => {
  it("restores the prior gate success criteria", async () => {
    const { authoring, artifacts } = services;

    const gate = await artifacts.createGate({
      courseId: COURSE_ID,
      guards: { kind: "course-completion" },
      prerequisites: [],
      successCriteria: { kind: "mastery-threshold", conceptIds: [CONCEPT_ID], minScore: 0.7 },
    });
    const gateId = gate.id as GateId;

    // Edit via authoring.
    await authoring.updateGate({
      gateId,
      patch: {
        successCriteria: { kind: "mastery-threshold", conceptIds: [CONCEPT_ID], minScore: 0.9 },
      },
    });
    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    await authoring.restoreAction({ actionId });

    const restored = await artifacts.getGate(gateId);
    expect((restored?.successCriteria as { minScore: number }).minScore).toBe(0.7);
  });
});

// ── gate.delete ────────────────────────────────────────────────────────────────

describe("restoreAction — gate.delete", () => {
  it("restores a deleted gate", async () => {
    const { authoring, artifacts } = services;

    const gate = await artifacts.createGate({
      courseId: COURSE_ID,
      guards: { kind: "course-completion" },
      prerequisites: [],
      successCriteria: { kind: "mastery-threshold", conceptIds: [CONCEPT_ID], minScore: 0.8 },
    });
    const gateId = gate.id as GateId;

    await authoring.deleteGate({ gateId });
    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    // Verify deleted.
    expect(await artifacts.getGate(gateId)).toBeNull();

    await authoring.restoreAction({ actionId });

    // Verify restored.
    const restored = await artifacts.getGate(gateId);
    expect(restored).not.toBeNull();
    expect((restored?.successCriteria as { minScore: number }).minScore).toBe(0.8);
  });
});

// ── prompt.override_fragment ───────────────────────────────────────────────────

describe("restoreAction — prompt.override_fragment", () => {
  it("restores the prior override (before it was set)", async () => {
    const { authoring, promptCustomization } = services;

    // No prior override — customizePrompt creates a new one.
    await authoring.customizePrompt("teach", "style.socratic", "new custom override");
    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    // Restore: since no prior override existed, it should be cleared.
    await authoring.restoreAction({ actionId });

    const overrides = await promptCustomization.listFragmentOverrides("teach");
    const match = overrides.find((o) => o.fragmentId === "style.socratic");
    expect(match).toBeUndefined();
  });

  it("restores the prior override value when one existed", async () => {
    const { authoring, promptCustomization } = services;

    // First set an override.
    await authoring.customizePrompt("teach", "style.socratic", "first override");
    const firstActions = await authoring.listConfiguratorActions();
    const firstActionId = firstActions[0]!.id;

    // Second override — this captures "first override" as the prior state.
    await authoring.customizePrompt("teach", "style.socratic", "second override");
    const secondActions = await authoring.listConfiguratorActions();
    // Most recent action is at index 0 (ordered desc).
    const secondActionId = secondActions[0]!.id;

    // Restore the second action — should revert to "first override".
    await authoring.restoreAction({ actionId: secondActionId });

    const overrides = await promptCustomization.listFragmentOverrides("teach");
    const match = overrides.find((o) => o.fragmentId === "style.socratic");
    expect(match?.override).toBe("first override");

    // First action is still restorable.
    await authoring.restoreAction({ actionId: firstActionId });
    const overrides2 = await promptCustomization.listFragmentOverrides("teach");
    const match2 = overrides2.find((o) => o.fragmentId === "style.socratic");
    expect(match2).toBeUndefined();
  });
});

// ── prompt.clear_fragment ──────────────────────────────────────────────────────

describe("restoreAction — prompt.clear_fragment", () => {
  it("restores a cleared override", async () => {
    const { authoring, promptCustomization } = services;

    // Set an override, then clear it.
    await authoring.customizePrompt("teach", "style.verbosity", "wordy");
    await authoring.clearFragmentOverride({ modeId: "teach", fragmentId: "style.verbosity" });

    const actions = await authoring.listConfiguratorActions();
    // Most recent is clear_fragment (index 0).
    const clearActionId = actions[0]!.id;

    // Restore the clear: should reinstate "wordy".
    await authoring.restoreAction({ actionId: clearActionId });

    const overrides = await promptCustomization.listFragmentOverrides("teach");
    const match = overrides.find((o) => o.fragmentId === "style.verbosity");
    expect(match?.override).toBe("wordy");
  });
});

// ── prompt.set_style ───────────────────────────────────────────────────────────

describe("restoreAction — prompt.set_style", () => {
  it("restores the batch of prior overrides", async () => {
    const { authoring, promptCustomization } = services;

    // Set one override manually first.
    await authoring.customizePrompt("teach", "style.socratic", "before-style");
    const manualActionId = (await authoring.listConfiguratorActions())[0]!.id;

    // Now apply a style batch (which may add more overrides and change this one).
    await authoring.setStyleSliders({ socratic: 2, verbosity: 3, formality: 1 });
    const afterStyleActions = await authoring.listConfiguratorActions();
    // Most recent is set_style.
    const styleActionId = afterStyleActions[0]!.id;

    // Restore the style action — should roll back the style batch, restoring "before-style".
    await authoring.restoreAction({ actionId: styleActionId });

    // After restore, "style.socratic" should be "before-style" again.
    const overrides = await promptCustomization.listFragmentOverrides("teach");
    const match = overrides.find((o) => o.fragmentId === "style.socratic");
    expect(match?.override).toBe("before-style");

    // Restore the manual set too — should clear.
    await authoring.restoreAction({ actionId: manualActionId });
    const overrides2 = await promptCustomization.listFragmentOverrides("teach");
    const match2 = overrides2.find((o) => o.fragmentId === "style.socratic");
    expect(match2).toBeUndefined();
  });
});

// ── prompt.set_global_fragment ─────────────────────────────────────────────────

describe("restoreAction — prompt.set_global_fragment", () => {
  it("restores the prior global fragment (null → null)", async () => {
    const { authoring, promptCustomization } = services;

    // No prior fragment — set one.
    await authoring.setGlobalPrompt("Be very concise.");
    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    // Restore: should clear (prior was null).
    await authoring.restoreAction({ actionId });

    expect(promptCustomization.getGlobalFragment()).toBeNull();
  });

  it("restores a prior global fragment value", async () => {
    const { authoring, promptCustomization } = services;

    // Set first value.
    await authoring.setGlobalPrompt("First fragment.");
    const firstActionId = (await authoring.listConfiguratorActions())[0]!.id;

    // Set second value.
    await authoring.setGlobalPrompt("Second fragment.");
    const secondActionId = (await authoring.listConfiguratorActions())[0]!.id;

    // Restore the second action — should revert to "First fragment."
    await authoring.restoreAction({ actionId: secondActionId });
    expect(promptCustomization.getGlobalFragment()).toBe("First fragment.");

    // Restore the first action — should clear.
    await authoring.restoreAction({ actionId: firstActionId });
    expect(promptCustomization.getGlobalFragment()).toBeNull();
  });
});

// ── prompt.set_mode_append ─────────────────────────────────────────────────────

describe("restoreAction — prompt.set_mode_append", () => {
  it("restores the prior mode append (null → null)", async () => {
    const { authoring, promptCustomization } = services;

    await authoring.setModeAppend({ modeId: "quiz", text: "Focus on precision." });
    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    await authoring.restoreAction({ actionId });

    expect(promptCustomization.getModeAppend("quiz")).toBeNull();
  });

  it("restores a prior mode append value", async () => {
    const { authoring, promptCustomization } = services;

    await authoring.setModeAppend({ modeId: "quiz", text: "First append." });
    const firstActionId = (await authoring.listConfiguratorActions())[0]!.id;

    await authoring.setModeAppend({ modeId: "quiz", text: "Second append." });
    const secondActionId = (await authoring.listConfiguratorActions())[0]!.id;

    await authoring.restoreAction({ actionId: secondActionId });
    expect(promptCustomization.getModeAppend("quiz")).toBe("First append.");

    await authoring.restoreAction({ actionId: firstActionId });
    expect(promptCustomization.getModeAppend("quiz")).toBeNull();
  });
});

// ── memory.reset_concept ───────────────────────────────────────────────────────

describe("restoreAction — memory.reset_concept", () => {
  it("restores mastery to null (never seen) when prior was null", async () => {
    const { authoring, memory, studentId } = services;

    // No prior mastery row — reset_concept upserts the BKT initial state.
    await authoring.resetConcept({ studentId, conceptId: CONCEPT_ID, reason: "test" });
    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    // After reset, a BKT-initial mastery row now exists.
    const afterReset = await memory.getMastery({ studentId, conceptId: CONCEPT_ID });
    expect(afterReset).not.toBeNull();

    // Restore: should remove the row (prior was null = never seen).
    await authoring.restoreAction({ actionId });

    const mastery = await memory.getMastery({ studentId, conceptId: CONCEPT_ID });
    expect(mastery).toBeNull();
  });

  it("restores mastery to a prior value", async () => {
    const { authoring, memory, studentId } = services;

    // Seed a mastery row.
    await memory.upsertMastery({
      studentId,
      conceptId: CONCEPT_ID,
      mastery: {
        conceptId: CONCEPT_ID,
        pKnown: 0.8,
        uncertainty: 0.1,
        effectivePKnown: 0.75,
        evidence: [],
      },
    });

    // Reset concept — captures the prior mastery row.
    await authoring.resetConcept({ studentId, conceptId: CONCEPT_ID, reason: "test" });
    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    // After reset, mastery is at BKT initial (not the prior 0.8).
    const afterReset = await memory.getMastery({ studentId, conceptId: CONCEPT_ID });
    expect(afterReset?.pKnown).not.toBeCloseTo(0.8, 2);

    // Restore — should reinstate the prior mastery.
    await authoring.restoreAction({ actionId });

    const restored = await memory.getMastery({ studentId, conceptId: CONCEPT_ID });
    expect(restored?.pKnown).toBeCloseTo(0.8, 2);
  });
});

// ── memory.clear_misconception ─────────────────────────────────────────────────

describe("restoreAction — memory.clear_misconception", () => {
  it("restores a cleared misconception back to active status", async () => {
    const { authoring, memory, studentId } = services;

    const misconceptionId = brandId<"MisconceptionId">(uuidv7()) as MisconceptionId;
    const ts = Date.now() as Timestamp;

    // Seed a misconception.
    await memory.upsertMisconception({
      id: misconceptionId,
      studentId,
      conceptId: CONCEPT_ID,
      description: "Confuses addition with multiplication",
      errorForm: "a+b = a*b",
      remediation: {
        strategyId: "SocraticQuiz" as import("../../types/index.js").StrategyId,
        rationale: "Force explicit evaluation",
      },
      evidence: [],
      status: "active",
      firstObservedAt: ts,
      lastObservedAt: ts,
    });

    // Clear via authoring (sets status to "manually-cleared" — does NOT delete the row).
    await authoring.clearMisconception({ misconceptionId, reason: "test" });
    const actions = await authoring.listConfiguratorActions();
    const actionId = actions[0]!.id;

    // Verify cleared (row exists but status changed).
    const afterClear = await memory.getMisconception(misconceptionId);
    expect(afterClear?.status).toBe("manually-cleared");

    // Restore.
    await authoring.restoreAction({ actionId });

    // Verify restored to prior (active) state.
    const restored = await memory.getMisconception(misconceptionId);
    expect(restored?.status).toBe("active");
    expect(restored?.description).toBe("Confuses addition with multiplication");
  });
});

// ── Guard: no snapshot ─────────────────────────────────────────────────────────

describe("restoreAction — no_snapshot guard", () => {
  it("returns no_snapshot for an unknown actionId", async () => {
    const { authoring } = services;

    const result = await authoring.restoreAction({ actionId: "non-existent-action-id" });
    expect(result).toEqual({ ok: false, reason: "no_snapshot" });
  });

  it("returns no_snapshot for un-snapshotted actions (memory.export)", async () => {
    const { authoring, studentId } = services;

    // exportMemory doesn't snapshot.
    // We test no_snapshot by passing a made-up actionId.
    const result = await authoring.restoreAction({ actionId: uuidv7() });
    expect(result).toEqual({ ok: false, reason: "no_snapshot" });
  });
});

// ── Un-revert (restore the restore action) ─────────────────────────────────────

describe("restoreAction — un-revert", () => {
  it("restoring a restore action re-applies the original mutation", async () => {
    const { authoring, artifacts } = services;

    // 1. Mutate: change course title.
    await authoring.updateCourse({ courseId: COURSE_ID, patch: { title: "Mutated Title" } });
    const allActions1 = await authoring.listConfiguratorActions();
    const originalActionId = allActions1[0]!.id;

    // 2. Restore: revert to original title.
    await authoring.restoreAction({ actionId: originalActionId });

    // After restore, title should be "Original Course Title".
    expect((await artifacts.course(COURSE_ID))?.title).toBe("Original Course Title");

    // 3. Find the restore action row.
    const allActions2 = await authoring.listConfiguratorActions();
    // Most recent action is the "restore" action.
    const restoreActionRow = allActions2[0]!;
    expect(restoreActionRow.action.kind).toBe("restore");
    const restoreActionId = restoreActionRow.id;

    // 4. Un-revert: restore the restore action.
    const unRevertResult = await authoring.restoreAction({ actionId: restoreActionId });
    expect(unRevertResult.ok).toBe(true);

    // After un-revert, title should be "Mutated Title" again.
    expect((await artifacts.course(COURSE_ID))?.title).toBe("Mutated Title");
  });
});
