/**
 * Tests for InlineQuestionSet component.
 *
 * Verifies:
 *  - Renders tab strip with correct count of tabs.
 *  - Tab click fires onTabClick with correct index.
 *  - Answered tabs show ✓ status; active tab shows ●; unanswered shows ○.
 *  - Active question body is rendered (prompt and choices visible).
 *  - Submit button fires onSubmit with current question index and answer.
 *  - Clarify button fires onClarifyInChat with current question index.
 *  - Prev/next arrows navigate and are disabled at edges.
 *  - Free-form text propagates through onAnswer.
 *  - canSubmit: single-select requires 1 choice OR free-form text; multi-select always submittable.
 */
import type { StructuredQuestionItem } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuestionSetAnswer } from "../components/inline-question-set.js";
import { InlineQuestionSet } from "../components/inline-question-set.js";

afterEach(() => {
  cleanup();
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

type Question = StructuredQuestionItem["questions"][number];

const q1Single: Question = {
  header: "Q1",
  prompt: "What is 2+2?",
  multiSelect: false,
  options: [{ label: "3" }, { label: "4" }, { label: "5" }],
};

const q2Multi: Question = {
  header: "Q2",
  prompt: "Which apply?",
  multiSelect: true,
  options: [{ label: "Option A" }, { label: "Option B" }, { label: "Option C" }],
};

const q3Single: Question = {
  header: "Q3",
  prompt: "Hard question?",
  multiSelect: false,
  options: [{ label: "Yes" }, { label: "No" }],
};

const threeQuestions = [q1Single, q2Multi, q3Single];

const noAnswers = new Map<number, QuestionSetAnswer>();

function makeAnswered(idx: number): Map<number, QuestionSetAnswer> {
  return new Map([[idx, { selectedIndices: [1], freeForm: "" }]]);
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("InlineQuestionSet — rendering", () => {
  it("renders a tab for each question", () => {
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={0}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
  });

  it("renders the current question prompt", () => {
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={1}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    expect(screen.getByText("Which apply?")).toBeDefined();
  });

  it("renders submit and clarify buttons", () => {
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={0}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /submit/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /clarify in chat/i })).toBeDefined();
  });

  it("renders prev/next navigation arrows", () => {
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={1}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /previous question/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /next question/i })).toBeDefined();
  });

  it("renders 'select all that apply' badge for multi-select question", () => {
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={1}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    expect(screen.getByText(/select all that apply/i)).toBeDefined();
  });
});

// ─── Tab states ───────────────────────────────────────────────────────────────

describe("InlineQuestionSet — tab states", () => {
  it("answered tab shows ✓ status glyph", () => {
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={makeAnswered(0)}
        currentIndex={1}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    // Tab 0 is answered → ✓
    expect(tabs[0]?.textContent).toContain("✓");
  });

  it("active tab shows ● status glyph", () => {
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={1}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    // Tab 1 is active → ●
    expect(tabs[1]?.textContent).toContain("●");
  });

  it("unanswered non-active tab shows ○ status glyph", () => {
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={0}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    // Tab 2 is unanswered → ○
    expect(tabs[2]?.textContent).toContain("○");
  });
});

// ─── Tab navigation ───────────────────────────────────────────────────────────

describe("InlineQuestionSet — tab navigation", () => {
  it("clicking a tab fires onTabClick with correct index", () => {
    const onTabClick = vi.fn();
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={0}
        onTabClick={onTabClick}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[2]!);
    expect(onTabClick).toHaveBeenCalledWith(2);
  });

  it("prev button fires onTabClick(currentIndex - 1)", () => {
    const onTabClick = vi.fn();
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={1}
        onTabClick={onTabClick}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /previous question/i }));
    expect(onTabClick).toHaveBeenCalledWith(0);
  });

  it("next button fires onTabClick(currentIndex + 1)", () => {
    const onTabClick = vi.fn();
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={1}
        onTabClick={onTabClick}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /next question/i }));
    expect(onTabClick).toHaveBeenCalledWith(2);
  });

  it("prev button is disabled at first question", () => {
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={0}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    const prevBtn = screen.getByRole("button", { name: /previous question/i }) as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
  });

  it("next button is disabled at last question", () => {
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={2}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    const nextBtn = screen.getByRole("button", { name: /next question/i }) as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);
  });
});

// ─── Submit and clarify ───────────────────────────────────────────────────────

describe("InlineQuestionSet — submit and clarify", () => {
  it("submit fires onSubmit with current index and answer", () => {
    const onSubmit = vi.fn();
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        // multi-select (q2) is always submittable with zero selections
        answers={noAnswers}
        currentIndex={1}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={onSubmit}
        onClarifyInChat={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith(1, expect.objectContaining({ selectedIndices: [] }));
  });

  it("submit is disabled for single-select when no choice selected and no free-form", () => {
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={0} // single-select
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    const submitBtn = screen.getByRole("button", { name: /submit/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it("clarify fires onClarifyInChat with current index", () => {
    const onClarifyInChat = vi.fn();
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={2}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={onClarifyInChat}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /clarify in chat/i }));
    expect(onClarifyInChat).toHaveBeenCalledWith(2);
  });
});

// ─── Free-form ────────────────────────────────────────────────────────────────

describe("InlineQuestionSet — free-form", () => {
  it("renders a free-form textarea", () => {
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={0}
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={() => {}}
        onClarifyInChat={() => {}}
      />,
    );
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("free-form text enables submit for single-select without a choice selected", () => {
    const onSubmit = vi.fn();
    render(
      <InlineQuestionSet
        questions={threeQuestions}
        answers={noAnswers}
        currentIndex={0} // single-select
        onTabClick={() => {}}
        onAnswer={() => {}}
        onSubmit={onSubmit}
        onClarifyInChat={() => {}}
      />,
    );
    const submitBtn = screen.getByRole("button", { name: /submit/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "my own answer" } });

    expect(submitBtn.disabled).toBe(false);
    fireEvent.click(submitBtn);
    expect(onSubmit).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ freeForm: "my own answer" }),
    );
  });
});
