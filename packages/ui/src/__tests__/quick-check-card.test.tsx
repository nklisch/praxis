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

  it("retires to a collapsed summary row after submission", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={onResolve} />);

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]!); // select "3" (incorrect — correct is index 1)
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalled();
    });

    // After submit, the form controls are gone — the submit button and the
    // input radios are no longer in the document.
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);

    // The collapsed summary <button> with aria-expanded is rendered.
    const summary = screen.getByRole("button", { expanded: false });
    expect(summary).toBeDefined();
    // The stem (prompt) is still visible.
    expect(summary.textContent).toContain("Quick: what is 2+2?");
  });

  it("shows ✓ badge for correct single-choice answer", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={onResolve} />);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1]!); // correct
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalled());
    expect(screen.queryByLabelText("correct")).not.toBeNull();
    expect(screen.queryByLabelText("incorrect")).toBeNull();
  });

  it("shows ✗ badge for incorrect single-choice answer", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={onResolve} />);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]!); // incorrect
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalled());
    expect(screen.queryByLabelText("incorrect")).not.toBeNull();
    expect(screen.queryByLabelText("correct")).toBeNull();
  });

  it("renders no badge for ungraded item (correctOptionIndex < 0)", async () => {
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
    expect(screen.queryByLabelText("correct")).toBeNull();
    expect(screen.queryByLabelText("incorrect")).toBeNull();
  });

  it("clicking the collapsed summary toggles the read-only details", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={onResolve} />);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1]!);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalled());

    const summary = screen.getByRole("button", { expanded: false });
    fireEvent.click(summary);
    // After expanding, the button reports aria-expanded=true.
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
