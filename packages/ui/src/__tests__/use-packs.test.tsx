import type { ImportedPackClient, PackSummaryClient, PraxisClient } from "@praxis/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { usePacks } from "../hooks/use-packs.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePack(overrides: Partial<PackSummaryClient> = {}): PackSummaryClient {
  return {
    id: "algebra-1",
    version: "1.0.0",
    name: "Algebra 1 (CCSS)",
    subject: "math.algebra-1",
    gradeLevel: "9-12",
    conceptCount: 32,
    edgeCount: 40,
    imported: false,
    ...overrides,
  };
}

function makeImportedPack(overrides: Partial<ImportedPackClient> = {}): ImportedPackClient {
  return {
    packId: "algebra-1",
    version: "1.0.0",
    conceptGraphId: "graph-uuid-123",
    importedAt: Date.now(),
    ...overrides,
  };
}

function makeClient(
  listResult: PackSummaryClient[] | "reject" = [],
  importResult: ImportedPackClient | "reject" = makeImportedPack(),
): PraxisClient {
  return {
    session: {} as PraxisClient["session"],
    artifacts: {
      courses: vi.fn(),
      course: vi.fn(),
      lessons: vi.fn(),
      gates: vi.fn(),
      progress: vi.fn(),
      flashcards: vi.fn(),
      notes: vi.fn(),
      conceptMaps: vi.fn(),
      gateView: vi.fn().mockResolvedValue([]),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
      concepts: vi.fn().mockResolvedValue([]),
    } as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {
      listAvailable:
        listResult === "reject"
          ? vi.fn().mockRejectedValue(new Error("IPC error"))
          : vi.fn().mockResolvedValue(listResult),
      listImported: vi.fn().mockResolvedValue([]),
      import:
        importResult === "reject"
          ? vi.fn().mockRejectedValue(new Error("import failed"))
          : vi.fn().mockResolvedValue(importResult),
    } as PraxisClient["packs"],
    notes: {} as PraxisClient["notes"],
    flashcards: {} as PraxisClient["flashcards"],
  };
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("usePacks", () => {
  it("loads packs on mount", async () => {
    const pack = makePack({ name: "Algebra 1 (CCSS)" });
    const client = makeClient([pack]);

    const { result } = renderHook(() => usePacks(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.packs).toHaveLength(1);
    expect(result.current.packs[0]?.name).toBe("Algebra 1 (CCSS)");
    expect(result.current.error).toBeNull();
    expect(result.current.importing).toBeNull();
  });

  it("starts with loading: true then resolves", async () => {
    const client = makeClient([]);

    const { result } = renderHook(() => usePacks(), { wrapper: wrapper(client) });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("sets error when listAvailable() rejects", async () => {
    const client = makeClient("reject");

    const { result } = renderHook(() => usePacks(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.error).toBe("IPC error");
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.packs).toHaveLength(0);
  });

  it("importPack sets importing while in flight, clears on success", async () => {
    const pack = makePack({ imported: false });
    // After import, list returns the same pack with imported: true
    const listAvailable = vi
      .fn()
      .mockResolvedValueOnce([pack])
      .mockResolvedValueOnce([{ ...pack, imported: true }]);

    const client = makeClient([], makeImportedPack());
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (client.packs as any).listAvailable = listAvailable;

    const { result } = renderHook(() => usePacks(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let importPromise: Promise<ImportedPackClient | null>;
    act(() => {
      importPromise = result.current.importPack("algebra-1");
    });

    // importing is set while in flight
    await waitFor(() => {
      expect(result.current.importing).toBe("algebra-1");
    });

    // biome-ignore lint/style/noNonNullAssertion: assigned in act
    await act(async () => {
      await importPromise!;
    });

    expect(result.current.importing).toBeNull();
    expect(result.current.packs[0]?.imported).toBe(true);
    expect(client.packs.import).toHaveBeenCalledWith("algebra-1");
  });

  it("importPack sets error and returns null on failure", async () => {
    const pack = makePack({ imported: false });
    const client = makeClient([pack], "reject");

    const { result } = renderHook(() => usePacks(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let returnValue: ImportedPackClient | null | undefined;
    await act(async () => {
      returnValue = await result.current.importPack("algebra-1");
    });

    expect(returnValue).toBeNull();
    expect(result.current.error).toBe("import failed");
    expect(result.current.importing).toBeNull();
  });

  it("refresh() re-fetches packs", async () => {
    const client = makeClient([makePack()]);

    const { result } = renderHook(() => usePacks(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(client.packs.listAvailable).toHaveBeenCalledTimes(2);
  });

  it("returns multiple packs correctly", async () => {
    const packs = [
      makePack({ id: "algebra-1", name: "Algebra 1 (CCSS)" }),
      makePack({ id: "geometry", name: "Geometry (CCSS)", imported: true }),
    ];
    const client = makeClient(packs);

    const { result } = renderHook(() => usePacks(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.packs).toHaveLength(2);
    expect(result.current.packs[1]?.imported).toBe(true);
  });
});
