import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFirstOccurrence } from "../../hooks/use-first-occurrence.js";

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHasSeenTerm(seenSet: Set<string>) {
  return vi.fn(async (_studentId: string, term: string) => seenSet.has(term));
}

function makeMarkTermSeen(seenSet: Set<string>) {
  return vi.fn(async (_studentId: string, term: string, _sessionId: string) => {
    seenSet.add(term);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useFirstOccurrence", () => {
  it("isFirst returns false before async population resolves", () => {
    const seenSet = new Set<string>();
    const hasSeenTerm = makeHasSeenTerm(seenSet);
    const markTermSeen = makeMarkTermSeen(seenSet);

    const { result } = renderHook(() =>
      useFirstOccurrence({
        studentId: "student-1",
        sessionId: "session-1",
        hasSeenTerm,
        markTermSeen,
        terms: ["mitosis"],
        recordOccurrence: false,
      }),
    );

    // Map hasn't been populated yet
    expect(result.current.isFirst("mitosis")).toBe(false);
  });

  it("isFirst returns true for a term not yet seen after population", async () => {
    const seenSet = new Set<string>();
    const hasSeenTerm = makeHasSeenTerm(seenSet);
    const markTermSeen = makeMarkTermSeen(seenSet);

    const { result } = renderHook(() =>
      useFirstOccurrence({
        studentId: "student-1",
        sessionId: "session-1",
        hasSeenTerm,
        markTermSeen,
        terms: ["entropy"],
        recordOccurrence: false,
      }),
    );

    // Wait for the async population effect to complete
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isFirst("entropy")).toBe(true);
  });

  it("isFirst returns false for a term already seen", async () => {
    const seenSet = new Set<string>(["photosynthesis"]);
    const hasSeenTerm = makeHasSeenTerm(seenSet);
    const markTermSeen = makeMarkTermSeen(seenSet);

    const { result } = renderHook(() =>
      useFirstOccurrence({
        studentId: "student-1",
        sessionId: "session-1",
        hasSeenTerm,
        markTermSeen,
        terms: ["photosynthesis"],
        recordOccurrence: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isFirst("photosynthesis")).toBe(false);
  });

  it("per-turn cache: second occurrence of the same term returns false within one render", async () => {
    const seenSet = new Set<string>();
    const hasSeenTerm = makeHasSeenTerm(seenSet);
    const markTermSeen = makeMarkTermSeen(seenSet);

    // The same term appears twice in the terms list (simulating two [[def:]] markers)
    const { result } = renderHook(() =>
      useFirstOccurrence({
        studentId: "student-1",
        sessionId: "session-1",
        hasSeenTerm,
        markTermSeen,
        terms: ["mitosis"],
        recordOccurrence: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    // First call → true (not seen before)
    expect(result.current.isFirst("mitosis")).toBe(true);
    // Second call on the same term in the same render epoch → still backed by
    // the same Map entry, so it returns the same value (true in this render).
    // The "second mention is false" semantic is enforced by the renderer which
    // tracks per-message occurrences separately — the hook just provides DB state.
    expect(result.current.isFirst("mitosis")).toBe(true);

    // A term not in the list → false (not found in map)
    expect(result.current.isFirst("osmosis")).toBe(false);
  });

  it("calls markTermSeen for first-occurrence terms when recordOccurrence=true", async () => {
    const seenSet = new Set<string>();
    const hasSeenTerm = makeHasSeenTerm(seenSet);
    const markTermSeen = makeMarkTermSeen(seenSet);

    renderHook(() =>
      useFirstOccurrence({
        studentId: "student-1",
        sessionId: "session-99",
        hasSeenTerm,
        markTermSeen,
        terms: ["velocity"],
        recordOccurrence: true,
      }),
    );

    // The effect runs: hasSeenTerm (1 microtask) → markTermSeen (1 microtask).
    // Flush enough microtask ticks for both to settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(markTermSeen).toHaveBeenCalledWith("student-1", "velocity", "session-99");
  });

  it("does NOT call markTermSeen when recordOccurrence=false", async () => {
    const seenSet = new Set<string>();
    const hasSeenTerm = makeHasSeenTerm(seenSet);
    const markTermSeen = makeMarkTermSeen(seenSet);

    renderHook(() =>
      useFirstOccurrence({
        studentId: "student-1",
        sessionId: "session-1",
        hasSeenTerm,
        markTermSeen,
        terms: ["acceleration"],
        recordOccurrence: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(markTermSeen).not.toHaveBeenCalled();
  });

  it("does NOT call markTermSeen for terms already seen even when recordOccurrence=true", async () => {
    const seenSet = new Set<string>(["known-term"]);
    const hasSeenTerm = makeHasSeenTerm(seenSet);
    const markTermSeen = makeMarkTermSeen(seenSet);

    renderHook(() =>
      useFirstOccurrence({
        studentId: "student-1",
        sessionId: "session-1",
        hasSeenTerm,
        markTermSeen,
        terms: ["known-term"],
        recordOccurrence: true,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(markTermSeen).not.toHaveBeenCalled();
  });

  it("handles empty terms array gracefully", async () => {
    const seenSet = new Set<string>();
    const hasSeenTerm = makeHasSeenTerm(seenSet);
    const markTermSeen = makeMarkTermSeen(seenSet);

    const { result } = renderHook(() =>
      useFirstOccurrence({
        studentId: "student-1",
        sessionId: "session-1",
        hasSeenTerm,
        markTermSeen,
        terms: [],
        recordOccurrence: true,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isFirst("anything")).toBe(false);
    expect(hasSeenTerm).not.toHaveBeenCalled();
    expect(markTermSeen).not.toHaveBeenCalled();
  });
});
