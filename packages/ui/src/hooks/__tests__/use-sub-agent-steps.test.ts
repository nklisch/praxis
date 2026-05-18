/**
 * Tests for useSubAgentSteps hook.
 *
 * Verifies:
 * - Empty stream → steps empty, status "running", label null.
 * - snapshot event → steps and label populated.
 * - step_started → step appears.
 * - step_settled → step gets ok flag.
 * - phase_changed → label updated.
 * - finished (done) → status transitions to "done".
 * - finished (failed) → status transitions to "failed".
 * - finished (interrupted) → status transitions to "failed".
 * - Unmount stops loop without throwing.
 */
import type { PraxisClient, SubAgentEvent, SubAgentItem, SubAgentStep } from "@praxis/core/types";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { useSubAgentSteps } from "../use-sub-agent-steps.js";

afterEach(() => cleanup());

const TEST_CALL_ID = "call-steps-1";
const TEST_SESSION_ID = "sess-steps-1" as unknown as SubAgentItem["sessionId"];

function makeItem(overrides?: Partial<SubAgentItem>): SubAgentItem {
  return {
    parentCallId: TEST_CALL_ID,
    sessionId: TEST_SESSION_ID,
    label: "reading your materials",
    status: "running",
    startedAt: Date.now() as SubAgentItem["startedAt"],
    steps: [],
    ...overrides,
  };
}

function makeStep(callId: string, toolName: string): SubAgentStep {
  return {
    callId,
    toolName,
    label: `Running ${toolName}`,
    startedAt: Date.now() as SubAgentStep["startedAt"],
  };
}

async function* makeStream(events: SubAgentEvent[]): AsyncGenerator<SubAgentEvent, void, unknown> {
  for (const event of events) {
    yield event;
    await new Promise((r) => setTimeout(r, 0));
  }
}

function makeClient(events: SubAgentEvent[]): PraxisClient {
  return makeFakeClient({
    subAgent: {
      events: vi.fn(() => makeStream(events)),
      list: vi.fn().mockResolvedValue([]),
    } as PraxisClient["subAgent"],
  });
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(PraxisClientProvider, { client }, children);
}

describe("useSubAgentSteps", () => {
  it("empty stream — steps empty, status running, label null", () => {
    const client = makeClient([]);
    const { result } = renderHook(() => useSubAgentSteps(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    expect(result.current.steps).toHaveLength(0);
    expect(result.current.status).toBe("running");
    expect(result.current.label).toBeNull();
  });

  it("snapshot with matching item — steps and label populated", async () => {
    const step = makeStep("s1", "document.outline");
    const item = makeItem({ steps: [step] });
    const client = makeClient([{ kind: "snapshot", items: [item] }]);
    const { result } = renderHook(() => useSubAgentSteps(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.steps).toHaveLength(1));
    expect(result.current.label).toBe("reading your materials");
    expect(result.current.status).toBe("running");
  });

  it("snapshot with non-matching parentCallId — stays empty", async () => {
    const item = makeItem({ parentCallId: "other-call" });
    const client = makeClient([{ kind: "snapshot", items: [item] }]);
    const { result } = renderHook(() => useSubAgentSteps(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.steps).toHaveLength(0);
    expect(result.current.label).toBeNull();
  });

  it("step_started → step appears in steps", async () => {
    const item = makeItem();
    const step = makeStep("s1", "document.outline");
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "step_started", parentCallId: TEST_CALL_ID, step },
    ]);
    const { result } = renderHook(() => useSubAgentSteps(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.steps).toHaveLength(1));
    expect(result.current.steps[0]?.callId).toBe("s1");
  });

  it("step_settled → step gets ok flag", async () => {
    const item = makeItem();
    const step = makeStep("s2", "document.read_pages");
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "step_started", parentCallId: TEST_CALL_ID, step },
      { kind: "step_settled", parentCallId: TEST_CALL_ID, callId: "s2", ok: true },
    ]);
    const { result } = renderHook(() => useSubAgentSteps(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.steps[0]?.ok).toBe(true));
  });

  it("phase_changed → label updated", async () => {
    const item = makeItem();
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "phase_changed", parentCallId: TEST_CALL_ID, label: "drafting unit 2" },
    ]);
    const { result } = renderHook(() => useSubAgentSteps(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.label).toBe("drafting unit 2"));
  });

  it("finished (done) → status transitions to 'done'", async () => {
    const item = makeItem();
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "finished", parentCallId: TEST_CALL_ID, status: "done" },
    ]);
    const { result } = renderHook(() => useSubAgentSteps(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.status).toBe("done"));
  });

  it("finished (failed) → status transitions to 'failed'", async () => {
    const item = makeItem();
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "finished", parentCallId: TEST_CALL_ID, status: "failed" },
    ]);
    const { result } = renderHook(() => useSubAgentSteps(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.status).toBe("failed"));
  });

  it("finished (interrupted) → status transitions to 'failed'", async () => {
    const item = makeItem();
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "finished", parentCallId: TEST_CALL_ID, status: "interrupted" },
    ]);
    const { result } = renderHook(() => useSubAgentSteps(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.status).toBe("failed"));
  });

  it("unmount — loop stops without throwing", () => {
    const client = makeClient([]);
    const { unmount } = renderHook(() => useSubAgentSteps(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    expect(() => unmount()).not.toThrow();
  });

  it("multiple step events fold correctly in order", async () => {
    const item = makeItem();
    const step1 = makeStep("t1", "document.outline");
    const step2 = makeStep("t2", "document.read_pages");
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "step_started", parentCallId: TEST_CALL_ID, step: step1 },
      { kind: "step_settled", parentCallId: TEST_CALL_ID, callId: "t1", ok: true },
      { kind: "step_started", parentCallId: TEST_CALL_ID, step: step2 },
    ]);
    const { result } = renderHook(() => useSubAgentSteps(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.steps).toHaveLength(2));
    expect(result.current.steps[0]?.ok).toBe(true);
    expect(result.current.steps[1]?.callId).toBe("t2");
  });
});
