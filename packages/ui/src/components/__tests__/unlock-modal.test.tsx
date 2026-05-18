/**
 * Tests for <UnlockModal>
 *
 * Covers:
 * - Renders dialog with ornament, kicker, title, and code input.
 * - Submitting a correct passcode calls onUnlocked() and onClose().
 * - Submitting a wrong passcode shows an error and keeps the dialog open.
 * - Cancel button calls onClose() without attempting unlock.
 * - Unlock button disabled/enabled state.
 * - Re-lock path: LockIcon calls lock() when the session is already unlocked,
 *   and useLock reflects the new locked state.
 */
import type { LockClient, PraxisClient } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { LockIcon } from "../lock-icon.js";
import { UnlockModal } from "../unlock-modal.js";

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
  return makeFakeClient({ lock: lockClient });
}

function renderModal(
  lockClient: LockClient,
  props?: { onClose?: () => void; onUnlocked?: () => void },
) {
  const onClose = props?.onClose ?? vi.fn();
  const onUnlocked = props?.onUnlocked ?? vi.fn();
  const client = makeClient(lockClient);
  return {
    onClose,
    onUnlocked,
    ...render(
      <PraxisClientProvider client={client}>
        <UnlockModal onClose={onClose} onUnlocked={onUnlocked} />
      </PraxisClientProvider>,
    ),
  };
}

describe("UnlockModal", () => {
  it("renders the dialog with kicker, title and code input", () => {
    const lockClient = makeLockClient();
    renderModal(lockClient);

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("UNLOCK")).toBeDefined();
    expect(screen.getByText("unlock configure")).toBeDefined();
    expect(screen.getByLabelText("Lock code")).toBeDefined();
  });

  it("renders Cancel and Unlock buttons", () => {
    const lockClient = makeLockClient();
    renderModal(lockClient);

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDefined();
  });

  it("Unlock button is disabled when input is empty", () => {
    const lockClient = makeLockClient();
    renderModal(lockClient);

    const unlockBtn = screen.getByRole("button", { name: "Unlock" });
    expect(unlockBtn.hasAttribute("disabled")).toBe(true);
  });

  it("Unlock button becomes enabled when user types a code", () => {
    const lockClient = makeLockClient();
    renderModal(lockClient);

    fireEvent.change(screen.getByLabelText("Lock code"), { target: { value: "5678" } });

    const unlockBtn = screen.getByRole("button", { name: "Unlock" });
    expect(unlockBtn.hasAttribute("disabled")).toBe(false);
  });

  it("submitting the correct passcode calls unlock, onUnlocked, and onClose", async () => {
    const lockClient = makeLockClient({
      unlock: vi.fn().mockResolvedValue({ ok: true }),
    });
    const onClose = vi.fn();
    const onUnlocked = vi.fn();
    renderModal(lockClient, { onClose, onUnlocked });

    const input = screen.getByLabelText("Lock code");
    fireEvent.change(input, { target: { value: "1234" } });
    const form = input.closest("form");
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(lockClient.unlock).toHaveBeenCalledWith("1234");
      expect(onUnlocked).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("submitting a wrong passcode shows an error and keeps the dialog open", async () => {
    const lockClient = makeLockClient({
      unlock: vi.fn().mockResolvedValue({ ok: false }),
    });
    const onClose = vi.fn();
    const onUnlocked = vi.fn();
    renderModal(lockClient, { onClose, onUnlocked });

    const input = screen.getByLabelText("Lock code");
    fireEvent.change(input, { target: { value: "wrong" } });
    const form = input.closest("form");
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });

    // Dialog stays open on failure
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancel button calls onClose without attempting unlock", () => {
    const lockClient = makeLockClient();
    const onClose = vi.fn();
    const onUnlocked = vi.fn();
    renderModal(lockClient, { onClose, onUnlocked });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(lockClient.unlock).not.toHaveBeenCalled();
    expect(onUnlocked).not.toHaveBeenCalled();
  });
});

describe("Re-lock path (LockIcon)", () => {
  it("calls lock() when the unlocked icon is clicked while a lock code is set", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      isUnlocked: vi.fn().mockResolvedValue(true),
      lock: vi.fn().mockResolvedValue(undefined),
    });
    const client = makeClient(lockClient);

    render(
      <PraxisClientProvider client={client}>
        <LockIcon />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /unlocked/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /unlocked/i }));

    await waitFor(() => {
      expect(lockClient.lock).toHaveBeenCalled();
    });
  });

  it("reflects locked icon after lock() resolves", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      // First call returns true (unlocked), subsequent calls return false (locked).
      isUnlocked: vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false),
      lock: vi.fn().mockResolvedValue(undefined),
    });
    const client = makeClient(lockClient);

    render(
      <PraxisClientProvider client={client}>
        <LockIcon />
      </PraxisClientProvider>,
    );

    // Initially shows the unlocked icon
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /unlocked/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /unlocked/i }));

    // After lock(), the icon should show the locked state
    await waitFor(() => {
      const btn = screen.getByRole("button");
      expect(btn.textContent).toBe("🔒");
    });
  });
});
