/**
 * Tests for useUpdateCheck hook.
 *
 * Verifies:
 * - Initial state is `result: null`.
 * - Resolves to whatever the IPC returns.
 * - Resolves to error on IPC rejection.
 * - dismiss() flips visible state and persists per-version localStorage.
 * - dismissed reflects localStorage matching the latest version.
 */
import type { PraxisClient } from "@praxis/core/types";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useUpdateCheck } from "../hooks/use-update-check.js";
import { makeFakeClient } from "./helpers/fake-client.js";

const DISMISS_KEY = "praxis.update.dismissedVersion";

afterEach(() => {
  cleanup();
  try {
    window.localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* noop */
  }
});

function makeClient(opts?: {
  result?: import("@praxis/core/services").UpdateCheckResult;
  rejects?: boolean;
}): PraxisClient {
  return makeFakeClient({
    update: {
      checkLatest: vi.fn(async () => {
        if (opts?.rejects) throw new Error("ipc-broken");
        return opts?.result ?? { status: "disabled" };
      }),
    } as unknown as PraxisClient["update"],
  });
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

describe("useUpdateCheck", () => {
  beforeEach(() => {
    try {
      window.localStorage.removeItem(DISMISS_KEY);
    } catch {
      /* noop */
    }
  });

  it("returns result: null initially", () => {
    const client = makeClient();
    const { result } = renderHook(() => useUpdateCheck(), { wrapper: wrapper(client) });
    expect(result.current.result).toBeNull();
  });

  it("resolves to the IPC-returned status", async () => {
    const client = makeClient({
      result: {
        status: "available",
        current: "1.0.0",
        latest: { version: "1.0.1", downloadUrl: "https://example.com/p.dmg" },
      },
    });
    const { result } = renderHook(() => useUpdateCheck(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.result?.status).toBe("available"));
  });

  it("resolves to error on IPC rejection", async () => {
    const client = makeClient({ rejects: true });
    const { result } = renderHook(() => useUpdateCheck(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.result?.status).toBe("error"));
  });

  it("dismiss() flips state and persists per-version localStorage", async () => {
    const client = makeClient({
      result: {
        status: "available",
        current: "1.0.0",
        latest: { version: "1.0.1", downloadUrl: "https://example.com/p.dmg" },
      },
    });
    const { result } = renderHook(() => useUpdateCheck(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.result?.status).toBe("available"));

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.result?.status).toBe("up-to-date");
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe("1.0.1");
  });

  it("dismissed is true when localStorage matches the latest version", async () => {
    window.localStorage.setItem(DISMISS_KEY, "1.0.1");
    const client = makeClient({
      result: {
        status: "available",
        current: "1.0.0",
        latest: { version: "1.0.1", downloadUrl: "https://example.com/p.dmg" },
      },
    });
    const { result } = renderHook(() => useUpdateCheck(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.result?.status).toBe("available"));
    expect(result.current.dismissed).toBe(true);
  });
});
