/**
 * Tests for <ActionPip /> — state-driven indicator component.
 *
 * Verifies:
 * - idle: renders as span (presentational)
 * - pending / success / retrying: renders as span (presentational, no button role)
 * - failed: renders as <button> (accessible, clickable)
 * - custom aria-label respected in failed state
 * - extra className merged
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "../../hooks/use-optimistic-action.js";
import { ActionPip } from "../action-pip.js";

afterEach(() => cleanup());

describe("ActionPip", () => {
  it("renders as a span in idle state — no button role", () => {
    render(<ActionPip state="idle" />);
    const span = document.querySelector("span");
    expect(span).not.toBeNull();
    expect(document.querySelector("button")).toBeNull();
    expect(document.querySelector("[role=button]")).toBeNull();
  });

  it("renders as span in pending, success, retrying states — no button role", () => {
    for (const state of ["pending", "success", "retrying"] as ActionState[]) {
      const { unmount } = render(<ActionPip state={state} />);
      expect(document.querySelector("button")).toBeNull();
      expect(document.querySelector("[role=button]")).toBeNull();
      expect(document.querySelector("span")).not.toBeNull();
      unmount();
    }
  });

  it("renders as <button> in failed state", () => {
    render(<ActionPip state="failed" />);
    const btn = screen.getByRole("button");
    expect(btn).toBeTruthy();
    expect(btn.tagName.toLowerCase()).toBe("button");
    // Should not have a sibling span in failed state
    expect(document.querySelector("span")).toBeNull();
  });

  it("failed button has an accessible label", () => {
    render(<ActionPip state="failed" />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Action status: failed");
  });

  it("uses a custom aria-label in failed state", () => {
    render(<ActionPip state="failed" aria-label="Save failed — click to retry" />);
    expect(screen.getByLabelText("Save failed — click to retry")).toBeTruthy();
  });

  it("calls onClick when the failed button is clicked", () => {
    const onClick = vi.fn();
    render(<ActionPip state="failed" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does NOT call onClick when span is clicked in pending state", () => {
    const onClick = vi.fn();
    render(<ActionPip state="pending" onClick={onClick} />);
    const span = document.querySelector("span");
    if (span) fireEvent.click(span);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("merges extra className onto the idle span", () => {
    render(<ActionPip state="idle" className="custom-class" />);
    const span = document.querySelector("span");
    expect(span?.className).toContain("custom-class");
  });

  it("merges extra className onto the failed button", () => {
    render(<ActionPip state="failed" className="custom-class" />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("custom-class");
  });
});
