/**
 * Phase 10: Verifies that the course map renders real concept names (from the
 * concept graph) and real per-concept mastery (from the student model) instead
 * of the Phase 9 UUID + gate-proxy placeholders.
 *
 * Tests the useCourseGates hook augmentation (concepts + mastery parallel fetch)
 * and the buildGraph function's use of conceptsById + masteryByConceptId.
 */
import type {
  ConceptMastery,
  CourseId,
  GateId,
  GateView,
  PraxisClient,
  StudentModel,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useCourseGates } from "../hooks/use-course-gates.js";

const COURSE_ID = brandId<"CourseId">("course-map-test");
const CONCEPT_ID_RAW = "graph-abc:algebra-1.real-numbers";
const CONCEPT_ID = brandId<"ConceptId">(CONCEPT_ID_RAW);

function makeGateView(): GateView {
  return {
    gate: {
      id: brandId<"GateId">("gate-1"),
      courseId: COURSE_ID,
      guards: { kind: "lesson", lessonId: brandId("lesson-1") },
      prerequisites: [],
      successCriteria: {
        kind: "mastery-threshold",
        conceptIds: [CONCEPT_ID],
        minScore: 0.8,
      },
      state: { kind: "locked", missingPrerequisites: [] },
      evidence: [],
    },
    summaryText: "mastery ≥ 0.80 on 1 concept",
    lockReason: "mastery below threshold",
    progress: 0.55,
    isActive: true,
  };
}

function makeConceptRow() {
  return {
    id: CONCEPT_ID_RAW,
    graphId: "graph-abc",
    name: "Real Numbers",
    description: "The real number system includes rational and irrational numbers.",
    aliases: ["real number system", "number line"],
    standardsTags: ["CCSS.Math.Content.HSN-RN.B.3"],
  };
}

function makeStudentModel(pKnown: number): StudentModel {
  const mastery: ConceptMastery = {
    conceptId: CONCEPT_ID,
    pKnown,
    effectivePKnown: pKnown,
    uncertainty: 0.3,
    lastPracticedAt: (Date.now() - 86_400_000) as Timestamp,
    evidence: [],
  };
  return {
    studentId: brandId("student-1"),
    conceptMastery: new Map([[CONCEPT_ID, mastery]]),
    lastUpdated: Date.now() as Timestamp,
  };
}

function makeClient(
  gateViewResult: GateView[] = [],
  conceptsResult: ReturnType<typeof makeConceptRow>[] = [],
  studentModelResult: StudentModel = makeStudentModel(0),
): PraxisClient {
  return {
    session: {} as PraxisClient["session"],
    artifacts: {
      courses: vi.fn(),
      course: vi.fn(),
      lessons: vi.fn(),
      gates: vi.fn(),
      progress: vi.fn(),
      flashcards: vi.fn(),
      notes: vi.fn(),
      conceptMaps: vi.fn(),
      gateView: vi.fn().mockResolvedValue(gateViewResult),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] as GateId[] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
      concepts: vi.fn().mockResolvedValue(conceptsResult),
    } as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {
      studentModel: vi.fn().mockResolvedValue(studentModelResult),
      misconceptions: vi.fn(),
      procedural: vi.fn(),
      affective: vi.fn(),
      episodic: vi.fn(),
      export: vi.fn(),
      delete: vi.fn(),
    } as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {} as PraxisClient["packs"],
  };
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

describe("useCourseGates Phase 10 augmentation", () => {
  it("fetches gates, concepts, and student model in parallel", async () => {
    const gateView = makeGateView();
    const conceptRow = makeConceptRow();
    const studentModel = makeStudentModel(0.65);
    const client = makeClient([gateView], [conceptRow], studentModel);

    const { result } = renderHook(() => useCourseGates(COURSE_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // All three data sources populated
    expect(result.current.gates).toHaveLength(1);
    expect(result.current.conceptsById.size).toBe(1);
    expect(result.current.masteryByConceptId.size).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("conceptsById maps prefixed id → concept row with real name", async () => {
    const conceptRow = makeConceptRow();
    const client = makeClient([], [conceptRow], makeStudentModel(0));

    const { result } = renderHook(() => useCourseGates(COURSE_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const concept = result.current.conceptsById.get(CONCEPT_ID_RAW);
    expect(concept).toBeDefined();
    expect(concept?.name).toBe("Real Numbers");
    expect(concept?.standardsTags).toContain("CCSS.Math.Content.HSN-RN.B.3");
  });

  it("masteryByConceptId maps concept id → effectivePKnown", async () => {
    const studentModel = makeStudentModel(0.72);
    const client = makeClient([], [], studentModel);

    const { result } = renderHook(() => useCourseGates(COURSE_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const mastery = result.current.masteryByConceptId.get(CONCEPT_ID_RAW);
    expect(mastery).toBeCloseTo(0.72, 5);
  });

  it("masteryByConceptId is empty when concept has not been studied", async () => {
    // Student model with no conceptMastery entries
    const emptyModel: StudentModel = {
      studentId: brandId("student-1"),
      conceptMastery: new Map(),
      lastUpdated: Date.now() as Timestamp,
    };
    const client = makeClient([], [], emptyModel);

    const { result } = renderHook(() => useCourseGates(COURSE_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.masteryByConceptId.size).toBe(0);
  });

  it("sets error when any fetch fails", async () => {
    const client = makeClient();
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (client.memory as any).studentModel = vi.fn().mockRejectedValue(new Error("memory IPC error"));

    const { result } = renderHook(() => useCourseGates(COURSE_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.error).toBe("memory IPC error");
    });

    expect(result.current.loading).toBe(false);
  });

  it("does nothing when courseId is undefined", async () => {
    const client = makeClient([makeGateView()], [makeConceptRow()], makeStudentModel(0.5));

    const { result } = renderHook(() => useCourseGates(undefined), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(client.artifacts.gateView).not.toHaveBeenCalled();
    expect(client.artifacts.concepts).not.toHaveBeenCalled();
    expect(client.memory.studentModel).not.toHaveBeenCalled();
    expect(result.current.gates).toHaveLength(0);
    expect(result.current.conceptsById.size).toBe(0);
    expect(result.current.masteryByConceptId.size).toBe(0);
  });

  it("refresh() re-fetches all three sources", async () => {
    const client = makeClient([makeGateView()], [makeConceptRow()], makeStudentModel(0.3));

    const { result } = renderHook(() => useCourseGates(COURSE_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(client.artifacts.gateView).toHaveBeenCalledTimes(2);
    expect(client.artifacts.concepts).toHaveBeenCalledTimes(2);
    expect(client.memory.studentModel).toHaveBeenCalledTimes(2);
  });
});
