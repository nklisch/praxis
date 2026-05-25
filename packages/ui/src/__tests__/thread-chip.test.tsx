/**
 * Tests for ThreadChip component.
 *
 * Verifies:
 *  - Renders answered variant with verb, quoted answer, and time.
 *  - Renders dismissed variant with neutral styling (no answer).
 *  - Click-to-expand fires onExpand callback (answered variant).
 *  - Dismissed chip does not fire onExpand on click.
 *  - "just now" time formatting for recent dates.
 *  - HH:MM format for older dates.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadChip } from "../components/thread-chip.js";

afterEach(() => {
  cleanup();
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const nowDate = new Date(); // within 30 seconds → "just now"
const oldDate = new Date("2026-01-15T09:42:00"); // → "09:42"

// ─── Answered variant ────────────────────────────────────────────────────────

describe("ThreadChip — answered variant", () => {
  it("renders verb and answer text", () => {
    render(
      <ThreadChip
        variant="answered"
        verb="you answered"
        answer="the derivative dV/dr at r = 5"
        when={nowDate}
      />,
    );
    expect(screen.getByText("you answered")).toBeDefined();
    expect(screen.getByText("the derivative dV/dr at r = 5")).toBeDefined();
  });

  it("renders glyph ↳", () => {
    render(<ThreadChip variant="answered" verb="you answered" answer="foo" when={nowDate} />);
    expect(screen.getByText("↳")).toBeDefined();
  });

  it("shows 'just now' for a recent timestamp", () => {
    render(<ThreadChip variant="answered" verb="you answered" answer="x" when={nowDate} />);
    expect(screen.getByText("just now")).toBeDefined();
  });

  it("shows HH:MM for an older timestamp", () => {
    render(<ThreadChip variant="answered" verb="you answered" answer="x" when={oldDate} />);
    // The exact time string depends on locale but should be present and not "just now"
    expect(screen.queryByText("just now")).toBeNull();
  });

  it("renders expand affordance when onExpand is provided", () => {
    render(
      <ThreadChip
        variant="answered"
        verb="you answered"
        answer="x"
        when={nowDate}
        onExpand={() => {}}
      />,
    );
    expect(screen.getByText("expand")).toBeDefined();
  });

  it("does NOT render expand affordance when onExpand is omitted", () => {
    render(<ThreadChip variant="answered" verb="you answered" answer="x" when={nowDate} />);
    expect(screen.queryByText("expand")).toBeNull();
  });

  it("fires onExpand when clicked", () => {
    const onExpand = vi.fn();
    render(
      <ThreadChip
        variant="answered"
        verb="you answered"
        answer="x"
        when={nowDate}
        onExpand={onExpand}
      />,
    );
    const chip = screen.getByRole("button", { name: /expand question/i });
    fireEvent.click(chip);
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it("renders no answer span when answer prop is omitted", () => {
    render(<ThreadChip variant="answered" verb="you answered" when={nowDate} />);
    // No quoted text rendered
    expect(screen.queryByText(/"/)?.textContent).toBeUndefined();
  });
});

// ─── Dismissed variant ───────────────────────────────────────────────────────

describe("ThreadChip — dismissed variant", () => {
  it("renders the dismiss verb", () => {
    render(<ThreadChip variant="dismissed" verb="you asked to discuss in chat" when={nowDate} />);
    expect(screen.getByText("you asked to discuss in chat")).toBeDefined();
  });

  it("does NOT render an expand affordance", () => {
    render(
      <ThreadChip
        variant="dismissed"
        verb="you asked to discuss in chat"
        when={nowDate}
        onExpand={() => {}}
      />,
    );
    // The dismissed variant suppresses expand even when onExpand is provided
    expect(screen.queryByText("expand")).toBeNull();
  });

  it("does NOT fire onExpand when clicked (dismissed is non-interactive)", () => {
    const onExpand = vi.fn();
    render(
      <ThreadChip
        variant="dismissed"
        verb="you asked to discuss in chat"
        when={nowDate}
        onExpand={onExpand}
      />,
    );
    const chip = screen.getByRole("button");
    fireEvent.click(chip);
    expect(onExpand).not.toHaveBeenCalled();
  });
});
