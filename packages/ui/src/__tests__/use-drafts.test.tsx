/**
 * Tests for useDrafts hook.
 *
 * Verifies:
 * - Empty stream → drafts is [], current is null.
 * - snapshot event populates the local draft map.
 * - started/updated events set `current` to the latest mutated draft.
 * - finalized/discarded events drop the draft and clear `current` if it
 *   was the active one.
 * - Unmount stops the loop without throwing.
 */
import type {
  DraftCourseState,
  DraftStreamEvent,
  PraxisClient,
  ProposedCourse,
  StudentId,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useDrafts } from "../hooks/use-drafts.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

async function* makeStream(events: DraftStreamEvent[]): AsyncGenerator<DraftStreamEvent> {
  for (const event of events) {
    yield event;
    await new Promise((r) => setTimeout(r, 0));
  }
}

function makeProposed(title = "Algebra 1"): ProposedCourse {
  return {
    title,
    subject: "math",
    gradeLevel: "9",
    thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
    proposedConcepts: [],
    proposedEdges: [],
    proposedLessons: [],
    proposedUnits: [],
    proposedLessonAssessments: [],
  };
}

function makeDraft(id: string, title = "Algebra 1"): DraftCourseState {
  return {
    draftId: id,
    studentId: brandId<"StudentId">("student-test") as StudentId,
    documentIds: [],
    proposed: makeProposed(title),
    createdAt: 0 as Timestamp,
    lastTouchedAt: 0 as Timestamp,
    expiresAt: (Date.now() + 1_000_000) as Timestamp,
  };
}

function makeClient(events: DraftStreamEvent[]): PraxisClient {
  return makeFakeClient({
    drafts: {
      events: vi.fn(() => makeStream(events)),
    } as PraxisClient["drafts"],
  });
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

describe("useDrafts", () => {
  it("empty stream — drafts is [], current is null", () => {
    const client = makeClient([]);
    const { result } = renderHook(() => useDrafts(), { wrapper: wrapper(client) });
    expect(result.current.drafts).toHaveLength(0);
    expect(result.current.current).toBeNull();
  });

  it("snapshot populates drafts but does not set current", async () => {
    const draft = makeDraft("d1", "Snapshotted");
    const client = makeClient([{ kind: "snapshot", drafts: [draft] }]);
    const { result } = renderHook(() => useDrafts(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));
    // snapshot doesn't pick a 'current' — only mutation events do.
    expect(result.current.current).toBeNull();
  });

  it("started event sets current and adds the draft", async () => {
    const draft = makeDraft("d2", "Started");
    const client = makeClient([
      { kind: "snapshot", drafts: [] },
      { kind: "started", draft },
    ]);
    const { result } = renderHook(() => useDrafts(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.current?.draftId).toBe("d2"));
    expect(result.current.drafts).toHaveLength(1);
  });

  it("updated event refreshes the existing draft and points current at it", async () => {
    const draft = makeDraft("d3", "Original");
    const updated: DraftCourseState = {
      ...draft,
      proposed: { ...draft.proposed, title: "Updated" },
    };
    const client = makeClient([
      { kind: "snapshot", drafts: [draft] },
      { kind: "updated", draft: updated },
    ]);
    const { result } = renderHook(() => useDrafts(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.current?.proposed.title).toBe("Updated"));
  });

  it("finalized event drops the draft and clears current when it was active", async () => {
    const draft = makeDraft("d4");
    const client = makeClient([
      { kind: "started", draft },
      { kind: "finalized", draftId: "d4", courseId: "course-x" },
    ]);
    const { result } = renderHook(() => useDrafts(), { wrapper: wrapper(client) });
    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(0);
      expect(result.current.current).toBeNull();
    });
  });

  it("discarded event drops the draft and clears current when it was active", async () => {
    const draft = makeDraft("d5");
    const client = makeClient([
      { kind: "started", draft },
      { kind: "discarded", draftId: "d5", reason: "expired" },
    ]);
    const { result } = renderHook(() => useDrafts(), { wrapper: wrapper(client) });
    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(0);
      expect(result.current.current).toBeNull();
    });
  });

  it("a discarded event for a non-current draft preserves current", async () => {
    const a = makeDraft("a");
    const b = makeDraft("b");
    const client = makeClient([
      { kind: "started", draft: a },
      { kind: "started", draft: b },
      // 'b' is now the current one. Discard 'a' — current should remain 'b'.
      { kind: "discarded", draftId: "a", reason: "discarded" },
    ]);
    const { result } = renderHook(() => useDrafts(), { wrapper: wrapper(client) });
    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(1);
      expect(result.current.current?.draftId).toBe("b");
    });
  });

  it("unmount — loop stops without throwing", () => {
    const client = makeClient([]);
    const { unmount } = renderHook(() => useDrafts(), { wrapper: wrapper(client) });
    expect(() => unmount()).not.toThrow();
  });
});
