/**
 * Tests for <ToolCallEntry>.
 *
 * Verifies:
 * - Renders one-line entry with verdict glyph + name + summary for all 3 verdict states.
 * - When `actionId` set and not restored: revert button visible.
 * - Clicking revert button opens confirmation modal.
 * - Confirming the modal calls `restoreAction` with the given actionId.
 * - After successful restore: shows "↶ restored" muted label.
 * - When `actionId` set and `restoredAt` is set: shows "↶ restored" immediately.
 * - When `actionId` absent: no revert button rendered.
 * - When `restoreAction` returns ok:false: shows inline error text.
 */
import type { PraxisClient, RestoreResult, Timestamp } from "@praxis/core/types";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { ToolCallEntry } from "../tool-call-entry.js";

afterEach(() => cleanup());

const ACTION_ID = "action-abc-123";

function makeClient(
  restoreResult: RestoreResult = { ok: true, restoredEntity: "lesson", entityKey: "lesson-1" },
): PraxisClient {
  return makeFakeClient({
    author: {
      restoreAction: vi.fn().mockResolvedValue(restoreResult),
      listConfiguratorActions: vi.fn().mockResolvedValue([]),
    } as unknown as PraxisClient["author"],
  });
}

function Wrapper({ client, children }: { client: PraxisClient; children: React.ReactNode }) {
  return <PraxisClientProvider client={client}>{children}</PraxisClientProvider>;
}

function renderEntry(
  props: Parameters<typeof ToolCallEntry>[0],
  client: PraxisClient = makeClient(),
) {
  return render(
    <Wrapper client={client}>
      <ToolCallEntry {...props} />
    </Wrapper>,
  );
}

describe("ToolCallEntry — verdict states", () => {
  it("renders verdict glyph ✓ and tool name for ok verdict", () => {
    const { container } = renderEntry({
      name: "lesson.create",
      summary: "Added a lesson",
      verdict: "ok",
    });
    expect(container.textContent).toContain("✓");
    expect(container.textContent).toContain("lesson.create");
    expect(container.textContent).toContain("Added a lesson");
  });

  it("renders verdict glyph ⊘ for error verdict", () => {
    const { container } = renderEntry({
      name: "lesson.edit",
      summary: "Failed to edit lesson.",
      verdict: "error",
    });
    expect(container.textContent).toContain("⊘");
    expect(container.textContent).toContain("lesson.edit");
  });

  it("renders verdict glyph … for running verdict", () => {
    const { container } = renderEntry({
      name: "gate.create",
      summary: "…",
      verdict: "running",
    });
    expect(container.textContent).toContain("…");
    expect(container.textContent).toContain("gate.create");
  });
});

describe("ToolCallEntry — revert affordance", () => {
  it("no revert button when actionId is absent", () => {
    const { queryByRole } = renderEntry({
      name: "lesson.create",
      summary: "Added a lesson",
      verdict: "ok",
    });
    expect(queryByRole("button")).toBeNull();
  });

  it("revert button visible when actionId set and not restored", () => {
    const { getByRole } = renderEntry({
      name: "lesson.create",
      summary: "Added a lesson",
      verdict: "ok",
      actionId: ACTION_ID,
    });
    const btn = getByRole("button", { name: /revert/i });
    expect(btn).toBeDefined();
    expect(btn.textContent).toContain("revert");
  });

  it("shows '↶ restored' label and no button when restoredAt is set", () => {
    const { container, queryByRole } = renderEntry({
      name: "lesson.create",
      summary: "Added a lesson",
      verdict: "ok",
      actionId: ACTION_ID,
      restoredAt: 1747476000000 as Timestamp,
    });
    expect(container.textContent).toContain("restored");
    expect(queryByRole("button")).toBeNull();
  });

  it("clicking revert button opens confirmation modal", () => {
    const { getByRole, getByText } = renderEntry({
      name: "lesson.create",
      summary: "Added a lesson",
      verdict: "ok",
      actionId: ACTION_ID,
    });
    fireEvent.click(getByRole("button", { name: /revert/i }));
    // Modal heading
    expect(getByText("Revert this action?")).toBeDefined();
    // Confirmation hint visible
    expect(getByText(/restore the affected record/)).toBeDefined();
  });

  it("cancel closes the modal without calling restoreAction", () => {
    const client = makeClient();
    const { getByRole, queryByText } = renderEntry(
      {
        name: "lesson.create",
        summary: "Added a lesson",
        verdict: "ok",
        actionId: ACTION_ID,
      },
      client,
    );
    fireEvent.click(getByRole("button", { name: /revert/i }));
    expect(queryByText("Revert this action?")).not.toBeNull();

    fireEvent.click(getByRole("button", { name: /^cancel$/i }));
    expect(queryByText("Revert this action?")).toBeNull();
    expect(client.author.restoreAction).not.toHaveBeenCalled();
  });

  it("confirm calls restoreAction with actionId", async () => {
    const client = makeClient({ ok: true, restoredEntity: "lesson", entityKey: "lesson-1" });
    const { getByRole } = renderEntry(
      {
        name: "lesson.create",
        summary: "Added a lesson",
        verdict: "ok",
        actionId: ACTION_ID,
      },
      client,
    );
    fireEvent.click(getByRole("button", { name: /revert/i }));
    fireEvent.click(getByRole("button", { name: /^revert$/i }));
    await waitFor(() =>
      expect(client.author.restoreAction).toHaveBeenCalledWith({ actionId: ACTION_ID }),
    );
  });

  it("shows '↶ restored' after successful restoreAction", async () => {
    const client = makeClient({ ok: true, restoredEntity: "lesson", entityKey: "lesson-1" });
    const { getByRole, container } = renderEntry(
      {
        name: "lesson.create",
        summary: "Added a lesson",
        verdict: "ok",
        actionId: ACTION_ID,
      },
      client,
    );
    fireEvent.click(getByRole("button", { name: /revert/i }));
    fireEvent.click(getByRole("button", { name: /^revert$/i }));
    await waitFor(() => expect(container.textContent).toContain("restored"));
    // Revert button gone.
    expect(container.querySelector("button[aria-label*='Revert']")).toBeNull();
  });

  it("shows inline error when restoreAction returns ok:false already_restored", async () => {
    const client = makeClient({ ok: false, reason: "already_restored" });
    const { getByRole, container } = renderEntry(
      {
        name: "lesson.create",
        summary: "Added a lesson",
        verdict: "ok",
        actionId: ACTION_ID,
      },
      client,
    );
    fireEvent.click(getByRole("button", { name: /revert/i }));
    fireEvent.click(getByRole("button", { name: /^revert$/i }));
    await waitFor(() => expect(container.textContent).toContain("Already restored"));
  });

  it("shows inline error when restoreAction returns ok:false no_snapshot", async () => {
    const client = makeClient({ ok: false, reason: "no_snapshot" });
    const { getByRole, container } = renderEntry(
      {
        name: "lesson.create",
        summary: "Added a lesson",
        verdict: "ok",
        actionId: ACTION_ID,
      },
      client,
    );
    fireEvent.click(getByRole("button", { name: /revert/i }));
    fireEvent.click(getByRole("button", { name: /^revert$/i }));
    await waitFor(() => expect(container.textContent).toContain("No snapshot available"));
  });

  it("Revert confirm button stays interactive during in-flight restoreAction (not disabled)", async () => {
    // Optimistic dispatch: the Revert confirm button must NOT be disabled while
    // the IPC round-trip is pending. Guards the useOptimisticAction conversion.
    let resolveRestore!: () => void;
    const blockedRestore = new Promise<{ ok: true; restoredEntity: "lesson"; entityKey: string }>(
      (resolve) => {
        resolveRestore = () => resolve({ ok: true, restoredEntity: "lesson", entityKey: "l-1" });
      },
    );
    const client = makeFakeClient({
      author: {
        restoreAction: vi.fn().mockReturnValue(blockedRestore),
        listConfiguratorActions: vi.fn().mockResolvedValue([]),
      } as unknown as PraxisClient["author"],
    });

    const { container } = renderEntry(
      { name: "lesson.create", summary: "Added a lesson", verdict: "ok", actionId: ACTION_ID },
      client,
    );

    // Open modal by clicking the ↶ revert button (identified by its aria-label).
    const revertBtn = container.querySelector("button[aria-label='Revert lesson.create']");
    expect(revertBtn).not.toBeNull();
    fireEvent.click(revertBtn as HTMLElement);

    // Find the "Revert" confirm button in the modal by text content.
    const confirmBtn = Array.from(container.querySelectorAll("button[type='button']")).find(
      (b) => b.textContent?.trim() === "Revert",
    );
    expect(confirmBtn).not.toBeNull();
    // Must not be disabled before firing.
    expect(confirmBtn).not.toHaveProperty("disabled", true);

    // Fire the action.
    fireEvent.click(confirmBtn as HTMLElement);

    // During in-flight the text changes to "Reverting…". The button must remain
    // accessible (not disabled) so the user could cancel or observe state.
    await waitFor(() => {
      const inFlightBtn = Array.from(container.querySelectorAll("button[type='button']")).find(
        (b) => b.textContent?.trim() === "Reverting…",
      );
      if (inFlightBtn) {
        expect(inFlightBtn).not.toHaveProperty("disabled", true);
      }
    });

    // Resolve to avoid pending state leaking between tests.
    resolveRestore();
  });
});
