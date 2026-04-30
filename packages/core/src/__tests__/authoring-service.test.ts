/**
 * AuthoringServiceImpl integration tests.
 *
 * Verifies the audit-log boundary: every write appends a configurator_actions row.
 * Uses real migrated SQLite via useTempDb(); ArtifactsService and MemoryService
 * are mocked at the port level so we test AuthoringServiceImpl in isolation.
 */
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { configuratorActions } from "../schema.js";
import { AuthoringServiceImpl } from "../services/authoring-service.js";
import type {
  ArtifactsService,
  ConfiguratorId,
  Course,
  CourseId,
  Gate,
  GateId,
  Lesson,
  LessonId,
  MemoryService,
  StudentId,
} from "../types/index.js";
import { brandId } from "../types/index.js";

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const CONFIGURATOR_ID = brandId<"ConfiguratorId">("default") as ConfiguratorId;
const STUDENT_ID = brandId<"StudentId">("student-a") as StudentId;
const COURSE_ID = brandId<"CourseId">("course-1") as CourseId;
const LESSON_ID = brandId<"LessonId">("lesson-1") as LessonId;
const GATE_ID = brandId<"GateId">("gate-1") as GateId;

const dbCtx = useTempDb();

function makeStubArtifacts(overrides: Partial<ArtifactsService> = {}): ArtifactsService {
  return {
    course: vi.fn().mockResolvedValue(null),
    courses: vi.fn().mockResolvedValue([]),
    lessons: vi.fn().mockResolvedValue([]),
    gates: vi.fn().mockResolvedValue([]),
    progress: vi.fn().mockResolvedValue({}),
    markLessonStarted: vi.fn().mockResolvedValue(undefined),
    markConceptStudied: vi.fn().mockResolvedValue({ lessonComplete: false, lessonId: null }),
    listDocuments: vi.fn().mockResolvedValue([]),
    gateView: vi.fn().mockResolvedValue([]),
    evaluateAndPersistGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
    markGatesViewed: vi.fn().mockResolvedValue(undefined),
    newlyUnlockedCount: vi.fn().mockResolvedValue(0),
    concepts: vi.fn().mockResolvedValue([]),
    updateCourse: vi
      .fn()
      .mockResolvedValue({ id: COURSE_ID, title: "Updated" } as unknown as Course),
    createLesson: vi.fn().mockResolvedValue({
      id: LESSON_ID,
      title: "New Lesson",
      conceptIds: [],
      courseId: COURSE_ID,
      orderIndex: 0,
    } as unknown as Lesson),
    updateLesson: vi.fn().mockResolvedValue({
      id: LESSON_ID,
      title: "Updated Lesson",
      conceptIds: [],
      courseId: COURSE_ID,
      orderIndex: 0,
    } as unknown as Lesson),
    deleteLesson: vi.fn().mockResolvedValue(undefined),
    createGate: vi.fn().mockResolvedValue({
      id: GATE_ID,
      courseId: COURSE_ID,
      guards: { kind: "lesson", lessonId: LESSON_ID },
      prerequisites: [],
      successCriteria: { kind: "and", criteria: [] },
    } as unknown as Gate),
    updateGate: vi.fn().mockResolvedValue({
      id: GATE_ID,
      courseId: COURSE_ID,
      guards: { kind: "lesson", lessonId: LESSON_ID },
      prerequisites: [],
      successCriteria: { kind: "and", criteria: [] },
    } as unknown as Gate),
    deleteGate: vi.fn().mockResolvedValue(undefined),
    overrideGate: vi
      .fn()
      .mockResolvedValue({ id: GATE_ID, courseId: COURSE_ID } as unknown as Gate),
    getCourseSummary: vi
      .fn()
      .mockResolvedValue({ course: {} as unknown as Course, lessons: [], gates: [], concepts: [] }),
    ...overrides,
  } as unknown as ArtifactsService;
}

function makeStubMemory(overrides: Partial<MemoryService> = {}): MemoryService {
  return {
    studentModel: vi.fn().mockResolvedValue({}),
    misconceptions: vi.fn().mockResolvedValue([]),
    procedural: vi.fn().mockResolvedValue({}),
    affective: vi.fn().mockResolvedValue({}),
    episodic: vi.fn().mockReturnValue((async function* () {})()),
    export: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    applySignal: vi.fn(),
    recordMisconception: vi.fn().mockReturnValue({ misconceptionId: "m-1", merged: false }),
    resetConcept: vi.fn().mockResolvedValue(undefined),
    clearMisconception: vi.fn().mockResolvedValue(undefined),
    exportToFile: vi.fn().mockResolvedValue({ ok: true, bytesWritten: 100 }),
    ...overrides,
  } as unknown as MemoryService;
}

function makeService(
  db: ReturnType<typeof openDb>["db"],
  artifactsOverrides: Partial<ArtifactsService> = {},
  memoryOverrides: Partial<MemoryService> = {},
) {
  return new AuthoringServiceImpl({
    db,
    log: MOCK_LOG,
    artifacts: makeStubArtifacts(artifactsOverrides),
    memory: makeStubMemory(memoryOverrides),
    configuratorId: () => CONFIGURATOR_ID,
    studentId: () => STUDENT_ID,
  });
}

function countActions(db: ReturnType<typeof openDb>["db"]) {
  return db.select().from(configuratorActions).all().length;
}

// ─── Course ───────────────────────────────────────────────────────────────────

describe("AuthoringServiceImpl — updateCourse", () => {
  it("delegates to artifacts.updateCourse and appends an audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const before = countActions(db);
    await svc.updateCourse({ courseId: COURSE_ID, patch: { title: "New Title" } });
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    expect((last.actionJson as { kind: string }).kind).toBe("course.edit");
    expect(last.configuratorId).toBe("default");
  });
});

// ─── Lesson ───────────────────────────────────────────────────────────────────

describe("AuthoringServiceImpl — lesson CRUD", () => {
  it("createLesson appends lesson.create audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const before = countActions(db);
    await svc.createLesson({ courseId: COURSE_ID, title: "Intro", conceptIds: [] });
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    expect((last.actionJson as { kind: string }).kind).toBe("lesson.create");
  });

  it("updateLesson appends lesson.edit audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const before = countActions(db);
    await svc.updateLesson({ lessonId: LESSON_ID, patch: { title: "Updated" } });
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    expect((last.actionJson as { kind: string }).kind).toBe("lesson.edit");
  });

  it("deleteLesson appends lesson.delete audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const before = countActions(db);
    await svc.deleteLesson({ lessonId: LESSON_ID, reason: "Removed" });
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    const action = last.actionJson as { kind: string; reason: string };
    expect(action.kind).toBe("lesson.delete");
    expect(action.reason).toBe("Removed");
  });
});

// ─── Gate ─────────────────────────────────────────────────────────────────────

describe("AuthoringServiceImpl — gate CRUD", () => {
  it("createGate appends gate.create audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const before = countActions(db);
    await svc.createGate({
      courseId: COURSE_ID,
      guards: { kind: "lesson", lessonId: LESSON_ID },
      prerequisites: [],
      successCriteria: { kind: "and", criteria: [] },
    });
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    expect((last.actionJson as { kind: string }).kind).toBe("gate.create");
  });

  it("updateGate appends gate.edit audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const before = countActions(db);
    await svc.updateGate({ gateId: GATE_ID, patch: {}, reason: "test" });
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    const action = last.actionJson as { kind: string; reason: string };
    expect(action.kind).toBe("gate.edit");
    expect(action.reason).toBe("test");
  });

  it("deleteGate appends gate.delete audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const before = countActions(db);
    await svc.deleteGate({ gateId: GATE_ID, reason: "Obsolete" });
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    expect((last.actionJson as { kind: string }).kind).toBe("gate.delete");
  });
});

// ─── Prompt customization ─────────────────────────────────────────────────────

describe("AuthoringServiceImpl — prompt customization", () => {
  it("customizePrompt appends prompt.override_fragment audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const before = countActions(db);
    await svc.customizePrompt("teach", "role.teach", "Be concise");
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    const action = last.actionJson as { kind: string; modeId: string; fragmentId: string };
    expect(action.kind).toBe("prompt.override_fragment");
    expect(action.modeId).toBe("teach");
    expect(action.fragmentId).toBe("role.teach");
  });

  it("clearFragmentOverride appends prompt.clear_fragment audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const before = countActions(db);
    await svc.clearFragmentOverride({ modeId: "teach", fragmentId: "role.teach" });
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    expect((last.actionJson as { kind: string }).kind).toBe("prompt.clear_fragment");
  });

  it("setStyleSliders writes ONE audit row for the whole batch", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const before = countActions(db);
    await svc.setStyleSliders({ socratic: 0.5, verbosity: 0.5, formality: 0.5 });
    // Must be exactly one row regardless of how many fragments are overridden.
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    expect((last.actionJson as { kind: string }).kind).toBe("prompt.set_style");
  });
});

// ─── Memory administration ────────────────────────────────────────────────────

describe("AuthoringServiceImpl — memory administration", () => {
  it("resetConcept delegates to memory and appends audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const resetConceptFn = vi.fn().mockResolvedValue(undefined);
    const svc = makeService(db, {}, { resetConcept: resetConceptFn });

    const before = countActions(db);
    await svc.resetConcept({
      studentId: STUDENT_ID,
      conceptId: brandId<"ConceptId">("c-1"),
      reason: "reset for test",
    });
    expect(resetConceptFn).toHaveBeenCalledOnce();
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    const action = last.actionJson as { kind: string; reason: string };
    expect(action.kind).toBe("memory.reset_concept");
    expect(action.reason).toBe("reset for test");
  });

  it("clearMisconception delegates to memory and appends audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const clearMisconceptionFn = vi.fn().mockResolvedValue(undefined);
    const svc = makeService(db, {}, { clearMisconception: clearMisconceptionFn });

    const before = countActions(db);
    await svc.clearMisconception({
      misconceptionId: brandId<"MisconceptionId">("m-1"),
      reason: "manually cleared",
    });
    expect(clearMisconceptionFn).toHaveBeenCalledOnce();
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    expect((last.actionJson as { kind: string }).kind).toBe("memory.clear_misconception");
  });

  it("exportMemory delegates to memory.exportToFile and appends audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const exportToFileFn = vi.fn().mockResolvedValue({ ok: true, bytesWritten: 42 });
    const svc = makeService(db, {}, { exportToFile: exportToFileFn });

    const before = countActions(db);
    const result = await svc.exportMemory({ studentId: STUDENT_ID, targetPath: "/tmp/mem.json" });
    expect(result).toEqual({ ok: true, bytesWritten: 42 });
    expect(exportToFileFn).toHaveBeenCalledOnce();
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    expect((last.actionJson as { kind: string }).kind).toBe("memory.export");
  });

  it("deleteAllMemory delegates to memory.delete and appends audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const svc = makeService(db, {}, { delete: deleteFn });

    const before = countActions(db);
    await svc.deleteAllMemory({ studentId: STUDENT_ID, reason: "fresh start", confirm: true });
    expect(deleteFn).toHaveBeenCalledOnce();
    expect(countActions(db)).toBe(before + 1);

    const rows = db.select().from(configuratorActions).all();
    // biome-ignore lint/style/noNonNullAssertion: test always writes a row before reading
    const last = rows[rows.length - 1]!;
    const action = last.actionJson as { kind: string; reason: string };
    expect(action.kind).toBe("memory.delete_all");
    expect(action.reason).toBe("fresh start");
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────

describe("AuthoringServiceImpl — listConfiguratorActions", () => {
  it("returns all audit rows in descending order", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    await svc.customizePrompt("teach", "role.teach", "v1");
    await svc.customizePrompt("teach", "role.teach", "v2");

    const rows = await svc.listConfiguratorActions();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // Descending order — newest first.
    // biome-ignore lint/style/noNonNullAssertion: test writes rows before reading
    expect(rows[0]!.ts).toBeGreaterThanOrEqual(rows[1]!.ts);
  });

  it("respects limit", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    // Create 3 actions.
    await svc.customizePrompt("teach", "role.teach", "a");
    await svc.customizePrompt("teach", "role.teach", "b");
    await svc.customizePrompt("teach", "role.teach", "c");

    const rows = await svc.listConfiguratorActions({ limit: 2 });
    expect(rows.length).toBeLessThanOrEqual(2);
  });

  it("each row has configuratorId matching the factory", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    await svc.clearFragmentOverride({ modeId: "teach", fragmentId: "role.teach" });
    const rows = await svc.listConfiguratorActions({ limit: 1 });
    // biome-ignore lint/style/noNonNullAssertion: test writes a row before reading
    expect(rows[0]!.configuratorId).toBe("default");
  });
});

// ─── getCourseSummary (pure read — no audit row) ──────────────────────────────

describe("AuthoringServiceImpl — getCourseSummary", () => {
  it("delegates to artifacts.getCourseSummary without writing an audit row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const getCourseSummaryFn = vi
      .fn()
      .mockResolvedValue({ course: {} as unknown as Course, lessons: [], gates: [], concepts: [] });
    const svc = makeService(db, { getCourseSummary: getCourseSummaryFn });

    const before = countActions(db);
    await svc.getCourseSummary(COURSE_ID);
    expect(getCourseSummaryFn).toHaveBeenCalledOnce();
    expect(countActions(db)).toBe(before); // no audit row for a pure read
  });
});
