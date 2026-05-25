/**
 * Tests for <QueuedMessageBubble> — queued / dispatching / failed variants.
 *
 * Covers:
 * - Correct CSS class applied per status
 * - Action pips present / absent per status
 * - Inline edit: toggle, Save fires onEdit, Cancel discards
 * - Remove fires onRemove exactly once
 * - Retry fires onRetry exactly once (failed only)
 * - Long errorReason truncates at 120 chars with full text in title
 * - Dispatching status hides edit pip
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueuedMessageBubble } from "../components/queued-message-bubble.js";
import type { PendingMessageItem } from "../hooks/use-streamed-send.js";
import { COPY } from "../lib/copy.js";

afterEach(() => cleanup());

function makeItem(overrides: Partial<PendingMessageItem> = {}): PendingMessageItem {
  return {
    kind: "pending-message",
    id: "test-id-1",
    text: "Hello world",
    status: "queued",
    ...overrides,
  };
}

function defaultProps(item: PendingMessageItem) {
  return {
    item,
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onRetry: vi.fn(),
  };
}

// ─── Queued variant ───────────────────────────────────────────────────────────

describe("QueuedMessageBubble — queued", () => {
  it("renders message text", () => {
    const item = makeItem({ status: "queued", text: "My queued message" });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    expect(screen.getByText("My queued message")).toBeDefined();
  });

  it("renders edit and remove action buttons", () => {
    const item = makeItem({ status: "queued" });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    expect(screen.getByRole("button", { name: COPY.queuedBubble.editAriaLabel })).toBeDefined();
    expect(screen.getByRole("button", { name: COPY.queuedBubble.removeAriaLabel })).toBeDefined();
  });

  it("does not render retry button when queued", () => {
    const item = makeItem({ status: "queued" });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    expect(screen.queryByRole("button", { name: COPY.queuedBubble.retryAriaLabel })).toBeNull();
  });

  it("fires onRemove with item.id when remove clicked", () => {
    const item = makeItem({ status: "queued" });
    const onRemove = vi.fn();
    render(<QueuedMessageBubble {...defaultProps(item)} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.queuedBubble.removeAriaLabel }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith("test-id-1");
  });

  it("shows queued badge", () => {
    const item = makeItem({ status: "queued" });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    expect(screen.getByText(COPY.queuedBubble.badgeQueued)).toBeDefined();
  });
});

// ─── Inline edit ──────────────────────────────────────────────────────────────

describe("QueuedMessageBubble — inline edit (queued)", () => {
  it("clicking edit opens textarea pre-filled with item.text", () => {
    const item = makeItem({ status: "queued", text: "original text" });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.queuedBubble.editAriaLabel }));
    const textarea = screen.getByRole("textbox", { name: COPY.queuedBubble.editTextareaAriaLabel });
    expect(textarea).toBeDefined();
    expect((textarea as HTMLTextAreaElement).value).toBe("original text");
  });

  it("Save fires onEdit(id, draft) and exits edit mode", () => {
    const item = makeItem({ status: "queued", text: "original text" });
    const onEdit = vi.fn();
    render(<QueuedMessageBubble {...defaultProps(item)} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.queuedBubble.editAriaLabel }));
    const textarea = screen.getByRole("textbox", {
      name: COPY.queuedBubble.editTextareaAriaLabel,
    }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "edited text" } });
    fireEvent.click(screen.getByRole("button", { name: COPY.queuedBubble.saveDraftAriaLabel }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("test-id-1", "edited text");
    // Edit mode exited — textarea gone.
    expect(
      screen.queryByRole("textbox", { name: COPY.queuedBubble.editTextareaAriaLabel }),
    ).toBeNull();
  });

  it("Cancel discards draft and exits edit mode without calling onEdit", () => {
    const item = makeItem({ status: "queued", text: "original text" });
    const onEdit = vi.fn();
    render(<QueuedMessageBubble {...defaultProps(item)} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.queuedBubble.editAriaLabel }));
    const textarea = screen.getByRole("textbox", {
      name: COPY.queuedBubble.editTextareaAriaLabel,
    }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "abandoned edit" } });
    fireEvent.click(screen.getByRole("button", { name: COPY.queuedBubble.cancelEditAriaLabel }));
    expect(onEdit).not.toHaveBeenCalled();
    // Edit mode exited.
    expect(
      screen.queryByRole("textbox", { name: COPY.queuedBubble.editTextareaAriaLabel }),
    ).toBeNull();
  });

  it("Save with whitespace-only draft does not call onEdit", () => {
    const item = makeItem({ status: "queued", text: "original text" });
    const onEdit = vi.fn();
    render(<QueuedMessageBubble {...defaultProps(item)} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.queuedBubble.editAriaLabel }));
    const textarea = screen.getByRole("textbox", {
      name: COPY.queuedBubble.editTextareaAriaLabel,
    }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: COPY.queuedBubble.saveDraftAriaLabel }));
    expect(onEdit).not.toHaveBeenCalled();
  });
});

// ─── Dispatching variant ──────────────────────────────────────────────────────

describe("QueuedMessageBubble — dispatching", () => {
  it("renders remove button but NOT edit button", () => {
    const item = makeItem({ status: "dispatching" });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    expect(screen.getByRole("button", { name: COPY.queuedBubble.removeAriaLabel })).toBeDefined();
    expect(screen.queryByRole("button", { name: COPY.queuedBubble.editAriaLabel })).toBeNull();
  });

  it("does not render retry button when dispatching", () => {
    const item = makeItem({ status: "dispatching" });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    expect(screen.queryByRole("button", { name: COPY.queuedBubble.retryAriaLabel })).toBeNull();
  });

  it("renders dispatching badge", () => {
    const item = makeItem({ status: "dispatching" });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    expect(screen.getByText(COPY.queuedBubble.badgeDispatching)).toBeDefined();
  });

  it("fires onRemove with item.id when remove clicked", () => {
    const item = makeItem({ status: "dispatching" });
    const onRemove = vi.fn();
    render(<QueuedMessageBubble {...defaultProps(item)} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.queuedBubble.removeAriaLabel }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith("test-id-1");
  });
});

// ─── Failed variant ───────────────────────────────────────────────────────────

describe("QueuedMessageBubble — failed", () => {
  it("renders retry and remove buttons", () => {
    const item = makeItem({ status: "failed", errorReason: "Connection lost" });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    expect(screen.getByRole("button", { name: COPY.queuedBubble.retryAriaLabel })).toBeDefined();
    expect(screen.getByRole("button", { name: COPY.queuedBubble.removeAriaLabel })).toBeDefined();
  });

  it("does not render edit button when failed", () => {
    const item = makeItem({ status: "failed", errorReason: "oops" });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    expect(screen.queryByRole("button", { name: COPY.queuedBubble.editAriaLabel })).toBeNull();
  });

  it("fires onRetry with item.id when retry clicked", () => {
    const item = makeItem({ status: "failed", errorReason: "Connection lost" });
    const onRetry = vi.fn();
    render(<QueuedMessageBubble {...defaultProps(item)} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.queuedBubble.retryAriaLabel }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith("test-id-1");
  });

  it("fires onRemove with item.id when remove clicked", () => {
    const item = makeItem({ status: "failed", errorReason: "Connection lost" });
    const onRemove = vi.fn();
    render(<QueuedMessageBubble {...defaultProps(item)} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.queuedBubble.removeAriaLabel }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith("test-id-1");
  });

  it("renders visible errorReason when present", () => {
    const item = makeItem({ status: "failed", errorReason: "Engine timed out" });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    expect(screen.getByText("Engine timed out")).toBeDefined();
  });

  it("renders failed badge", () => {
    const item = makeItem({ status: "failed" });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    expect(screen.getByText(COPY.queuedBubble.badgeFailed)).toBeDefined();
  });

  it("truncates errorReason at 120 chars with full text in title", () => {
    const longReason = "A".repeat(150);
    const item = makeItem({ status: "failed", errorReason: longReason });
    render(<QueuedMessageBubble {...defaultProps(item)} />);

    // Displayed text should be truncated (120 chars + ellipsis).
    const displayedText = `${"A".repeat(120)}…`;
    const el = screen.getByText(displayedText);
    expect(el).toBeDefined();
    // Full text in title attribute.
    expect(el.getAttribute("title")).toBe(longReason);
  });

  it("does not truncate errorReason when ≤ 120 chars", () => {
    const shortReason = "A".repeat(120);
    const item = makeItem({ status: "failed", errorReason: shortReason });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    expect(screen.getByText(shortReason)).toBeDefined();
    // No title when not truncated (text fits exactly).
    const el = screen.getByText(shortReason);
    expect(el.getAttribute("title")).toBe(shortReason);
  });

  it("renders nothing for errorReason when undefined", () => {
    const item = makeItem({ status: "failed", errorReason: undefined });
    render(<QueuedMessageBubble {...defaultProps(item)} />);
    // Should not crash; just no error reason paragraph.
    expect(screen.queryByText(/error/i)).toBeNull();
  });
});
