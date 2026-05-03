/**
 * Tests for useQuickCheckBridge hook.
 *
 * Verifies that the hook subscribes to quickCheck.events() and correctly
 * reflects pending → resolved state transitions.
 */
import type { AssignmentItem, PraxisClient, QuickCheckEvent, SessionId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useQuickCheckBridge } from "../hooks/use-quick-check-bridge.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => {
  cleanup();
});

const sessionId = brandId<"SessionId">("session-1") as unknown as SessionId;

const singleChoiceItem: AssignmentItem = {
  kind: "single-choice",
  id: "qc-a",
  prompt: "Which is correct?",
  options: ["A", "B"],
  correctOptionIndex: 0,
};

// Helper: create an async iterable from an array of events with optional delay
function makeEventIterable(events: QuickCheckEvent[]): AsyncIterable<QuickCheckEvent> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < events.length) {
            const value = events[index++]!;
            // Small yield to let React batching settle
            await new Promise((r) => setTimeout(r, 0));
            return { value, done: false };
          }
          // Hold open the stream — never completes during test
          await new Promise(() => {});
          return { value: undefined as never, done: true };
        },
      };
    },
  };
}

// Test component that renders the pending list
function TestComponent({ sessionId }: { sessionId: SessionId }) {
  const { pending } = useQuickCheckBridge(sessionId);
  return (
    <div>
      {pending.map((check) => (
        <div key={check.callId} data-testid={`check-${check.callId}`}>
          {check.callId}:{check.resolved ? "resolved" : "pending"}
        </div>
      ))}
    </div>
  );
}

function makeClient(events: QuickCheckEvent[]): PraxisClient {
  return makeFakeClient({
    quickCheck: {
      events: () => makeEventIterable(events),
      resolve: vi.fn().mockResolvedValue(undefined),
    },
  });
}

describe("useQuickCheckBridge", () => {
  it("appends a pending check when a pending event arrives", async () => {
    const client = makeClient([
      { kind: "pending", callId: "call-1", sessionId, item: singleChoiceItem },
    ]);

    render(
      <PraxisClientProvider client={client}>
        <TestComponent sessionId={sessionId} />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("check-call-1")).toBeDefined();
    });
    expect(screen.getByText("call-1:pending")).toBeDefined();
  });

  it("marks a check as resolved when resolved event arrives", async () => {
    const client = makeClient([
      { kind: "pending", callId: "call-1", sessionId, item: singleChoiceItem },
      { kind: "resolved", callId: "call-1", answer: { kind: "single-choice", selectedIndex: 0 } },
    ]);

    render(
      <PraxisClientProvider client={client}>
        <TestComponent sessionId={sessionId} />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("call-1:resolved")).toBeDefined();
    });
  });

  it("ignores events for other sessions", async () => {
    const otherSessionId = brandId<"SessionId">("session-other") as unknown as SessionId;
    const client = makeClient([
      { kind: "pending", callId: "call-x", sessionId: otherSessionId, item: singleChoiceItem },
    ]);

    render(
      <PraxisClientProvider client={client}>
        <TestComponent sessionId={sessionId} />
      </PraxisClientProvider>,
    );

    // Wait a tick and verify no check appeared
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("check-call-x")).toBeNull();
  });

  it("accumulates multiple pending checks in arrival order", async () => {
    const singleChoiceItem2: AssignmentItem = {
      kind: "short-answer",
      id: "qc-b",
      prompt: "Spell hello",
      acceptedAnswers: ["hello"],
    };

    const client = makeClient([
      { kind: "pending", callId: "call-1", sessionId, item: singleChoiceItem },
      { kind: "pending", callId: "call-2", sessionId, item: singleChoiceItem2 },
    ]);

    render(
      <PraxisClientProvider client={client}>
        <TestComponent sessionId={sessionId} />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("check-call-2")).toBeDefined();
    });

    // Both appear
    expect(screen.getByTestId("check-call-1")).toBeDefined();
    expect(screen.getByTestId("check-call-2")).toBeDefined();
  });
});
