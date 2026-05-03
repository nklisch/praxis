import type {
  Gate,
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
import { makeFakeClient } from "./helpers/fake-client.js";

const COURSE_ID = brandId<"CourseId">("course-test");

function makeGateView(overrides: Partial<GateView> = {}): GateView {
  const gate: Gate = {
    id: brandId<"GateId">("gate-1"),
    courseId: COURSE_ID,
    guards: { kind: "lesson", lessonId: brandId("lesson-1") },
    prerequisites: [],
    successCriteria: { kind: "mastery-threshold", conceptIds: [], minScore: 0.7 },
    state: { kind: "locked", missingPrerequisites: [] },
    evidence: [],
  };
  return {
    gate,
    summaryText: "mastery ≥ 0.70 on 2 concepts",
    lockReason: "mastery below threshold",
    progress: 0.5,
    isActive: true,
    ...overrides,
  };
}

const emptyStudentModel: StudentModel = {
  studentId: brandId("student-test"),
  conceptMastery: new Map(),
  lastUpdated: Date.now() as Timestamp,
};

function makeClient(gateViewResult: GateView[] | "reject" = []): PraxisClient {
  return makeFakeClient({
    artifacts: {
      courses: vi.fn(),
      course: vi.fn(),
      lessons: vi.fn(),
      gates: vi.fn(),
      progress: vi.fn(),
      flashcards: vi.fn(),
      notes: vi.fn(),
      gateView:
        gateViewResult === "reject"
          ? vi.fn().mockRejectedValue(new Error("IPC error"))
          : vi.fn().mockResolvedValue(gateViewResult),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] as GateId[] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
      // Phase 10
      concepts: vi.fn().mockResolvedValue([]),
    } as PraxisClient["artifacts"],
    memory: {
      studentModel: vi.fn().mockResolvedValue(emptyStudentModel),
      misconceptions: vi.fn(),
      procedural: vi.fn(),
      affective: vi.fn(),
      episodic: vi.fn(),
      export: vi.fn(),
      delete: vi.fn(),
    } as PraxisClient["memory"],
  });
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

describe("useCourseGates", () => {
  it("loads gates on mount", async () => {
    const gateView = makeGateView();
    const client = makeClient([gateView]);

    const { result } = renderHook(() => useCourseGates(COURSE_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.gates).toHaveLength(1);
    expect(result.current.gates[0]?.summaryText).toBe("mastery ≥ 0.70 on 2 concepts");
    expect(result.current.error).toBeNull();
  });

  it("starts with loading: true then resolves", async () => {
    const client = makeClient([]);
    const { result } = renderHook(() => useCourseGates(COURSE_ID), {
      wrapper: wrapper(client),
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("sets error when gateView() rejects", async () => {
    const client = makeClient("reject");

    const { result } = renderHook(() => useCourseGates(COURSE_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.error).toBe("IPC error");
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.gates).toHaveLength(0);
  });

  it("does nothing when courseId is undefined", async () => {
    const client = makeClient([makeGateView()]);

    const { result } = renderHook(() => useCourseGates(undefined), {
      wrapper: wrapper(client),
    });

    // Should stay at initial state — never calls gateView.
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(client.artifacts.gateView).not.toHaveBeenCalled();
    expect(result.current.gates).toHaveLength(0);
  });

  it("refresh() re-fetches gate views", async () => {
    const client = makeClient([makeGateView()]);

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
  });

  it("returns multiple gates correctly", async () => {
    const gate1 = makeGateView({ summaryText: "gate 1" });
    const gate2 = makeGateView({
      summaryText: "gate 2",
      gate: {
        ...gate1.gate,
        id: brandId<"GateId">("gate-2"),
        state: {
          kind: "unlocked",
          unlockedAt: Date.now() as Timestamp,
          evidence: [],
        },
      },
      progress: 1,
      isActive: false,
    });
    const client = makeClient([gate1, gate2]);

    const { result } = renderHook(() => useCourseGates(COURSE_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.gates).toHaveLength(2);
  });
});
