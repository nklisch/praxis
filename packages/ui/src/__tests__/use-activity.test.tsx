/**
 * Tests for useActivity hook.
 *
 * Verifies:
 * - Empty stream → items is [].
 * - snapshot event with items → items populated.
 * - added/updated/removed events → state updated correctly.
 * - Unmount stops the loop without throwing.
 */
import type { ActivityEvent, ActivityItem, PraxisClient } from "@praxis/core/types";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { PraxisClientProvider } from "../context/client-context.js";
import { useActivity } from "../hooks/use-activity.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

async function* makeActivityStream(
  events: ActivityEvent[],
): AsyncGenerator<ActivityEvent, void, unknown> {
  for (const event of events) {
    yield event;
    // small tick to allow state updates
    await new Promise((r) => setTimeout(r, 0));
  }
}

function makeItem(id: string, label: string): ActivityItem {
  return {
    id,
    label,
    status: "running",
    startedAt: Date.now() as ActivityItem["startedAt"],
  };
}

function makeClient(events: ActivityEvent[]): PraxisClient {
  return makeFakeClient({
    activity: {
      events: vi.fn(() => makeActivityStream(events)),
      dismiss: vi.fn().mockResolvedValue(undefined),
    } as PraxisClient["activity"],
  });
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

describe("useActivity", () => {
  it("empty stream — items is []", () => {
    const client = makeClient([]);
    const { result } = renderHook(() => useActivity(), {
      wrapper: wrapper(client),
    });
    expect(result.current.items).toHaveLength(0);
  });

  it("snapshot with items — items populated", async () => {
    const item = makeItem("a", "loading data");
    const client = makeClient([{ kind: "snapshot", items: [item] }]);
    const { result } = renderHook(() => useActivity(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]).toMatchObject({ id: "a", label: "loading data" });
  });

  it("added event — item appears", async () => {
    const item = makeItem("b", "indexing");
    const client = makeClient([
      { kind: "snapshot", items: [] },
      { kind: "added", item },
    ]);
    const { result } = renderHook(() => useActivity(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]).toMatchObject({ id: "b" });
  });

  it("updated event — item updated in place", async () => {
    const item = makeItem("c", "loading");
    const updated = { ...item, label: "loading (page 5)" };
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "updated", item: updated },
    ]);
    const { result } = renderHook(() => useActivity(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.items[0]?.label).toBe("loading (page 5)"));
  });

  it("removed event — item disappears", async () => {
    const item = makeItem("d", "thinking");
    const client = makeClient([
      { kind: "snapshot", items: [item] },
      { kind: "removed", id: "d" },
    ]);
    const { result } = renderHook(() => useActivity(), {
      wrapper: wrapper(client),
    });
    // Both events are processed in sequence; wait for the final settled state.
    await waitFor(() => expect(result.current.items).toHaveLength(0));
  });

  it("dismiss() calls client.activity.dismiss", async () => {
    const dismissFn = vi.fn().mockResolvedValue(undefined);
    const client = makeFakeClient({
      activity: {
        events: vi.fn(() => makeActivityStream([])),
        dismiss: dismissFn,
      } as PraxisClient["activity"],
    });
    const { result } = renderHook(() => useActivity(), {
      wrapper: wrapper(client),
    });
    result.current.dismiss("some-id");
    // allow microtask
    await new Promise((r) => setTimeout(r, 0));
    expect(dismissFn).toHaveBeenCalledWith("some-id");
  });

  it("unmount — loop stops without throwing", () => {
    const client = makeClient([]);
    const { unmount } = renderHook(() => useActivity(), {
      wrapper: wrapper(client),
    });
    expect(() => unmount()).not.toThrow();
  });
});
