import type { CourseSummary, PraxisClient, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useCourses } from "../hooks/use-courses.js";

function makeSummary(overrides: Partial<CourseSummary> = {}): CourseSummary {
  return {
    courseId: brandId<"CourseId">("course-1"),
    title: "Algebra 1",
    subject: "mathematics",
    gradeLevel: "grade-8",
    lessonCount: 10,
    conceptCount: 30,
    studiedConcepts: 5,
    createdAt: Date.now() as Timestamp,
    ...overrides,
  };
}

function makeClient(courses: CourseSummary[] = []): PraxisClient {
  return {
    session: {} as PraxisClient["session"],
    artifacts: {
      courses: vi.fn().mockResolvedValue(courses),
      course: vi.fn(),
      lessons: vi.fn(),
      gates: vi.fn(),
      progress: vi.fn(),
      flashcards: vi.fn(),
      notes: vi.fn(),
      conceptMaps: vi.fn(),
      // Phase 9 methods
      gateView: vi.fn().mockResolvedValue([]),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
    } as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
  };
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

describe("useCourses", () => {
  it("calls client.artifacts.courses() once on mount", async () => {
    const client = makeClient([makeSummary()]);
    const { result } = renderHook(() => useCourses(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(client.artifacts.courses).toHaveBeenCalledTimes(1);
  });

  it("returns courses after load", async () => {
    const summary = makeSummary({ title: "Biology 101" });
    const client = makeClient([summary]);
    const { result } = renderHook(() => useCourses(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.courses).toHaveLength(1);
    expect(result.current.courses[0]?.title).toBe("Biology 101");
  });

  it("starts with loading: true then resolves to false", async () => {
    const client = makeClient([]);
    const { result } = renderHook(() => useCourses(), { wrapper: wrapper(client) });

    // Immediately after mount loading should be true.
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("sets error when courses() rejects", async () => {
    const client = makeClient();
    (client.artifacts.courses as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useCourses(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.error).toBe("Network error");
    });
    expect(result.current.loading).toBe(false);
  });

  it("refresh() re-calls courses()", async () => {
    const client = makeClient([makeSummary()]);
    const { result } = renderHook(() => useCourses(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(client.artifacts.courses).toHaveBeenCalledTimes(2);
  });
});
