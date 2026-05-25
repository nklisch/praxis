/**
 * Tests for QuickCheckCard component.
 */
import type { AssignmentItem } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickCheckCard } from "../components/quick-check-card.js";

afterEach(() => {
  cleanup();
});

const singleChoiceItem: AssignmentItem = {
  kind: "single-choice",
  id: "qc1",
  prompt: "Quick: what is 2+2?",
  options: ["3", "4", "5"],
  correctOptionIndex: 1,
};

const shortAnswerItem: AssignmentItem = {
  kind: "short-answer",
  id: "qc2",
  prompt: "Quick: spell 'hello'",
  acceptedAnswers: ["hello"],
};

describe("QuickCheckCard", () => {
  it("renders the 'tutor asked' tag", () => {
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={async () => {}} />);
    expect(screen.getByText("tutor asked")).toBeDefined();
  });

  it("renders the item prompt", () => {
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={async () => {}} />);
    expect(screen.getByText("Quick: what is 2+2?")).toBeDefined();
  });

  it("renders a submit button", () => {
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={async () => {}} />);
    expect(screen.getByRole("button", { name: /submit/i })).toBeDefined();
  });

  it("calls onResolve with single-choice answer when submitted", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={onResolve} />);

    // Select option "4" (index 1)
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1]!);

    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith("c1", {
        kind: "single-choice",
        selectedIndex: 1,
      });
    });
  });

  /**
   * Updated for dismiss-on-submit (story-fix-user-question-no-dismiss-on-submit):
   * After submit, the card immediately transitions to a <ThreadChip> summary —
   * the full card is replaced so the chat thread is not occluded through the
   * tutor's thinking round-trip.
   */
  it("transitions to a ThreadChip summary after submission", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={onResolve} />);

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]!); // select "3" (incorrect — correct is index 1)
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      // The full card is gone — no radios and no submit button.
      expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
      expect(screen.queryAllByRole("radio")).toHaveLength(0);
    });

    // A ThreadChip is rendered — the chip is a button with "Expand question" label.
    const chip = screen.getByRole("button", { name: /expand question/i });
    expect(chip).toBeDefined();
    // The chip displays the answer summary (the selected option label or similar).
    expect(chip.textContent).toMatch(/you answered/i);
  });

  /**
   * Updated for dismiss-on-submit (story-fix-user-question-no-dismiss-on-submit):
   * After submit the card shows a ThreadChip; clicking the chip expands back to
   * a read-only card view where the correct/incorrect badge is visible.
   */
  it("shows ✓ badge for correct single-choice answer after expanding chip", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={onResolve} />);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1]!); // correct
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalled());

    // Wait for ThreadChip
    const chip = await screen.findByRole("button", { name: /expand question/i });
    fireEvent.click(chip);

    // Now in the expanded read-only card, the correct badge is visible.
    expect(screen.queryByLabelText("correct")).not.toBeNull();
    expect(screen.queryByLabelText("incorrect")).toBeNull();
  });

  it("shows ✗ badge for incorrect single-choice answer after expanding chip", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={onResolve} />);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]!); // incorrect
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalled());

    const chip = await screen.findByRole("button", { name: /expand question/i });
    fireEvent.click(chip);

    expect(screen.queryByLabelText("incorrect")).not.toBeNull();
    expect(screen.queryByLabelText("correct")).toBeNull();
  });

  it("renders no badge for ungraded item (correctOptionIndex < 0) after expanding chip", async () => {
    const formative: AssignmentItem = {
      kind: "single-choice",
      id: "qc-form",
      prompt: "How are you?",
      options: ["fine", "great"],
      correctOptionIndex: -1,
    };
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c1" item={formative} onResolve={onResolve} />);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]!);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalled());

    const chip = await screen.findByRole("button", { name: /expand question/i });
    fireEvent.click(chip);

    expect(screen.queryByLabelText("correct")).toBeNull();
    expect(screen.queryByLabelText("incorrect")).toBeNull();
  });

  /**
   * Updated for dismiss-on-submit: clicking the ThreadChip expands back to a
   * read-only card view (aria-expanded=true on the collapsedSummary button).
   */
  it("clicking the ThreadChip expands back to read-only details", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={onResolve} />);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1]!);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalled());

    // Click the ThreadChip to expand
    const chip = await screen.findByRole("button", { name: /expand question/i });
    fireEvent.click(chip);

    // Now in expanded view — the collapsedSummary button has aria-expanded=true
    expect(screen.getByRole("button", { expanded: true })).toBeDefined();
  });

  it("does not call onResolve if no option selected", () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("calls onResolve with short-answer text", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c2" item={shortAnswerItem} onResolve={onResolve} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith("c2", {
        kind: "short-answer",
        text: "hello",
      });
    });
  });
});
