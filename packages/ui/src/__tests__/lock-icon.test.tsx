import type { LockClient, PraxisClient } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LockIcon } from "../components/lock-icon.js";
import { PraxisClientProvider } from "../context/client-context.js";

afterEach(() => cleanup());

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

function makeClient(lockClient: LockClient): PraxisClient {
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
    notes: {} as PraxisClient["notes"],
    flashcards: {} as PraxisClient["flashcards"],
    lock: lockClient,
    claudeAuth: {} as PraxisClient["claudeAuth"],
    shell: {} as PraxisClient["shell"],
    tabs: {} as PraxisClient["tabs"],
  };
}

function renderIcon(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <LockIcon />
    </PraxisClientProvider>,
  );
}

describe("LockIcon", () => {
  it("renders unlocked icon when no lock is set", async () => {
    const client = makeClient(makeLockClient({ isSet: vi.fn().mockResolvedValue(false) }));
    renderIcon(client);

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeDefined();
    });

    const btn = screen.getByRole("button");
    expect(btn.textContent).toBe("🔓");
  });

  it("renders locked icon when lock is set and not unlocked", async () => {
    const client = makeClient(
      makeLockClient({
        isSet: vi.fn().mockResolvedValue(true),
        isUnlocked: vi.fn().mockResolvedValue(false),
      }),
    );
    renderIcon(client);

    await waitFor(() => {
      const btn = screen.getByRole("button");
      expect(btn.textContent).toBe("🔒");
    });
  });

  it("opens UnlockModal when locked icon is clicked", async () => {
    const client = makeClient(
      makeLockClient({
        isSet: vi.fn().mockResolvedValue(true),
        isUnlocked: vi.fn().mockResolvedValue(false),
      }),
    );
    renderIcon(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /locked/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /locked/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
  });

  it("calls lock() when unlocked icon is clicked while a lock is set", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      isUnlocked: vi.fn().mockResolvedValue(true),
      lock: vi.fn().mockResolvedValue(undefined),
    });
    const client = makeClient(lockClient);
    renderIcon(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /unlocked/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /unlocked/i }));

    await waitFor(() => {
      expect(lockClient.lock).toHaveBeenCalled();
    });
  });
});
