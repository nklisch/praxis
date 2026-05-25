/**
 * Tests for <ActionCard /> — optimistic-dispatch card shell.
 *
 * Verifies:
 * - Renders label, title, action button
 * - Calls trigger() on button click (never disables the button)
 * - ActionPip shows/hides based on hook state
 * - FailurePopover shown when state is "failed", hidden otherwise
 * - retry() and dismiss() wired through popover actions
 * - Children rendered in body slot
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionState, UseOptimisticActionResult } from "../../hooks/use-optimistic-action.js";
import { ActionCard } from "../action-card.js";

afterEach(() => cleanup());

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAction(
  state: ActionState = "idle",
  overrides?: Partial<UseOptimisticActionResult<undefined>>,
): UseOptimisticActionResult<undefined> {
  return {
    state,
    errorReason: state === "failed" ? "something went wrong" : undefined,
    trigger: vi.fn(),
    retry: vi.fn(),
    dismiss: vi.fn(),
    externalSettle: vi.fn(),
    ...overrides,
  };
}

function renderCard(
  state: ActionState = "idle",
  overrides?: Partial<UseOptimisticActionResult<undefined>>,
) {
  const action = makeAction(state, overrides);
  render(
    <ActionCard
      label="Tutor suggestion"
      title="Save as flashcards"
      action={action}
      actionLabel="Save"
    />,
  );
  return action;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ActionCard", () => {
  it("renders label and title", () => {
    renderCard();
    expect(screen.getByText("Tutor suggestion")).toBeTruthy();
    expect(screen.getByText("Save as flashcards")).toBeTruthy();
  });

  it("renders the action button with correct label", () => {
    renderCard();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("button is never disabled regardless of state", () => {
    for (const state of ["idle", "pending", "success", "failed", "retrying"] as ActionState[]) {
      const { unmount } = render(
        <ActionCard label="L" title="T" action={makeAction(state)} actionLabel="Go" />,
      );
      const btn = screen.getByRole("button", { name: "Go" });
      expect(btn).not.toHaveProperty("disabled", true);
      expect(btn.getAttribute("disabled")).toBeNull();
      unmount();
    }
  });

  it("calls trigger() when the action button is clicked", () => {
    const action = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(action.trigger).toHaveBeenCalledOnce();
  });

  it("does NOT show FailurePopover when state is not failed", () => {
    for (const state of ["idle", "pending", "success", "retrying"] as ActionState[]) {
      const { unmount } = render(
        <ActionCard label="L" title="T" action={makeAction(state)} actionLabel="Go" />,
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      unmount();
    }
  });

  it("shows FailurePopover when state is failed", () => {
    renderCard("failed");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("calls retry() when the Retry button in the popover is clicked", () => {
    const action = renderCard("failed");
    // The popover has retry + dismiss buttons
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(action.retry).toHaveBeenCalledOnce();
  });

  it("calls dismiss() when the Dismiss button in the popover is clicked", () => {
    const action = renderCard("failed");
    const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(dismissBtn);
    expect(action.dismiss).toHaveBeenCalledOnce();
  });

  it("renders children in the body slot", () => {
    render(
      <ActionCard label="L" title="T" action={makeAction()} actionLabel="Go">
        <span>Extra content</span>
      </ActionCard>,
    );
    expect(screen.getByText("Extra content")).toBeTruthy();
  });

  it("uses actionAriaLabel for the button when provided", () => {
    render(
      <ActionCard
        label="L"
        title="T"
        action={makeAction()}
        actionLabel="Save"
        actionAriaLabel="Save these 5 items as flashcards"
      />,
    );
    expect(screen.getByRole("button", { name: "Save these 5 items as flashcards" })).toBeTruthy();
  });
});
