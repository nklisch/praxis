/**
 * Tests for StructuredQuestionCard component.
 */
import type { StructuredQuestionItem } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StructuredQuestionCard } from "../components/structured-question-card.js";

afterEach(() => {
  cleanup();
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const singleSelectItem: StructuredQuestionItem = {
  kind: "structured-question",
  id: "sq1",
  questions: [
    {
      header: "Confidence",
      prompt: "How confident are you in this topic?",
      multiSelect: false,
      options: [
        { label: "Very confident" },
        { label: "Somewhat confident" },
        { label: "Not confident" },
      ],
    },
  ],
};

const multiSelectItem: StructuredQuestionItem = {
  kind: "structured-question",
  id: "sq2",
  questions: [
    {
      header: "Topics",
      prompt: "Which topics do you want to revisit?",
      multiSelect: true,
      options: [
        { label: "Integration", description: "Definite and indefinite integrals" },
        { label: "Derivatives", description: "Chain rule, product rule" },
        { label: "Limits" },
      ],
    },
  ],
};

const mixedItem: StructuredQuestionItem = {
  kind: "structured-question",
  id: "sq3",
  questions: [
    {
      header: "Difficulty",
      prompt: "How difficult was this?",
      multiSelect: false,
      options: [{ label: "Easy" }, { label: "Medium" }, { label: "Hard" }],
    },
    {
      header: "Topics",
      prompt: "Which areas need work?",
      multiSelect: true,
      options: [{ label: "Theory" }, { label: "Practice" }],
    },
  ],
};

const fourQuestionItem: StructuredQuestionItem = {
  kind: "structured-question",
  id: "sq4",
  questions: [
    {
      header: "Q1",
      prompt: "Question one?",
      multiSelect: false,
      options: [{ label: "Yes" }, { label: "No" }],
    },
    {
      header: "Q2",
      prompt: "Question two?",
      multiSelect: false,
      options: [{ label: "A" }, { label: "B" }],
    },
    {
      header: "Q3",
      prompt: "Question three?",
      multiSelect: true,
      options: [{ label: "X" }, { label: "Y" }],
    },
    {
      header: "Q4",
      prompt: "Question four?",
      multiSelect: false,
      options: [{ label: "True" }, { label: "False" }],
    },
  ],
};

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("StructuredQuestionCard — rendering", () => {
  it("renders 'tutor asked' tag", () => {
    render(
      <StructuredQuestionCard callId="c1" item={singleSelectItem} onResolve={async () => {}} />,
    );
    expect(screen.getByText("tutor asked")).toBeDefined();
  });

  it("renders the question header chip and prompt", () => {
    render(
      <StructuredQuestionCard callId="c1" item={singleSelectItem} onResolve={async () => {}} />,
    );
    expect(screen.getByText("Confidence")).toBeDefined();
    expect(screen.getByText("How confident are you in this topic?")).toBeDefined();
  });

  it("renders option labels", () => {
    render(
      <StructuredQuestionCard callId="c1" item={singleSelectItem} onResolve={async () => {}} />,
    );
    expect(screen.getByText("Very confident")).toBeDefined();
    expect(screen.getByText("Somewhat confident")).toBeDefined();
    expect(screen.getByText("Not confident")).toBeDefined();
  });

  it("renders option descriptions when present", () => {
    render(
      <StructuredQuestionCard callId="c2" item={multiSelectItem} onResolve={async () => {}} />,
    );
    expect(screen.getByText("Definite and indefinite integrals")).toBeDefined();
    expect(screen.getByText("Chain rule, product rule")).toBeDefined();
  });

  it("renders without crashing for 4 questions", () => {
    render(
      <StructuredQuestionCard callId="c4" item={fourQuestionItem} onResolve={async () => {}} />,
    );
    expect(screen.getByText("Question one?")).toBeDefined();
    expect(screen.getByText("Question four?")).toBeDefined();
  });

  it("renders a Submit button", () => {
    render(
      <StructuredQuestionCard callId="c1" item={singleSelectItem} onResolve={async () => {}} />,
    );
    expect(screen.getByRole("button", { name: /submit/i })).toBeDefined();
  });
});

// ─── aria-pressed ─────────────────────────────────────────────────────────────

describe("StructuredQuestionCard — aria-pressed", () => {
  it("all options start with aria-pressed=false", () => {
    render(
      <StructuredQuestionCard callId="c1" item={singleSelectItem} onResolve={async () => {}} />,
    );
    // Filter to only buttons that actually carry aria-pressed (the option buttons)
    const optionButtons = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-pressed"));
    expect(optionButtons.length).toBeGreaterThan(0);
    for (const btn of optionButtons) {
      expect(btn.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("selected option has aria-pressed=true", () => {
    render(
      <StructuredQuestionCard callId="c1" item={singleSelectItem} onResolve={async () => {}} />,
    );
    const veryConfident = screen.getByText("Very confident").closest("button")!;
    fireEvent.click(veryConfident);
    expect(veryConfident.getAttribute("aria-pressed")).toBe("true");
  });
});

// ─── Single-select behaviour ──────────────────────────────────────────────────

describe("StructuredQuestionCard — single-select", () => {
  it("clicking a new option deselects the previous", () => {
    render(
      <StructuredQuestionCard callId="c1" item={singleSelectItem} onResolve={async () => {}} />,
    );
    const optA = screen.getByText("Very confident").closest("button")!;
    const optB = screen.getByText("Somewhat confident").closest("button")!;

    fireEvent.click(optA);
    expect(optA.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(optB);
    expect(optA.getAttribute("aria-pressed")).toBe("false");
    expect(optB.getAttribute("aria-pressed")).toBe("true");
  });
});

// ─── Multi-select behaviour ───────────────────────────────────────────────────

describe("StructuredQuestionCard — multi-select", () => {
  it("multiple options can be selected simultaneously", () => {
    render(
      <StructuredQuestionCard callId="c2" item={multiSelectItem} onResolve={async () => {}} />,
    );
    const integration = screen.getByText("Integration").closest("button")!;
    const derivatives = screen.getByText("Derivatives").closest("button")!;

    fireEvent.click(integration);
    fireEvent.click(derivatives);

    expect(integration.getAttribute("aria-pressed")).toBe("true");
    expect(derivatives.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking a selected option deselects it", () => {
    render(
      <StructuredQuestionCard callId="c2" item={multiSelectItem} onResolve={async () => {}} />,
    );
    const integration = screen.getByText("Integration").closest("button")!;
    const derivatives = screen.getByText("Derivatives").closest("button")!;

    fireEvent.click(integration);
    fireEvent.click(derivatives);

    // Deselect integration
    fireEvent.click(integration);
    expect(integration.getAttribute("aria-pressed")).toBe("false");
    expect(derivatives.getAttribute("aria-pressed")).toBe("true");
  });
});

// ─── Submit gating ────────────────────────────────────────────────────────────

describe("StructuredQuestionCard — submit gating", () => {
  it("Submit button is disabled before any selection", () => {
    render(
      <StructuredQuestionCard callId="c1" item={singleSelectItem} onResolve={async () => {}} />,
    );
    const submitBtn = screen.getByRole("button", { name: /submit/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it("Submit button enables after single-select question has one selection", () => {
    render(
      <StructuredQuestionCard callId="c1" item={singleSelectItem} onResolve={async () => {}} />,
    );
    const submitBtn = screen.getByRole("button", { name: /submit/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    fireEvent.click(screen.getByText("Very confident").closest("button")!);
    expect(submitBtn.disabled).toBe(false);
  });

  it("Submit stays enabled when multi-select question has zero selections", () => {
    // mixedItem has one single-select (index 0) and one multi-select (index 1).
    // Selecting one option for the single-select should enable Submit even
    // though the multi-select has zero selections.
    render(<StructuredQuestionCard callId="c3" item={mixedItem} onResolve={async () => {}} />);
    const submitBtn = screen.getByRole("button", { name: /submit/i }) as HTMLButtonElement;

    fireEvent.click(screen.getByText("Easy").closest("button")!);
    expect(submitBtn.disabled).toBe(false);
  });
});

// ─── onResolve payload ────────────────────────────────────────────────────────

describe("StructuredQuestionCard — onResolve", () => {
  it("calls onResolve with structured-question answer after submit", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<StructuredQuestionCard callId="c1" item={singleSelectItem} onResolve={onResolve} />);

    fireEvent.click(screen.getByText("Somewhat confident").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith("c1", {
        kind: "structured-question",
        answers: [{ questionIndex: 0, selectedIndices: [1] }],
      });
    });
  });

  it("selectedIndices are sorted ascending for multi-select", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<StructuredQuestionCard callId="c2" item={multiSelectItem} onResolve={onResolve} />);

    // Select index 2 then index 0 (out of order)
    fireEvent.click(screen.getByText("Limits").closest("button")!);
    fireEvent.click(screen.getByText("Integration").closest("button")!);

    // Multi-select: Submit is always enabled (zero selections allowed), so it's enabled here
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith("c2", {
        kind: "structured-question",
        answers: [{ questionIndex: 0, selectedIndices: [0, 2] }],
      });
    });
  });

  it("sends correct questionIndex mapping for mixed multi-question item", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<StructuredQuestionCard callId="c3" item={mixedItem} onResolve={onResolve} />);

    // Single-select (question 0): pick "Medium" (index 1)
    fireEvent.click(screen.getByText("Medium").closest("button")!);
    // Multi-select (question 1): pick "Theory" (index 0) and "Practice" (index 1)
    fireEvent.click(screen.getByText("Theory").closest("button")!);
    fireEvent.click(screen.getByText("Practice").closest("button")!);

    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith("c3", {
        kind: "structured-question",
        answers: [
          { questionIndex: 0, selectedIndices: [1] },
          { questionIndex: 1, selectedIndices: [0, 1] },
        ],
      });
    });
  });
});

// ─── Post-submit state ────────────────────────────────────────────────────────

describe("StructuredQuestionCard — post-submit state", () => {
  /**
   * Updated for dismiss-on-submit (story-fix-user-question-no-dismiss-on-submit):
   * On submit the card immediately transitions to a <ThreadChip> summary — the
   * full card is replaced so the chat thread below is not occluded through the
   * tutor's thinking round-trip.
   */
  it("transitions to a ThreadChip on submit (dismiss-on-submit behaviour)", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<StructuredQuestionCard callId="c1" item={singleSelectItem} onResolve={onResolve} />);

    fireEvent.click(screen.getByText("Very confident").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    // onResolve fires in background — card transitions immediately without waiting
    // for the resolve to complete.
    await waitFor(() => {
      // The full card is gone — no more fieldsets or "Submit" button.
      expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
      expect(document.querySelectorAll("fieldset").length).toBe(0);
    });

    // A ThreadChip summary is now rendered.
    const chip = screen.getByRole("button", { name: /expand question/i });
    expect(chip).toBeDefined();
    // The chip verb and answer are visible. The verb is lowercase in the DOM
    // (text-transform uppercase is CSS-only; textContent is the raw text).
    expect(chip.textContent).toContain("you answered");
    expect(chip.textContent).toContain("Very confident");
  });

  it("ThreadChip click re-expands to read-only card view", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<StructuredQuestionCard callId="c1" item={singleSelectItem} onResolve={onResolve} />);

    fireEvent.click(screen.getByText("Very confident").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
    });

    // Click the chip to re-expand
    const chip = screen.getByRole("button", { name: /expand question/i });
    fireEvent.click(chip);

    // Card is now re-expanded in read-only mode — question text is visible
    expect(screen.getByText("How confident are you in this topic?")).toBeDefined();
    // The collapse button is visible
    expect(screen.getByRole("button", { name: /collapse/i })).toBeDefined();
  });
});
