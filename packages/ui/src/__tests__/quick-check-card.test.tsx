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

  it("locks inputs after submission", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<QuickCheckCard callId="c1" item={singleChoiceItem} onResolve={onResolve} />);

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]!);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalled();
    });

    // After submit, shows "submitted" label instead of submit button
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
    expect(screen.getByText(/submitted/i)).toBeDefined();

    // Radios are disabled
    const radiosAfter = screen.getAllByRole("radio") as HTMLInputElement[];
    for (const r of radiosAfter) {
      expect(r.disabled).toBe(true);
    }
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
