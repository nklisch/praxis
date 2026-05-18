/**
 * Tests for useFirstRun hook.
 *
 * Verifies:
 * - Initial state is loading=true, isFirstRun=null.
 * - Resolves to isFirstRun=true on a fresh DB (firstRunCompleted returns false).
 * - Resolves to isFirstRun=false when onboarding has already been completed.
 * - On IPC read error, fail-open: settles to isFirstRun=false (treat as completed).
 * - complete() writes the flag and flips isFirstRun synchronously.
 */
import type { PraxisClient } from "@praxis/core/types";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useFirstRun } from "../hooks/use-first-run.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

function makeClient(opts?: {
  completed?: boolean;
  readRejects?: boolean;
  markSpy?: () => Promise<void> | void;
}): PraxisClient {
  return makeFakeClient({
    config: {
      isLocked: vi.fn(),
      setLockCode: vi.fn(),
      unlock: vi.fn(),
      selectedEngine: vi.fn(),
      setSelectedEngine: vi.fn(),
      engineConfig: vi.fn(),
      setEngineConfig: vi.fn(),
      courseCreateConfig: vi.fn(),
      setCourseCreateConfig: vi.fn(),
      firstRunCompleted: vi.fn(async () => {
        if (opts?.readRejects) throw new Error("ipc broken");
        return opts?.completed ?? false;
      }),
      markFirstRunComplete: vi.fn(async () => {
        await opts?.markSpy?.();
      }),
    } as unknown as PraxisClient["config"],
  });
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

describe("useFirstRun", () => {
  it("starts in loading state with null isFirstRun", () => {
    const client = makeClient();
    const { result } = renderHook(() => useFirstRun(), { wrapper: wrapper(client) });
    expect(result.current.loading).toBe(true);
    expect(result.current.isFirstRun).toBeNull();
  });

  it("resolves to isFirstRun=true on a fresh database", async () => {
    const client = makeClient({ completed: false });
    const { result } = renderHook(() => useFirstRun(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isFirstRun).toBe(true);
  });

  it("resolves to isFirstRun=false when onboarding was already completed", async () => {
    const client = makeClient({ completed: true });
    const { result } = renderHook(() => useFirstRun(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isFirstRun).toBe(false);
  });

  it("fails open on IPC read error (treat as completed)", async () => {
    const client = makeClient({ readRejects: true });
    const { result } = renderHook(() => useFirstRun(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isFirstRun).toBe(false);
  });

  it("complete() flips isFirstRun to false after the IPC resolves", async () => {
    const markSpy = vi.fn();
    const client = makeClient({ completed: false, markSpy });
    const { result } = renderHook(() => useFirstRun(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isFirstRun).toBe(true));

    await act(async () => {
      await result.current.complete();
    });

    expect(result.current.isFirstRun).toBe(false);
    expect(markSpy).toHaveBeenCalledTimes(1);
  });
});
