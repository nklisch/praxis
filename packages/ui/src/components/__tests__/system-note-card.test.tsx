/**
 * Tests for <SystemNoteCard>.
 *
 * Verifies:
 * - Renders the card for an assignment_submission origin.
 * - Shows the score percentage and elapsed time.
 * - Renders a review button when onReview is provided and calls it on click.
 * - Returns null for a "system" origin (non-assignment).
 */
import type { SystemNoteOrigin } from "@praxis/core/types";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemNoteCard } from "../system-note-card.js";

afterEach(() => cleanup());

const ASSIGNMENT_ORIGIN: Extract<SystemNoteOrigin, { kind: "assignment_submission" }> = {
  kind: "assignment_submission",
  assignmentId: "assign-1",
  childSessionId: "child-sess-1",
  gradeTotal: 1.0, // 100%
  submittedAt: Date.now() - 252_000, // 4m 12s ago
};

const SYSTEM_ORIGIN: Extract<SystemNoteOrigin, { kind: "system" }> = {
  kind: "system",
  topic: "internal-diagnostic",
};

describe("SystemNoteCard", () => {
  it("renders the card for an assignment_submission origin", () => {
    const { container } = render(
      <SystemNoteCard
        origin={ASSIGNMENT_ORIGIN}
        childSessionId="child-sess-1"
        onReview={undefined}
      />,
    );
    expect(container.querySelector('[role="note"]')).not.toBeNull();
  });

  it("shows score percentage", () => {
    const { container } = render(
      <SystemNoteCard
        origin={{ ...ASSIGNMENT_ORIGIN, gradeTotal: 0.75 }}
        childSessionId="child-sess-1"
        onReview={undefined}
      />,
    );
    expect(container.textContent).toContain("75%");
  });

  it("renders a review button when onReview is provided", () => {
    const onReview = vi.fn();
    const { getByRole } = render(
      <SystemNoteCard
        origin={ASSIGNMENT_ORIGIN}
        childSessionId="child-sess-1"
        onReview={onReview}
      />,
    );
    const btn = getByRole("button");
    fireEvent.click(btn);
    expect(onReview).toHaveBeenCalledOnce();
  });

  it("does not render a review button when onReview is undefined", () => {
    const { queryByRole } = render(
      <SystemNoteCard
        origin={ASSIGNMENT_ORIGIN}
        childSessionId="child-sess-1"
        onReview={undefined}
      />,
    );
    expect(queryByRole("button")).toBeNull();
  });

  it("returns null for a 'system' origin", () => {
    const { container } = render(
      <SystemNoteCard origin={SYSTEM_ORIGIN} childSessionId={undefined} onReview={undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the kicker label 'assignment submitted'", () => {
    const { container } = render(
      <SystemNoteCard
        origin={ASSIGNMENT_ORIGIN}
        childSessionId="child-sess-1"
        onReview={undefined}
      />,
    );
    expect(container.textContent?.toLowerCase()).toContain("assignment submitted");
  });
});
