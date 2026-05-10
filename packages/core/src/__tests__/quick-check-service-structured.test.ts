/**
 * QuickCheckServiceImpl — structured-question round-trip tests.
 *
 * Verifies that:
 *  - service.await() with a structured-question item emits a pending event
 *  - service.resolve() with a structured-question answer resolves the awaiting Promise
 *  - service.resolve() emits a resolved event
 *  - cancellation resolves with abandoned
 */

import { describe, expect, it, vi } from "vitest";
import { QuickCheckServiceImpl } from "../services/quick-check-service.js";
import type { StructuredQuestionItem } from "../types/artifacts.js";
import { brandId } from "../types/index.js";
import type { QuickCheckAnswer, QuickCheckEvent } from "../types/quick-check.js";

const SESSION_ID = brandId<"SessionId">("session-test");

function makeItem(): StructuredQuestionItem {
  return {
    kind: "structured-question",
    id: "call-abc",
    questions: [
      {
        header: "Source",
        prompt: "Which source to use?",
        multiSelect: false,
        options: [{ label: "Pack" }, { label: "Textbook" }],
      },
    ],
  };
}

describe("QuickCheckServiceImpl — structured-question", () => {
  it("emits a pending event when await is called with a structured-question item", async () => {
    const service = new QuickCheckServiceImpl();
    const events: QuickCheckEvent[] = [];
    service.subscribe((e) => events.push(e));

    const item = makeItem();
    // Don't await — we need to check side effects first
    const pendingPromise = service.await({ callId: "call-abc", sessionId: SESSION_ID, item });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "pending",
      callId: "call-abc",
      sessionId: SESSION_ID,
    });
    expect((events[0] as Extract<QuickCheckEvent, { kind: "pending" }>).item.kind).toBe(
      "structured-question",
    );

    // Resolve to clean up
    service.cancel("call-abc");
    await pendingPromise;
  });

  it("resolves the await Promise with the structured-question answer", async () => {
    const service = new QuickCheckServiceImpl();
    const item = makeItem();
    const awaitPromise = service.await({ callId: "call-abc", sessionId: SESSION_ID, item });

    const answer: QuickCheckAnswer = {
      kind: "structured-question",
      answers: [{ questionIndex: 0, selectedIndices: [1] }],
    };

    service.resolve({ callId: "call-abc", answer });

    const resolved = await awaitPromise;
    expect(resolved).toEqual(answer);
  });

  it("emits a resolved event after resolve() is called", async () => {
    const service = new QuickCheckServiceImpl();
    const events: QuickCheckEvent[] = [];
    service.subscribe((e) => events.push(e));

    const item = makeItem();
    const awaitPromise = service.await({ callId: "call-abc", sessionId: SESSION_ID, item });

    const answer: QuickCheckAnswer = {
      kind: "structured-question",
      answers: [{ questionIndex: 0, selectedIndices: [0] }],
    };

    service.resolve({ callId: "call-abc", answer });
    await awaitPromise;

    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ kind: "resolved", callId: "call-abc", answer });
  });

  it("resolves with abandoned when cancel() is called", async () => {
    const service = new QuickCheckServiceImpl();
    const item = makeItem();
    const awaitPromise = service.await({ callId: "call-abc", sessionId: SESSION_ID, item });

    service.cancel("call-abc");

    const resolved = await awaitPromise;
    expect(resolved).toEqual({ kind: "abandoned" });
  });

  it("is a no-op when resolve is called for an unknown callId", () => {
    const service = new QuickCheckServiceImpl();
    expect(() =>
      service.resolve({ callId: "nonexistent", answer: { kind: "abandoned" } }),
    ).not.toThrow();
  });

  it("resolves with abandoned after timeoutMs when no one resolves", async () => {
    vi.useFakeTimers();
    const service = new QuickCheckServiceImpl();
    const item = makeItem();

    const awaitPromise = service.await({
      callId: "call-abc",
      sessionId: SESSION_ID,
      item,
      timeoutMs: 1000,
    });

    vi.advanceTimersByTime(1001);

    const resolved = await awaitPromise;
    expect(resolved).toEqual({ kind: "abandoned" });

    vi.useRealTimers();
  });

  it("supports multiple simultaneous pending structured-question calls", async () => {
    const service = new QuickCheckServiceImpl();
    const item = makeItem();

    const p1 = service.await({ callId: "call-1", sessionId: SESSION_ID, item });
    const p2 = service.await({ callId: "call-2", sessionId: SESSION_ID, item });

    const answer1: QuickCheckAnswer = {
      kind: "structured-question",
      answers: [{ questionIndex: 0, selectedIndices: [0] }],
    };
    const answer2: QuickCheckAnswer = {
      kind: "structured-question",
      answers: [{ questionIndex: 0, selectedIndices: [1] }],
    };

    service.resolve({ callId: "call-2", answer: answer2 });
    service.resolve({ callId: "call-1", answer: answer1 });

    expect(await p1).toEqual(answer1);
    expect(await p2).toEqual(answer2);
  });
});
