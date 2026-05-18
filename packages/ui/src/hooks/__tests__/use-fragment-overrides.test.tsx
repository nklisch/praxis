import type { FragmentOverride, PraxisClient } from "@praxis/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { useFragmentOverrides } from "../use-fragment-overrides.js";

function makeClient(overrides: FragmentOverride[]): PraxisClient {
  return makeFakeClient({
    author: {
      listFragmentOverrides: vi.fn().mockResolvedValue(overrides),
    } as unknown as PraxisClient["author"],
  });
}

function wrapper(client: PraxisClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <PraxisClientProvider client={client}>{children}</PraxisClientProvider>;
  };
}

describe("useFragmentOverrides", () => {
  it("returns an empty Map when no overrides are stored", async () => {
    const client = makeClient([]);
    const { result } = renderHook(() => useFragmentOverrides("teach"), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.byId.size).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it("returns a byId Map keyed by fragmentId", async () => {
    const client = makeClient([
      { modeId: "teach", fragmentId: "role.tutor", override: "custom role" },
      { modeId: "teach", fragmentId: "constraints.struggle", override: "custom constraint" },
    ]);
    const { result } = renderHook(() => useFragmentOverrides("teach"), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.byId.get("role.tutor")).toBe("custom role");
    expect(result.current.byId.get("constraints.struggle")).toBe("custom constraint");
  });

  it("calls listFragmentOverrides with the correct modeId", async () => {
    const listFn = vi.fn().mockResolvedValue([]);
    const client = makeFakeClient({
      author: {
        listFragmentOverrides: listFn,
      } as unknown as PraxisClient["author"],
    });

    renderHook(() => useFragmentOverrides("quiz"), { wrapper: wrapper(client) });

    await waitFor(() => expect(listFn).toHaveBeenCalledWith("quiz"));
  });

  it("refresh re-calls the loader and updates the map", async () => {
    const listFn = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { modeId: "teach", fragmentId: "role.tutor", override: "refreshed" },
      ]);
    const client = makeFakeClient({
      author: {
        listFragmentOverrides: listFn,
      } as unknown as PraxisClient["author"],
    });

    const { result } = renderHook(() => useFragmentOverrides("teach"), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.byId.size).toBe(0);

    // Wrap in act() so React flushes all state updates (data + loading) before
    // we assert. Without act(), the async state updates from refresh() can fire
    // outside React's test queue, causing a race where waitFor sees loading=false
    // but byId still reflects stale data. See use-resource.test.tsx refresh test
    // for the canonical pattern.
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.byId.get("role.tutor")).toBe("refreshed");
  });
});
