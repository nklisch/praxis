/**
 * Tests for useSubAgent hook.
 *
 * Verifies:
 * - Empty stream → item is null.
 * - snapshot event → item populated.
 * - step_started / step_settled → steps folded correctly.
 * - phase_changed → label updated.
 * - finished → status updated.
 * - On stream error, last good state is kept.
 * - Unmount stops the loop without throwing.
 */
import type { PraxisClient, SubAgentEvent, SubAgentItem, SubAgentStep } from "@praxis/core/types";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../../context/client-context.js";
import { useSubAgent } from "../use-sub-agent.js";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";

afterEach(() => cleanup());

const TEST_CALL_ID = "call-1";
const TEST_SESSION_ID = "sess-1" as unknown as SubAgentItem["sessionId"];

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

async function* makeEventStream(
  events: SubAgentEvent[],
): AsyncGenerator<SubAgentEvent, void, unknown> {
  for (const event of events) {
    yield event;
    await new Promise((r) => setTimeout(r, 0));
  }
}

function makeClient(events: SubAgentEvent[]): PraxisClient {
  return makeFakeClient({
    subAgent: {
      events: vi.fn(() => makeEventStream(events)),
      list: vi.fn().mockResolvedValue([]),
    } as PraxisClient["subAgent"],
  });
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

describe("useSubAgent", () => {
  it("empty stream — item is null", () => {
    const client = makeClient([]);
    const { result } = renderHook(() => useSubAgent(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    expect(result.current.item).toBeNull();
    expect(result.current.recentSteps).toHaveLength(0);
  });

  it("snapshot with matching item — item populated", async () => {
    const item = makeItem();
    const client = makeClient([{ kind: "snapshot", items: [item] }]);
    const { result } = renderHook(() => useSubAgent(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.item).not.toBeNull());
    expect(result.current.item?.label).toBe("reading your materials");
    expect(result.current.item?.status).toBe("running");
  });

  it("snapshot with non-matching item — item stays null", async () => {
    const item = makeItem({ parentCallId: "other-call" });
    const client = makeClient([{ kind: "snapshot", items: [item] }]);
    const { result } = renderHook(() => useSubAgent(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    // Give event loop a chance to process.
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.item).toBeNull();
  });

  it("started event — item set", async () => {
    const item = makeItem();
    const client = makeClient([
      { kind: "snapshot", items: [] },
      { kind: "started", item },
    ]);
    const { result } = renderHook(() => useSubAgent(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.item).not.toBeNull());
    expect(result.current.item?.parentCallId).toBe(TEST_CALL_ID);
  });

  it("step_started → step appears in recentSteps", async () => {
    const item = makeItem();
    const step = makeStep("s1", "document.outline");
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "step_started", parentCallId: TEST_CALL_ID, step },
    ]);
    const { result } = renderHook(() => useSubAgent(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.recentSteps).toHaveLength(1));
    expect(result.current.recentSteps[0]?.callId).toBe("s1");
    expect(result.current.recentSteps[0]?.toolName).toBe("document.outline");
  });

  it("step_settled → step gets ok flag", async () => {
    const item = makeItem();
    const step = makeStep("s2", "document.read_pages");
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "step_started", parentCallId: TEST_CALL_ID, step },
      { kind: "step_settled", parentCallId: TEST_CALL_ID, callId: "s2", ok: true },
    ]);
    const { result } = renderHook(() => useSubAgent(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.recentSteps[0]?.ok).toBe(true));
  });

  it("phase_changed → label updated", async () => {
    const item = makeItem();
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "phase_changed", parentCallId: TEST_CALL_ID, label: "drafting an outline" },
    ]);
    const { result } = renderHook(() => useSubAgent(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.item?.label).toBe("drafting an outline"));
  });

  it("finished → status updated to done", async () => {
    const item = makeItem();
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "finished", parentCallId: TEST_CALL_ID, status: "done" },
    ]);
    const { result } = renderHook(() => useSubAgent(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.item?.status).toBe("done"));
  });

  it("finished with failed status and errorMessage", async () => {
    const item = makeItem();
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      {
        kind: "finished",
        parentCallId: TEST_CALL_ID,
        status: "failed",
        errorMessage: "engine error",
      },
    ]);
    const { result } = renderHook(() => useSubAgent(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.item?.status).toBe("failed"));
    expect(result.current.item?.errorMessage).toBe("engine error");
  });

  it("multiple steps in sequence fold correctly", async () => {
    const item = makeItem();
    const step1 = makeStep("t1", "document.outline");
    const step2 = makeStep("t2", "document.read_pages");
    const step3 = makeStep("t3", "document.list_sections");
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "step_started", parentCallId: TEST_CALL_ID, step: step1 },
      { kind: "step_settled", parentCallId: TEST_CALL_ID, callId: "t1", ok: true },
      { kind: "step_started", parentCallId: TEST_CALL_ID, step: step2 },
      { kind: "step_started", parentCallId: TEST_CALL_ID, step: step3 },
    ]);
    const { result } = renderHook(() => useSubAgent(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.recentSteps).toHaveLength(3));
    expect(result.current.recentSteps[0]?.ok).toBe(true); // t1 settled
    expect(result.current.recentSteps[1]?.callId).toBe("t2");
    expect(result.current.recentSteps[2]?.callId).toBe("t3");
  });

  it("unmount — loop stops without throwing", () => {
    const client = makeClient([]);
    const { unmount } = renderHook(() => useSubAgent(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    expect(() => unmount()).not.toThrow();
  });

  it("stream error — keeps last good state", async () => {
    const item = makeItem();
    // Stream throws after the snapshot.
    async function* errorStream(): AsyncGenerator<SubAgentEvent, void, unknown> {
      yield { kind: "snapshot", items: [item] };
      await new Promise((r) => setTimeout(r, 0));
      throw new Error("IPC disconnected");
    }
    const client = makeFakeClient({
      subAgent: {
        events: vi.fn(() => errorStream()),
        list: vi.fn().mockResolvedValue([]),
      } as PraxisClient["subAgent"],
    });
    const { result } = renderHook(() => useSubAgent(TEST_CALL_ID), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.item).not.toBeNull());
    // After error, item should remain (not reset to null).
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.item?.parentCallId).toBe(TEST_CALL_ID);
  });
});
