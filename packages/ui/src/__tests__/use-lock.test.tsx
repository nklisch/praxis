import type { LockClient, PraxisClient, Timestamp } from "@praxis/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useLock } from "../hooks/use-lock.js";

function makeLockClient(overrides?: Partial<LockClient>): LockClient {
  return {
    isSet: vi.fn().mockResolvedValue(false),
    isUnlocked: vi.fn().mockResolvedValue(true),
    setLockCode: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue({ ok: true }),
    lock: vi.fn().mockResolvedValue(undefined),
    clearLock: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeClient(lockClient?: LockClient): PraxisClient {
  return {
    session: {} as PraxisClient["session"],
    artifacts: {} as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {} as PraxisClient["packs"],
    lock: lockClient ?? makeLockClient(),
  };
}

function wrapper(client: PraxisClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <PraxisClientProvider client={client}>{children}</PraxisClientProvider>;
  };
}

describe("useLock", () => {
  it("fetches isSet and isUnlocked on mount", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(false),
      isUnlocked: vi.fn().mockResolvedValue(true),
    });
    const client = makeClient(lockClient);

    const { result } = renderHook(() => useLock(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(lockClient.isSet).toHaveBeenCalled();
    expect(lockClient.isUnlocked).toHaveBeenCalled();
    expect(result.current.isSet).toBe(false);
    expect(result.current.isUnlocked).toBe(true);
  });

  it("reflects locked state when lock is set and not unlocked", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      isUnlocked: vi.fn().mockResolvedValue(false),
    });
    const client = makeClient(lockClient);

    const { result } = renderHook(() => useLock(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isSet).toBe(true);
    expect(result.current.isUnlocked).toBe(false);
  });

  it("unlock() calls lock.unlock and refreshes state on success", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      isUnlocked: vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
      unlock: vi.fn().mockResolvedValue({ ok: true }),
    });
    const client = makeClient(lockClient);

    const { result } = renderHook(() => useLock(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let unlockResult: { ok: boolean } | undefined;
    await act(async () => {
      unlockResult = await result.current.unlock("1234");
    });

    expect(unlockResult?.ok).toBe(true);
    expect(lockClient.unlock).toHaveBeenCalledWith("1234");
  });

  it("unlock() returns ok: false on wrong code", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      isUnlocked: vi.fn().mockResolvedValue(false),
      unlock: vi.fn().mockResolvedValue({ ok: false }),
    });
    const client = makeClient(lockClient);

    const { result } = renderHook(() => useLock(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let unlockResult: { ok: boolean } | undefined;
    await act(async () => {
      unlockResult = await result.current.unlock("wrong");
    });

    expect(unlockResult?.ok).toBe(false);
  });

  it("lock() calls lock.lock and refreshes state", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      isUnlocked: vi.fn().mockResolvedValue(true),
      lock: vi.fn().mockResolvedValue(undefined),
    });
    const client = makeClient(lockClient);

    const { result } = renderHook(() => useLock(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.lock();
    });

    expect(lockClient.lock).toHaveBeenCalled();
  });

  it("setLockCode() calls lock.setLockCode and refreshes", async () => {
    const lockClient = makeLockClient();
    const client = makeClient(lockClient);

    const { result } = renderHook(() => useLock(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setLockCode("5678");
    });

    expect(lockClient.setLockCode).toHaveBeenCalledWith("5678");
  });
});
