/**
 * Tests for useActionEscalation — generalized failure escalation hook.
 *
 * All timers use vi.useFakeTimers() per the slow-test-gating pattern.
 *
 * Scenarios:
 * - Threshold: failed action → advance past threshold → activity.start called
 * - Retry before threshold: item removed → timer cleared → no activity.start
 * - Unmount before threshold: cleanup fires → no activity.start
 * - Re-failure reschedule: same id reappears with newer failedAt → fresh timer
 * - Graceful no-op when activity is null/undefined
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRegistryClient, FailedAction } from "../use-action-escalation.js";
import {
  DEFAULT_ACTION_ESCALATION_THRESHOLD_MS,
  useActionEscalation,
} from "../use-action-escalation.js";

// ── Timer setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeActivity(): ActivityRegistryClient & {
  startMock: ReturnType<typeof vi.fn>;
  finishMock: ReturnType<typeof vi.fn>;
} {
  const finishMock = vi.fn();
  const startMock = vi.fn().mockReturnValue({ finish: finishMock });
  return {
    start: startMock,
    startMock,
    finishMock,
  };
}

function makeAction(overrides?: Partial<FailedAction>): FailedAction {
  return {
    id: "action-1",
    label: "Save as flashcards",
    failedAt: Date.now(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useActionEscalation", () => {
  // ── Threshold escalation ──────────────────────────────────────────────────

  it("calls activity.start after threshold passes", () => {
    const activity = makeActivity();
    const action = makeAction();

    renderHook(() =>
      useActionEscalation({
        failedActions: [action],
        activity,
        thresholdMs: DEFAULT_ACTION_ESCALATION_THRESHOLD_MS,
      }),
    );

    expect(activity.startMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(DEFAULT_ACTION_ESCALATION_THRESHOLD_MS);
    });

    expect(activity.startMock).toHaveBeenCalledOnce();
    expect(activity.startMock).toHaveBeenCalledWith({
      label: "Save as flashcards",
      metadata: { actionId: "action-1" },
    });
  });

  it("does not call activity.start before threshold", () => {
    const activity = makeActivity();
    const action = makeAction();

    renderHook(() =>
      useActionEscalation({
        failedActions: [action],
        activity,
        thresholdMs: 5_000,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(activity.startMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(activity.startMock).toHaveBeenCalledOnce();
  });

  // ── Retry before threshold: item removed ──────────────────────────────────

  it("clears the timer when the action is removed (retried / dismissed) before threshold", () => {
    const activity = makeActivity();
    const action = makeAction();

    const { rerender } = renderHook(
      ({ failedActions }: { failedActions: FailedAction[] }) =>
        useActionEscalation({ failedActions, activity, thresholdMs: 5_000 }),
      { initialProps: { failedActions: [action] } },
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(activity.startMock).not.toHaveBeenCalled();

    // Simulate retry: remove from failedActions
    rerender({ failedActions: [] });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(activity.startMock).not.toHaveBeenCalled();
  });

  // ── Unmount before threshold ──────────────────────────────────────────────

  it("clears timers on unmount without calling activity.start", () => {
    const activity = makeActivity();
    const action = makeAction();

    const { unmount } = renderHook(() =>
      useActionEscalation({
        failedActions: [action],
        activity,
        thresholdMs: 5_000,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    unmount();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(activity.startMock).not.toHaveBeenCalled();
  });

  it("finishes open handles on unmount if escalation already fired", () => {
    const activity = makeActivity();
    const action = makeAction();

    const { unmount } = renderHook(() =>
      useActionEscalation({
        failedActions: [action],
        activity,
        thresholdMs: 1_000,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(activity.startMock).toHaveBeenCalledOnce();

    unmount();
    expect(activity.finishMock).toHaveBeenCalledWith("failed");
  });

  // ── Re-failure rescheduling ───────────────────────────────────────────────

  it("reschedules the timer when the same id re-appears with a newer failedAt", () => {
    const activity = makeActivity();
    const originalFailedAt = Date.now();
    const action = makeAction({ failedAt: originalFailedAt });

    const { rerender } = renderHook(
      ({ failedActions }: { failedActions: FailedAction[] }) =>
        useActionEscalation({ failedActions, activity, thresholdMs: 5_000 }),
      { initialProps: { failedActions: [action] } },
    );

    // Advance 2s — no escalation yet
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(activity.startMock).not.toHaveBeenCalled();

    // Remove (retry dispatched) — clears timer
    rerender({ failedActions: [] });

    // Retry fails again — re-add with a fresh failedAt
    const newFailedAt = Date.now(); // still 2000ms after start due to fake timers
    rerender({
      failedActions: [{ id: "action-1", label: "Save as flashcards", failedAt: newFailedAt }],
    });

    // Old timer was cleared; new timer starts from newFailedAt
    // Advance 4999ms from newFailedAt — should not escalate yet
    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(activity.startMock).not.toHaveBeenCalled();

    // Cross the threshold
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(activity.startMock).toHaveBeenCalledOnce();
  });

  // ── Multiple actions ──────────────────────────────────────────────────────

  it("manages independent timers for multiple failed actions", () => {
    const activity = makeActivity();
    const now = Date.now();
    const actionA1: FailedAction = { id: "a1", label: "Action 1", failedAt: now };
    const actionA2: FailedAction = { id: "a2", label: "Action 2", failedAt: now };

    const { rerender } = renderHook(
      ({ failedActions }: { failedActions: FailedAction[] }) =>
        useActionEscalation({ failedActions, activity, thresholdMs: 3_000 }),
      { initialProps: { failedActions: [actionA1, actionA2] } },
    );

    // Remove a1 before threshold
    rerender({ failedActions: [actionA2] });

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    // Only a2 should escalate
    expect(activity.startMock).toHaveBeenCalledOnce();
    expect(activity.startMock).toHaveBeenCalledWith({
      label: "Action 2",
      metadata: { actionId: "a2" },
    });
  });

  // ── Graceful no-op when activity is absent ────────────────────────────────

  it("is a no-op when activity is undefined (no throws)", () => {
    const action = makeAction();

    const { unmount } = renderHook(() =>
      useActionEscalation({
        failedActions: [action],
        activity: undefined,
        thresholdMs: 1_000,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    unmount();
    // No errors — test passes if it reaches here
  });

  it("is a no-op when activity is null", () => {
    const action = makeAction();

    const { unmount } = renderHook(() =>
      useActionEscalation({
        failedActions: [action],
        activity: null,
        thresholdMs: 1_000,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    unmount();
  });

  // ── failedAt already past threshold ──────────────────────────────────────

  it("escalates immediately (next event loop tick) when failedAt is already past threshold", () => {
    const activity = makeActivity();
    const pastFailedAt = Date.now() - 60_000; // already 60s ago
    const action = makeAction({ failedAt: pastFailedAt });

    renderHook(() =>
      useActionEscalation({
        failedActions: [action],
        activity,
        thresholdMs: 30_000,
      }),
    );

    // Advance just 1ms to flush the 0-delay timer
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(activity.startMock).toHaveBeenCalledOnce();
  });
});
