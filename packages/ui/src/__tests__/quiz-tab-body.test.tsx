/**
 * Tests for QuizTabBody — redesign (item-typed cards, item-status rail, no tutor mid-quiz).
 */
import type {
  Assignment,
  AssignmentItem,
  ConceptId,
  CourseId,
  PraxisClient,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuizTabBody } from "../components/quiz-tab-body.js";
import { AuthProvider } from "../context/auth-context.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

vi.mock("tldraw", () => ({ Tldraw: () => <div data-testid="tldraw-canvas" /> }));
vi.mock("tldraw/tldraw.css", () => ({}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeTab(overrides: { assignmentId?: string; title?: string } = {}) {
  return {
    kind: "session" as const,
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "quiz",
    title: overrides.title ?? "algebra · quiz",
    sortOrder: 0,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 5_000) as Timestamp,
    closedAt: null,
    ...("assignmentId" in overrides && { assignmentId: overrides.assignmentId }),
  };
}

function makeSingleChoiceItem(id: string, prompt: string): AssignmentItem {
  return {
    kind: "single-choice",
    id,
    prompt,
    options: ["A", "B", "C"],
    correctOptionIndex: 0,
  };
}

function makeMathItem(id: string, prompt: string): AssignmentItem {
  return {
    kind: "math",
    id,
    prompt,
    expectedSolution: { variable: "x", value: "2" },
  };
}

function makeAssignment(items: AssignmentItem[]): Assignment {
  return {
    id: brandId<"AssignmentId">("asgn-1"),
    courseId: brandId<"CourseId">("course-1") as CourseId,
    kind: "quiz",
    title: "Chain rule quiz",
    items,
    conceptIds: [] as ConceptId[],
    assignedAt: (Date.now() - 60_000) as Timestamp,
  };
}

function makeClient(assignment?: Assignment): PraxisClient {
  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("session-1"),
        modeId: "quiz",
        startedAt: Date.now() as Timestamp,
      }),
      end: vi.fn(),
      send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
      list: vi.fn().mockResolvedValue([]),
      spawnFromAssignment: vi.fn(),
    },
    assignments: {
      get: vi.fn().mockResolvedValue(assignment ?? null),
      list: vi.fn().mockResolvedValue([]),
      getResponses: vi.fn().mockResolvedValue([]),
      recordResponse: vi.fn().mockResolvedValue(undefined),
      submit: vi.fn().mockResolvedValue(null),
    },
  });
}

function renderQuizTab(
  tabOverrides: { assignmentId?: string; title?: string } = {},
  assignment?: Assignment,
) {
  const tab = makeTab(tabOverrides);
  const client = makeClient(assignment);
  return {
    tab,
    client,
    ...render(
      <PraxisClientProvider client={client}>
        <AuthProvider>
          <QuizTabBody tab={tab} />
        </AuthProvider>
      </PraxisClientProvider>,
    ),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("QuizTabBody — layout", () => {
  it("renders the quiz kicker bar with mode glyph", () => {
    renderQuizTab({ assignmentId: "asgn-1" });
    const kicker = document.querySelector("[class*='kickerMode']");
    expect(kicker?.textContent).toMatch(/quiz/i);
  });

  it("renders the tab title in the kicker", () => {
    renderQuizTab({ assignmentId: "asgn-1", title: "algebra · quiz" });
    const title = document.querySelector("[class*='kickerTitle']");
    expect(title?.textContent).toBe("algebra · quiz");
  });

  it("renders 'no assignment' placeholder when tab has no assignmentId", () => {
    renderQuizTab({});
    expect(screen.getByText(/no assignment is linked/i)).toBeDefined();
  });

  it("shows no-assignment placeholder when assignment returns null", async () => {
    renderQuizTab({ assignmentId: "asgn-1" }, undefined /* null assignment */);
    // Initially shows loading, then falls through to no assignment
    await waitFor(() => {
      expect(document.querySelector("[class*='noAssignment']")).not.toBeNull();
    });
  });
});

describe("QuizTabBody — tutor suppression", () => {
  it("does not render a sidekick panel or tutor toggle button", () => {
    renderQuizTab({ assignmentId: "asgn-1" });
    // Old design had a '?' button; new design intentionally removes it.
    expect(screen.queryByRole("button", { name: /ask tutor/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /close tutor/i })).toBeNull();
    // No aside with the sidekick label.
    expect(document.querySelector("aside[aria-label='Tutor sidekick']")).toBeNull();
  });

  it("renders the mode-rule banner explaining no-tutor policy", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "What is 2+2?")]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      expect(screen.getByText(/no tutor scaffolding during the quiz/i)).toBeDefined();
    });
  });
});

describe("QuizTabBody — item dispatch", () => {
  it("renders a single-choice item card for single-choice items", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "Pick the right answer")]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      expect(screen.getByText(/Pick the right answer/i)).toBeDefined();
    });
    // Single-choice renders radio options A, B, C
    expect(screen.getByText("A")).toBeDefined();
  });

  it("renders the item type pill", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "Pick one")]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      const pill = document.querySelector("[class*='typePill']");
      expect(pill?.textContent?.toLowerCase()).toContain("single-choice");
    });
  });

  it("renders item number in the item meta", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "First question"),
      makeSingleChoiceItem("item-2", "Second question"),
    ]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      expect(screen.getByText(/item 1 \/ 2/i)).toBeDefined();
    });
  });

  it("shows a ghost preview of the next item", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Current question"),
      makeSingleChoiceItem("item-2", "Next question preview text"),
    ]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      // Ghost card shows item 2 prompt
      expect(screen.getByText(/Next question preview text/i)).toBeDefined();
    });
  });

  it("dispatches math items correctly", async () => {
    const assignment = makeAssignment([makeMathItem("item-1", "Solve for x: 2x = 4")]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      expect(screen.getByText(/Solve for x: 2x = 4/i)).toBeDefined();
    });
    // Math body renders a math-input — check for type='text' math input
    const inputs = document.querySelectorAll("input[type='text'], textarea");
    // At least one input present for math response
    expect(inputs.length).toBeGreaterThan(0);
  });
});

describe("QuizTabBody — item-status rail", () => {
  it("renders the item-status rail with correct aria-label", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "Q1")]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: /quiz item status/i })).toBeDefined();
    });
  });

  it("renders one dot per item in the rail", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Q1"),
      makeSingleChoiceItem("item-2", "Q2"),
      makeSingleChoiceItem("item-3", "Q3"),
    ]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      const dots = document.querySelectorAll("[class*='dot']");
      // At least 3 dots (may include class name matches on other elements)
      const itemDots = Array.from(dots).filter(
        (el) => el.tagName === "BUTTON" && el.getAttribute("aria-label")?.startsWith("Item"),
      );
      expect(itemDots.length).toBe(3);
    });
  });

  it("marks the first item as 'current' initially", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Q1"),
      makeSingleChoiceItem("item-2", "Q2"),
    ]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      const currentDot = document.querySelector("button[aria-current='true']");
      expect(currentDot).not.toBeNull();
      expect(currentDot?.getAttribute("aria-label")).toContain("Item 1");
    });
  });

  it("clicking a dot in the rail navigates to that item", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "First question"),
      makeSingleChoiceItem("item-2", "Second question"),
    ]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      expect(screen.getByText(/First question/i)).toBeDefined();
    });

    // Click the dot for item 2
    const dot2 = Array.from(document.querySelectorAll("button")).find(
      (btn) => btn.getAttribute("aria-label") === "Item 2: upcoming",
    );
    expect(dot2).not.toBeUndefined();
    if (dot2) fireEvent.click(dot2);

    await waitFor(() => {
      // item 2 is now shown
      expect(screen.getByText(/Second question/i)).toBeDefined();
    });
  });

  it("renders the item kinds summary in the rail", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Q1"),
      makeMathItem("item-2", "Math Q"),
    ]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      // Kind labels appear in the rail
      expect(screen.getAllByText(/single-choice/i).length).toBeGreaterThan(0);
    });
  });
});

describe("QuizTabBody — item navigation and skip", () => {
  it("advances to the next item after clicking 'Submit answer'", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "First question"),
      makeSingleChoiceItem("item-2", "Second question"),
    ]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      expect(screen.getByText(/First question/i)).toBeDefined();
    });

    // Select option A to enable submit
    const radioA = screen.getByDisplayValue("0");
    fireEvent.click(radioA);

    const submitBtn = screen.getByRole("button", { name: /submit answer/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Second question/i)).toBeDefined();
    });
  });

  it("clicking 'Skip for now' advances to the next item", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "First question"),
      makeSingleChoiceItem("item-2", "Second question"),
    ]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      expect(screen.getByText(/First question/i)).toBeDefined();
    });

    const skipBtn = screen.getByRole("button", { name: /skip for now/i });
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(screen.getByText(/Second question/i)).toBeDefined();
    });
  });

  it("shows ready-to-submit panel after all items are answered or skipped", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "Only question")]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      expect(screen.getByText(/Only question/i)).toBeDefined();
    });

    const skipBtn = screen.getByRole("button", { name: /skip for now/i });
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(screen.getByText(/Ready to submit/i)).toBeDefined();
    });
  });
});

describe("QuizTabBody — confidence band", () => {
  it("renders confidence band for quiz items", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "Which is correct?")]);
    renderQuizTab({ assignmentId: "asgn-1" }, assignment);
    await waitFor(() => {
      expect(screen.getByText(/confidence in this answer/i)).toBeDefined();
    });
  });
});
