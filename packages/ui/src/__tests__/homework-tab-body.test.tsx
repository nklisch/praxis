/**
 * Tests for HomeworkTabBody — paginated multi-item batch with save/skip/flag.
 *
 * Covers:
 *  - Layout: kicker, mode-rule banner, page nav, submit rail.
 *  - Pagination: prev/next navigation, page-nav row highlighting.
 *  - Per-item save / skip / flag actions and their effect on page-nav status.
 *  - Work-area tabs: typed / show-work / sketch switching.
 *  - Feedback gating: AssignmentFeedback NOT shown before submit, shown after.
 *  - Final submit: triggers assignment submission, reveals feedback.
 *  - Submit gating: submit button disabled when empty items remain.
 *  - No-assignment / loading / error states.
 */
import type {
  Assignment,
  AssignmentItem,
  AssignmentSubmissionResult,
  ConceptId,
  CourseId,
  Grade,
  PraxisClient,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeworkTabBody } from "../components/homework-tab-body.js";
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
    id: brandId<"TabId">("tab-hw-1"),
    sessionId: brandId<"SessionId">("session-hw-1"),
    modeId: "homework",
    title: overrides.title ?? "Calculus · L2.3",
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

function makeFreeResponseItem(id: string, prompt: string): AssignmentItem {
  return {
    kind: "free-response",
    id,
    prompt,
    rubric: {
      criteria: [{ id: "crit-1", description: "Correct reasoning", weight: 10 }],
    },
  };
}

function makeAssignment(items: AssignmentItem[], grade?: Grade): Assignment {
  return {
    id: brandId<"AssignmentId">("asgn-hw-1"),
    courseId: brandId<"CourseId">("course-1") as CourseId,
    kind: "homework",
    title: "Chain rule practice",
    items,
    conceptIds: [] as ConceptId[],
    assignedAt: (Date.now() - 60_000) as Timestamp,
    ...(grade !== undefined && { grade }),
  };
}

function makeGrade(): Grade {
  return {
    total: 0.8,
    perItem: [
      {
        itemId: "item-1",
        score: 0.8,
        feedback: "Good setup. Check sign on dy/dt.",
        gradedBy: "rubric-agent",
      },
      {
        itemId: "item-2",
        score: 0.75,
        feedback: "Correct approach.",
        gradedBy: "rubric-agent",
      },
    ],
    reviewedBy: "rubric-agent",
  };
}

function makeSubmitResult(assignment: Assignment): AssignmentSubmissionResult {
  return {
    assignmentId: assignment.id,
    grade: makeGrade(),
    submittedAt: Date.now() as Timestamp,
  };
}

interface ClientOptions {
  assignment?: Assignment | null;
  submitResult?: AssignmentSubmissionResult;
  submitShouldHang?: boolean;
}

function makeClient(opts: ClientOptions = {}): PraxisClient {
  const assignment =
    opts.assignment === undefined
      ? makeAssignment([makeSingleChoiceItem("item-1", "Default question")])
      : opts.assignment;

  const submitFn = opts.submitShouldHang
    ? vi.fn().mockImplementation(() => new Promise(() => {}))
    : vi
        .fn()
        .mockResolvedValue(opts.submitResult ?? (assignment ? makeSubmitResult(assignment) : null));

  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn(),
      end: vi.fn(),
      send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
      list: vi.fn().mockResolvedValue([]),
      spawnFromAssignment: vi.fn(),
    },
    assignments: {
      get: assignment
        ? vi.fn().mockResolvedValue(assignment)
        : vi.fn().mockImplementation(() => new Promise(() => {})),
      list: vi.fn().mockResolvedValue([]),
      getResponses: vi.fn().mockResolvedValue([]),
      recordResponse: vi.fn().mockResolvedValue(undefined),
      submit: submitFn,
    },
    sketches: {
      put: vi.fn().mockResolvedValue({ id: "sketch-1" }),
      get: vi.fn(),
    },
  });
}

function renderHW(
  tabOverrides: { assignmentId?: string; title?: string } = {},
  clientOpts: ClientOptions = {},
) {
  const tab = makeTab(tabOverrides);
  const client = makeClient(clientOpts);
  return {
    tab,
    client,
    ...render(
      <PraxisClientProvider client={client}>
        <AuthProvider>
          <HomeworkTabBody tab={tab} />
        </AuthProvider>
      </PraxisClientProvider>,
    ),
  };
}

// ── Tests: Layout ─────────────────────────────────────────────────────────────

describe("HomeworkTabBody — layout", () => {
  it("renders the homework kicker with mode glyph", () => {
    renderHW({ assignmentId: "asgn-hw-1" });
    const kicker = document.querySelector("[class*='kickerMode']");
    expect(kicker?.textContent?.toLowerCase()).toContain("homework");
  });

  it("renders the tab title in the kicker", () => {
    renderHW({ assignmentId: "asgn-hw-1", title: "Calculus · L2.3" });
    const title = document.querySelector("[class*='kickerTitle']");
    expect(title?.textContent).toBe("Calculus · L2.3");
  });

  it("renders 'no assignment' placeholder when tab has no assignmentId", () => {
    renderHW({});
    expect(screen.getByText(/no assignment is linked/i)).toBeDefined();
  });

  it("renders the mode-rule banner explaining homework policy", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "What is x?")]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(screen.getByText(/this is homework mode/i)).toBeDefined();
    });
  });

  it("renders the page nav aside with aria-label", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "Q1")]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: /homework items/i })).toBeDefined();
    });
  });

  it("renders the submit rail aside with aria-label", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "Q1")]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: /submit homework/i })).toBeDefined();
    });
  });

  it("renders one page-nav row per item", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Q1"),
      makeSingleChoiceItem("item-2", "Q2"),
      makeSingleChoiceItem("item-3", "Q3"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      // Each page-nav row is a button inside the page list
      const pageList = document.querySelector("[class*='pageList']");
      const rows = pageList?.querySelectorAll("button[class*='pageRow']");
      expect(rows?.length).toBe(3);
    });
  });
});

// Helper: query within the <main> element (item content area only).
// Throws if main is not yet mounted — waitFor will retry.
function getMain() {
  const main = document.querySelector("main");
  if (!main) throw new Error("<main> not yet in DOM");
  return within(main);
}

// ── Tests: Pagination ─────────────────────────────────────────────────────────

describe("HomeworkTabBody — pagination", () => {
  it("shows the first item on mount", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "First question"),
      makeSingleChoiceItem("item-2", "Second question"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    // Item content is inside main; page nav also shows truncated text so use within(main)
    await waitFor(() => {
      expect(getMain().getByText(/First question/i)).toBeDefined();
    });
    // Second item not visible in main yet
    expect(getMain().queryByText(/Second question/i)).toBeNull();
  });

  it("navigates to next item via 'Save & next' button", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "First question"),
      makeSingleChoiceItem("item-2", "Second question"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(getMain().getByText(/First question/i)).toBeDefined();
    });

    const nextBtn = screen.getByRole("button", { name: /save.*next/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(getMain().getByText(/Second question/i)).toBeDefined();
    });
  });

  it("navigates back via 'Previous' button", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "First question"),
      makeSingleChoiceItem("item-2", "Second question"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(getMain().getByText(/First question/i)).toBeDefined();
    });

    // Go to item 2
    const nextBtn = screen.getByRole("button", { name: /save.*next/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(getMain().getByText(/Second question/i)).toBeDefined();
    });

    // Go back to item 1
    const prevBtn = screen.getByRole("button", { name: /previous/i });
    fireEvent.click(prevBtn);

    await waitFor(() => {
      expect(getMain().getByText(/First question/i)).toBeDefined();
    });
  });

  it("Previous button is disabled on the first item", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "First question"),
      makeSingleChoiceItem("item-2", "Second question"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      const prevBtn = screen.getByRole("button", { name: /previous/i });
      expect((prevBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("Save & next button is disabled on the last item", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "Only question")]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /save.*next/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("page-nav row for current item has 'current' class / aria-current", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Q1"),
      makeSingleChoiceItem("item-2", "Q2"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      const currentRow = document.querySelector("button[aria-current='true']");
      expect(currentRow).not.toBeNull();
    });
  });

  it("clicking a page-nav row navigates to that item", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "First question"),
      makeSingleChoiceItem("item-2", "Second question"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(getMain().getByText(/First question/i)).toBeDefined();
    });

    // Click second page-nav row
    const pageList = document.querySelector("[class*='pageList']");
    const rows = pageList?.querySelectorAll("button[class*='pageRow']");
    expect(rows?.length).toBe(2);
    if (rows?.[1]) fireEvent.click(rows[1]);

    await waitFor(() => {
      expect(getMain().getByText(/Second question/i)).toBeDefined();
    });
  });
});

// ── Tests: Save / Skip / Flag ─────────────────────────────────────────────────

describe("HomeworkTabBody — save/skip/flag", () => {
  it("shows empty status pill for unanswered items", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Q1"),
      makeSingleChoiceItem("item-2", "Q2"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      const emptyPills = document.querySelectorAll("[class*='pageStatusEmpty']");
      // Both items start empty
      expect(emptyPills.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("clicking 'Skip — fill later' marks item as skipped in page nav", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Skip me please"),
      makeSingleChoiceItem("item-2", "Second question here"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(getMain().getByText(/Skip me please/i)).toBeDefined();
    });

    const skipBtn = screen.getByRole("button", { name: /skip — fill later/i });
    fireEvent.click(skipBtn);

    await waitFor(() => {
      const skipPills = document.querySelectorAll("[class*='pageStatusSkip']");
      expect(skipPills.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("clicking 'Skip' advances to the next item", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "First question here"),
      makeSingleChoiceItem("item-2", "Second question here"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(getMain().getByText(/First question here/i)).toBeDefined();
    });

    const skipBtn = screen.getByRole("button", { name: /skip — fill later/i });
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(getMain().getByText(/Second question here/i)).toBeDefined();
    });
  });

  it("clicking 'Flag for review' marks item as flagged in page nav", async () => {
    // Use a prompt longer than 24 chars so truncation differs from page-nav
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Flag this item for later review"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(getMain().getByText(/Flag this item for later review/i)).toBeDefined();
    });

    const flagBtn = screen.getByRole("button", { name: /flag for review/i });
    fireEvent.click(flagBtn);

    await waitFor(() => {
      const flagPills = document.querySelectorAll("[class*='pageStatusFlagged']");
      expect(flagPills.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("flag button toggles: clicking again removes the flag", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Toggle flag on this item here"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(getMain().getByText(/Toggle flag on this item here/i)).toBeDefined();
    });

    const flagBtn = screen.getByRole("button", { name: /flag for review/i });
    // First click: flag it
    fireEvent.click(flagBtn);

    await waitFor(() => {
      const flagPills = document.querySelectorAll("[class*='pageStatusFlagged']");
      expect(flagPills.length).toBeGreaterThanOrEqual(1);
    });

    // Second click: un-flag it. Button text is now "⚑ Flagged" — use a more
    // precise matcher that won't also match the action-hint "⌘F flag" text.
    // Query by aria-pressed=true to find exactly the active flag button.
    const flaggedBtn = document.querySelector("button[aria-pressed='true']");
    expect(flaggedBtn).not.toBeNull();
    if (flaggedBtn) fireEvent.click(flaggedBtn);

    await waitFor(() => {
      const flagPills = document.querySelectorAll("[class*='pageStatusFlagged']");
      expect(flagPills.length).toBe(0);
    });
  });

  it("shows answered status in page nav after recordResponse is called", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Answer me correctly please"),
    ]);
    const client = makeClient({ assignment });
    const tab = makeTab({ assignmentId: "asgn-hw-1" });
    render(
      <PraxisClientProvider client={client}>
        <AuthProvider>
          <HomeworkTabBody tab={tab} />
        </AuthProvider>
      </PraxisClientProvider>,
    );

    // Wait for item to render
    await waitFor(() => {
      expect(getMain().getByText(/Answer me correctly please/i)).toBeDefined();
    });

    // Select the first radio option (value "0")
    const radio = screen.getByDisplayValue("0");
    fireEvent.click(radio);

    // After selecting, the response is "0" — page nav should reflect "answered"
    await waitFor(() => {
      const donePills = document.querySelectorAll("[class*='pageStatusDone']");
      expect(donePills.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("stat row in submit card counts skipped items", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Skip this one for now please"),
      makeSingleChoiceItem("item-2", "The second question goes here"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(getMain().getByText(/Skip this one for now please/i)).toBeDefined();
    });

    const skipBtn = screen.getByRole("button", { name: /skip — fill later/i });
    fireEvent.click(skipBtn);

    // Submit card shows Skipped: 1
    await waitFor(() => {
      const statRows = document.querySelectorAll("[class*='statRow']");
      const skippedRow = Array.from(statRows).find((row) =>
        row.textContent?.toLowerCase().includes("skipped"),
      );
      expect(skippedRow?.textContent).toMatch(/1/);
    });
  });
});

// ── Tests: Work-area tabs ─────────────────────────────────────────────────────

describe("HomeworkTabBody — work-area tabs", () => {
  it("renders the work-area tab strip with typed/show-work/sketch tabs", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "Q1")]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /typed/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /show-work/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /sketch/i })).toBeDefined();
    });
  });

  it("defaults to 'typed' tab as active", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "Q1")]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      const typedTab = screen.getByRole("tab", { name: /typed/i });
      expect(typedTab.getAttribute("aria-selected")).toBe("true");
    });
  });

  it("clicking 'show-work' tab activates it", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "Q1")]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /show-work/i })).toBeDefined();
    });

    const showWorkTab = screen.getByRole("tab", { name: /show-work/i });
    fireEvent.click(showWorkTab);

    await waitFor(() => {
      expect(showWorkTab.getAttribute("aria-selected")).toBe("true");
    });
  });

  it("clicking 'sketch' tab activates it and shows sketch area", async () => {
    const assignment = makeAssignment([makeSingleChoiceItem("item-1", "Q1")]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /sketch/i })).toBeDefined();
    });

    const sketchTab = screen.getByRole("tab", { name: /sketch/i });
    fireEvent.click(sketchTab);

    await waitFor(() => {
      const sketchArea = screen.getByRole("region", { name: /sketch area/i });
      expect(sketchArea).toBeDefined();
    });
  });
});

// ── Tests: Feedback gating ────────────────────────────────────────────────────

describe("HomeworkTabBody — feedback gating", () => {
  it("does NOT show AssignmentFeedback before submission", async () => {
    const assignment = makeAssignment([
      makeFreeResponseItem("item-1", "Explain the chain rule in detail here."),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(getMain().getByText(/Explain the chain rule in detail here/i)).toBeDefined();
    });

    // No feedback elements before submit
    expect(document.querySelector("[class*='feedback']")).toBeNull();
  });

  it("submit button is disabled when there are empty items", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "Q1"),
      makeSingleChoiceItem("item-2", "Q2"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      const submitBtn = screen.getByRole("button", { name: /submit/i });
      // When there are empty items, button is disabled (has "empty" count text)
      expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("submit button becomes enabled when all items have responses", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "The one and only question"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });
    await waitFor(() => {
      expect(getMain().getByText(/The one and only question/i)).toBeDefined();
    });

    // Answer the item by selecting radio option 0
    const radio = screen.getByDisplayValue("0");
    fireEvent.click(radio);

    await waitFor(() => {
      const submitBtn = screen.getByRole("button", { name: /submit set/i });
      expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("reveals per-item feedback after final submit", async () => {
    const item1: AssignmentItem = {
      kind: "single-choice",
      id: "item-1",
      prompt: "Which rule applies here correctly?",
      options: ["A", "B", "C"],
      correctOptionIndex: 0,
    };
    const assignment = makeAssignment([item1]);
    // Build a custom submit result with the grade's perItem itemId matching item1.id
    const grade: Grade = {
      total: 0.8,
      perItem: [
        {
          itemId: "item-1",
          score: 0.8,
          feedback: "Good setup. Check sign on dy/dt.",
          gradedBy: "rubric-agent",
        },
      ],
      reviewedBy: "rubric-agent",
    };
    const submitResult: AssignmentSubmissionResult = {
      assignmentId: assignment.id,
      grade,
      submittedAt: Date.now() as Timestamp,
    };
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment, submitResult });
    await waitFor(() => {
      expect(getMain().getByText(/Which rule applies here correctly/i)).toBeDefined();
    });

    // Answer item 1 by selecting radio option 0
    const radio = screen.getByDisplayValue("0");
    fireEvent.click(radio);

    // Submit the set (now 1/1 answered → enabled)
    await waitFor(() => {
      const submitBtn = screen.getByRole("button", { name: /submit set/i });
      expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
    });

    const submitBtn = screen.getByRole("button", { name: /submit set/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      // Submitted banner appears
      expect(screen.getByText(/homework submitted/i)).toBeDefined();
    });

    // Per-item feedback is now visible
    await waitFor(() => {
      expect(screen.getByText(/Good setup. Check sign on dy\/dt./i)).toBeDefined();
    });
  });

  it("shows overall score banner after submission", async () => {
    const item1: AssignmentItem = {
      kind: "single-choice",
      id: "item-sc-1",
      prompt: "The one and only question for test",
      options: ["A", "B", "C"],
      correctOptionIndex: 0,
    };
    // Build custom grade with a distinct total score
    const grade: Grade = {
      total: 0.6,
      perItem: [{ itemId: "item-sc-1", score: 0.6, feedback: "OK", gradedBy: "deterministic" }],
      reviewedBy: "deterministic",
    };
    const assignment = makeAssignment([item1]);
    const submitResult: AssignmentSubmissionResult = {
      assignmentId: assignment.id,
      grade,
      submittedAt: Date.now() as Timestamp,
    };
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment, submitResult });
    await waitFor(() => {
      expect(getMain().getByText(/The one and only question for test/i)).toBeDefined();
    });

    // Answer item
    const radio = screen.getByDisplayValue("0");
    fireEvent.click(radio);

    await waitFor(() => {
      const submitBtn = screen.getByRole("button", { name: /submit set/i });
      expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: /submit set/i }));

    await waitFor(() => {
      // Submitted banner should appear
      expect(screen.getByText(/homework submitted/i)).toBeDefined();
      // Score element is in the submittedScore div
      const scoreEl = document.querySelector("[class*='submittedScore']");
      expect(scoreEl).not.toBeNull();
      expect(scoreEl?.textContent).toMatch(/60%/);
    });
  });

  it("hides the mode-rule banner after submission", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "The only question for banner test"),
    ]);
    const submitResult = makeSubmitResult(assignment);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment, submitResult });
    await waitFor(() => {
      expect(getMain().getByText(/The only question for banner test/i)).toBeDefined();
    });

    const radio = screen.getByDisplayValue("0");
    fireEvent.click(radio);

    await waitFor(() => {
      const submitBtn = screen.getByRole("button", { name: /submit set/i });
      expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: /submit set/i }));

    await waitFor(() => {
      // Mode-rule banner should no longer be present after submission
      expect(screen.queryByText(/this is homework mode/i)).toBeNull();
    });
  });

  it("already-submitted assignment renders feedback immediately on mount", async () => {
    const grade = makeGrade();
    // Build items with id matching the grade entries
    const items: AssignmentItem[] = [
      { ...makeFreeResponseItem("item-1", "Explain the chain rule in detail."), id: "item-1" },
      { ...makeFreeResponseItem("item-2", "Describe related rates clearly."), id: "item-2" },
    ];
    const assignment = makeAssignment(items, grade);

    renderHW({ assignmentId: "asgn-hw-1" }, { assignment });

    await waitFor(() => {
      // Should show feedback text directly (assignment was already submitted)
      expect(screen.getByText(/Good setup. Check sign on dy\/dt./i)).toBeDefined();
    });
  });
});

// ── Tests: Optimistic submit ──────────────────────────────────────────────────

describe("HomeworkTabBody — optimistic submit", () => {
  it("submit button stays interactive (not disabled) while submit is in-flight", async () => {
    const assignment = makeAssignment([
      makeSingleChoiceItem("item-1", "The one and only question"),
    ]);
    renderHW({ assignmentId: "asgn-hw-1" }, { assignment, submitShouldHang: true });
    await waitFor(() => {
      expect(getMain().getByText(/The one and only question/i)).toBeDefined();
    });

    // Answer item 1 by selecting radio option 0 so submit is enabled.
    const radio = screen.getByDisplayValue("0");
    fireEvent.click(radio);

    await waitFor(() => {
      const submitBtn = screen.getByRole("button", { name: /submit set/i });
      expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
    });

    // Click submit — it now hangs.
    const submitBtn = screen.getByRole("button", { name: /submit set/i });
    fireEvent.click(submitBtn);

    // Button must remain enabled during the in-flight period.
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
  });
});

// ── Tests: Loading / error / empty states ──────────────────────────────────────

describe("HomeworkTabBody — edge states", () => {
  it("shows loading state while fetching assignment", () => {
    const client = makeFakeClient({
      assignments: {
        get: vi.fn().mockImplementation(() => new Promise(() => {})),
        list: vi.fn().mockResolvedValue([]),
        getResponses: vi.fn().mockImplementation(() => new Promise(() => {})),
        recordResponse: vi.fn().mockResolvedValue(undefined),
        submit: vi.fn(),
      },
    });
    const tab = makeTab({ assignmentId: "asgn-hw-1" });
    render(
      <PraxisClientProvider client={client}>
        <AuthProvider>
          <HomeworkTabBody tab={tab} />
        </AuthProvider>
      </PraxisClientProvider>,
    );
    expect(screen.getByText(/loading homework/i)).toBeDefined();
  });

  it("shows no-assignment message when assignment resolves to null", async () => {
    const client = makeFakeClient({
      assignments: {
        get: vi.fn().mockResolvedValue(null),
        list: vi.fn().mockResolvedValue([]),
        getResponses: vi.fn().mockResolvedValue([]),
        recordResponse: vi.fn().mockResolvedValue(undefined),
        submit: vi.fn(),
      },
    });
    const tab = makeTab({ assignmentId: "asgn-hw-1" });
    render(
      <PraxisClientProvider client={client}>
        <AuthProvider>
          <HomeworkTabBody tab={tab} />
        </AuthProvider>
      </PraxisClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/no assignment found/i)).toBeDefined();
    });
  });
});
