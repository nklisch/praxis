/**
 * Tests for the useAssignment hook — debounce and confidence-band integration.
 *
 * Key regression covered here:
 *   When a student types an answer (starts the 1-second debounce) and then
 *   selects a confidence band *before* the timer fires, the debounce callback
 *   must persist the confidence value — not null. The fix is a `confidencesRef`
 *   that the timer callback always reads at fire-time instead of close-over-time.
 */
import type { Assignment, AssignmentResponse, PraxisClient, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useAssignment } from "../hooks/use-assignment.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ASSIGNMENT_ID = brandId<"AssignmentId">("asgn-test-1");
const ITEM_ID = "item-1";

function makeAssignment(): Assignment {
  return {
    id: ASSIGNMENT_ID,
    courseId: brandId<"CourseId">("course-1"),
    kind: "quiz",
    title: "Test Quiz",
    items: [
      {
        id: ITEM_ID,
        kind: "short-answer",
        prompt: "What is 2 + 2?",
        acceptedAnswers: ["4"],
      },
    ],
    conceptIds: [],
    assignedAt: Date.now() as Timestamp,
  };
}

function makeClient(
  recordResponse: PraxisClient["assignments"]["recordResponse"],
  getResponses?: PraxisClient["assignments"]["getResponses"],
): PraxisClient {
  return makeFakeClient({
    assignments: {
      get: vi.fn().mockResolvedValue(makeAssignment()),
      list: vi.fn().mockResolvedValue([]),
      getResponses: getResponses ?? vi.fn().mockResolvedValue([]),
      recordResponse,
      submit: vi.fn().mockResolvedValue({
        assignmentId: ASSIGNMENT_ID,
        grade: { total: 1.0, perItem: [], reviewedBy: "deterministic" as const },
        submittedAt: Date.now() as Timestamp,
      }),
    },
  });
}

function makeWrapper(client: PraxisClient) {
  return function Wrapper({ children }: { children: React.ReactNode }): JSX.Element {
    return <PraxisClientProvider client={client}>{children}</PraxisClientProvider>;
  };
}

// ─── Debounce stale-closure regression ────────────────────────────────────────

describe("useAssignment — debounce stale-closure regression", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  /**
   * Flush the initial async load while under fake timers.
   * useResource fires a Promise on mount; a single microtask tick resolves it
   * without needing real time. Using `await act(async () => { ... })` drains
   * the microtask queue so React can process the settled state.
   */
  async function flushLoad(): Promise<void> {
    await act(async () => {
      // Two ticks: one for the Promise chain inside useResource, one for setState
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("debounce fires with the confidence value set AFTER the timer was created", async () => {
    // This is the exact regression scenario from the review bounce:
    //   1. recordResponse called → debounce timer T starts (no confidence yet)
    //   2. recordConfidence called → immediately persists "certain"
    //   3. Timer T fires → must include confidence: "certain", not undefined/null

    const recordResponse = vi.fn().mockResolvedValue(undefined);
    const client = makeClient(recordResponse);

    const { result } = renderHook(() => useAssignment(ASSIGNMENT_ID), {
      wrapper: makeWrapper(client),
    });

    // Flush the initial async load (no real timers needed)
    await flushLoad();
    expect(result.current.loading).toBe(false);

    // Step 1: student types an answer → debounce timer T created
    act(() => {
      result.current.recordResponse(ITEM_ID, "my answer");
    });

    // Step 2: student clicks "certain" → recordConfidence immediately persists
    await act(async () => {
      result.current.recordConfidence(ITEM_ID, "certain");
      // Drain the microtask for the immediate persist's Promise resolution
      await Promise.resolve();
    });

    // The immediate persist from recordConfidence must have fired
    const immediateConfidenceCall = recordResponse.mock.calls.find(
      (args) => args[0].confidence === "certain",
    );
    expect(immediateConfidenceCall).toBeDefined();

    // Step 3: advance time to fire the debounce timer
    await act(async () => {
      vi.advanceTimersByTime(1100);
      await Promise.resolve();
    });

    // The debounce call should include confidence: "certain" — not undefined / null.
    // Filter for calls that were the debounced save (they include `response: "my answer"`).
    const debouncedCalls = recordResponse.mock.calls.filter(
      (args) => args[0].response === "my answer",
    );
    expect(debouncedCalls.length).toBeGreaterThanOrEqual(1);

    // The last debounce call must carry confidence: "certain"
    const lastDebounceCall = debouncedCalls[debouncedCalls.length - 1];
    expect(lastDebounceCall?.[0]).toMatchObject({
      assignmentId: ASSIGNMENT_ID,
      itemId: ITEM_ID,
      response: "my answer",
      confidence: "certain",
    });
  });

  it("debounce fires WITHOUT confidence when none was selected", async () => {
    // Inverse path: no confidence selected, debounce should omit the field
    // (not send confidence: undefined in a way that breaks the upsert).
    const recordResponse = vi.fn().mockResolvedValue(undefined);
    const client = makeClient(recordResponse);

    const { result } = renderHook(() => useAssignment(ASSIGNMENT_ID), {
      wrapper: makeWrapper(client),
    });

    await flushLoad();
    expect(result.current.loading).toBe(false);

    act(() => {
      result.current.recordResponse(ITEM_ID, "no confidence answer");
    });

    await act(async () => {
      vi.advanceTimersByTime(1100);
      await Promise.resolve();
    });

    const debouncedCalls = recordResponse.mock.calls.filter(
      (args) => args[0].response === "no confidence answer",
    );
    expect(debouncedCalls.length).toBeGreaterThanOrEqual(1);

    // confidence key must not be present when none was selected
    const lastCall = debouncedCalls[debouncedCalls.length - 1];
    expect(lastCall?.[0]).not.toHaveProperty("confidence");
  });

  it("recordConfidence called AFTER debounce fires still persists (inverse path)", async () => {
    // If the debounce fires first (no confidence yet), then the student selects
    // confidence, the immediate persist from recordConfidence must still land.
    const recordResponse = vi.fn().mockResolvedValue(undefined);
    const client = makeClient(recordResponse);

    const { result } = renderHook(() => useAssignment(ASSIGNMENT_ID), {
      wrapper: makeWrapper(client),
    });

    await flushLoad();
    expect(result.current.loading).toBe(false);

    // Trigger debounce
    act(() => {
      result.current.recordResponse(ITEM_ID, "answer first");
    });

    // Fire the debounce BEFORE selecting confidence
    await act(async () => {
      vi.advanceTimersByTime(1100);
      await Promise.resolve();
    });

    // Now select confidence — this path uses the immediate write in recordConfidence
    await act(async () => {
      result.current.recordConfidence(ITEM_ID, "pretty_sure");
      await Promise.resolve();
    });

    // The immediate persist from recordConfidence must include confidence: "pretty_sure"
    const immediateCall = recordResponse.mock.calls.find(
      (args) => args[0].confidence === "pretty_sure",
    );
    expect(immediateCall).toBeDefined();
    expect(immediateCall?.[0]).toMatchObject({
      assignmentId: ASSIGNMENT_ID,
      itemId: ITEM_ID,
      confidence: "pretty_sure",
    });
  });
});

// ─── Basic loading behaviour ───────────────────────────────────────────────────

describe("useAssignment — loading", () => {
  it("returns loading=true initially, then resolves the assignment", async () => {
    const recordResponse = vi.fn().mockResolvedValue(undefined);
    const client = makeClient(recordResponse);

    const { result } = renderHook(() => useAssignment(ASSIGNMENT_ID), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.assignment).not.toBeNull();
      expect(result.current.assignment?.id).toBe(ASSIGNMENT_ID);
    });
  });

  it("hydrates saved confidence values from getResponses", async () => {
    const savedResponses: AssignmentResponse[] = [
      {
        assignmentId: ASSIGNMENT_ID,
        itemId: ITEM_ID,
        response: "my saved answer",
        confidence: "unsure",
        recordedAt: Date.now() as Timestamp,
      },
    ];
    const getResponses = vi.fn().mockResolvedValue(savedResponses);
    const recordResponse = vi.fn().mockResolvedValue(undefined);
    const client = makeClient(recordResponse, getResponses);

    const { result } = renderHook(() => useAssignment(ASSIGNMENT_ID), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.confidences.get(ITEM_ID)).toBe("unsure");
    });
  });

  it("returns null assignment when assignmentId is undefined", async () => {
    const recordResponse = vi.fn().mockResolvedValue(undefined);
    const client = makeClient(recordResponse);

    const { result } = renderHook(() => useAssignment(undefined), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.assignment).toBeNull();
      expect(result.current.loading).toBe(false);
    });
  });
});
