/**
 * Tests for useBootstrapBudget hook.
 *
 * Verifies:
 * - Loads the current config on mount.
 * - setMaxSteps writes through and clamps to [MIN, MAX].
 * - setMaxSteps reverts maxSteps if the underlying setBootstrapConfig rejects.
 * - Floor of fractional values to integers before writing.
 */
import type { PraxisClient } from "@praxis/core/types";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import {
  BOOTSTRAP_BUDGET_MAX,
  BOOTSTRAP_BUDGET_MIN,
  useBootstrapBudget,
} from "../hooks/use-bootstrap-budget.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

function makeClient(opts?: {
  initial?: number;
  setSpy?: (next: { maxSteps: number }) => Promise<void> | void;
}): PraxisClient {
  const initial = opts?.initial ?? 200;
  return makeFakeClient({
    config: {
      isLocked: vi.fn(),
      setLockCode: vi.fn(),
      unlock: vi.fn(),
      selectedEngine: vi.fn(),
      setSelectedEngine: vi.fn(),
      engineConfig: vi.fn(),
      setEngineConfig: vi.fn(),
      bootstrapConfig: vi.fn().mockResolvedValue({ maxSteps: initial }),
      setBootstrapConfig: vi.fn(async (next: { maxSteps: number }) => {
        await opts?.setSpy?.(next);
      }),
    } as unknown as PraxisClient["config"],
  });
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

describe("useBootstrapBudget", () => {
  it("loads the current value on mount", async () => {
    const client = makeClient({ initial: 75 });
    const { result } = renderHook(() => useBootstrapBudget(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.maxSteps).toBe(75));
    expect(result.current.error).toBeNull();
  });

  it("setMaxSteps writes through and updates local state optimistically", async () => {
    const setSpy = vi.fn();
    const client = makeClient({ initial: 200, setSpy });
    const { result } = renderHook(() => useBootstrapBudget(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.maxSteps).toBe(200));

    await act(async () => {
      await result.current.setMaxSteps(120);
    });

    expect(result.current.maxSteps).toBe(120);
    expect(setSpy).toHaveBeenCalledWith({ maxSteps: 120 });
  });

  it("clamps values above the ceiling", async () => {
    const setSpy = vi.fn();
    const client = makeClient({ initial: 200, setSpy });
    const { result } = renderHook(() => useBootstrapBudget(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.maxSteps).toBe(200));

    await act(async () => {
      await result.current.setMaxSteps(9999);
    });

    expect(result.current.maxSteps).toBe(BOOTSTRAP_BUDGET_MAX);
    expect(setSpy).toHaveBeenCalledWith({ maxSteps: BOOTSTRAP_BUDGET_MAX });
  });

  it("clamps values below the floor", async () => {
    const setSpy = vi.fn();
    const client = makeClient({ initial: 200, setSpy });
    const { result } = renderHook(() => useBootstrapBudget(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.maxSteps).toBe(200));

    await act(async () => {
      await result.current.setMaxSteps(-5);
    });

    expect(result.current.maxSteps).toBe(BOOTSTRAP_BUDGET_MIN);
    expect(setSpy).toHaveBeenCalledWith({ maxSteps: BOOTSTRAP_BUDGET_MIN });
  });

  it("floors fractional values before writing", async () => {
    const setSpy = vi.fn();
    const client = makeClient({ initial: 200, setSpy });
    const { result } = renderHook(() => useBootstrapBudget(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.maxSteps).toBe(200));

    await act(async () => {
      await result.current.setMaxSteps(99.9);
    });

    expect(result.current.maxSteps).toBe(99);
    expect(setSpy).toHaveBeenCalledWith({ maxSteps: 99 });
  });

  it("reverts maxSteps and surfaces error when setBootstrapConfig rejects", async () => {
    const setSpy = vi.fn().mockRejectedValue(new Error("write failed"));
    const client = makeClient({ initial: 200, setSpy });
    const { result } = renderHook(() => useBootstrapBudget(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.maxSteps).toBe(200));

    await act(async () => {
      await result.current.setMaxSteps(120);
    });

    expect(result.current.maxSteps).toBe(200);
    expect(result.current.error).toBe("write failed");
  });
});
