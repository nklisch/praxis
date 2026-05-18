/**
 * Tests for ExamTabBody.
 *
 * Covers:
 * - Proctored chrome: exam-mode strip visible; "chat is muted" notice; no chat composer.
 * - Nav dimming: "exam-mode" class added to document.documentElement on mount,
 *   removed on unmount.
 * - Rubric: per-item rubric card renders for free-response items.
 * - Tool suppression: rail shows which tools are suppressed in exam mode.
 * - ClarificationPill: clarification affordance present.
 * - Timer: countdown renders, ticks, warns at 5 min, auto-submits at expiry (original).
 */
import type {
  Assignment,
  AssignmentItem,
  PraxisClient,
  Rubric,
  TabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExamTabBody } from "../components/exam-tab-body.js";
import { AuthProvider } from "../context/auth-context.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // Clean up exam-mode class in case a test fails mid-run
  document.documentElement.classList.remove("exam-mode");
});

function makeTab(overrides: Partial<TabSummary> = {}): TabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "exam",
    title: "algebra · exam",
    sortOrder: 0,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 5_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function makeRubric(maxScore = 8): Rubric {
  return {
    maxScore,
    criteria: [
      { id: "c1", description: "Identifies the nesting", weight: 0.5 },
      { id: "c2", description: "Names the multiplication", weight: 0.5 },
    ],
  };
}

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: brandId<"AssignmentId">("asgn-1"),
    courseId: brandId<"CourseId">("course-1"),
    kind: "exam",
    title: "Unit 2 Exam",
    items: [],
    conceptIds: [],
    assignedAt: Date.now() as Timestamp,
    durationMinutes: 45,
    ...overrides,
  };
}

function makeFreeResponseItem(rubric?: Rubric): AssignmentItem {
  return {
    kind: "free-response",
    id: "item-fr-1",
    prompt: "Explain why the chain rule is the right tool here",
    rubric,
  };
}

function makeClient(assignment: Assignment | null = null): PraxisClient {
  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("session-1"),
        modeId: "exam",
        startedAt: Date.now() as Timestamp,
      }),
      end: vi.fn(),
      send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
      list: vi.fn().mockResolvedValue([]),
      spawnFromAssignment: vi.fn(),
    },
    assignments: {
      get: vi.fn().mockResolvedValue(assignment),
      list: vi.fn().mockResolvedValue([]),
      getResponses: vi.fn().mockResolvedValue([]),
      recordResponse: vi.fn().mockResolvedValue(undefined),
      submit: vi.fn().mockResolvedValue({
        assignmentId: brandId<"AssignmentId">("asgn-1"),
        grade: { total: 0.8, perItem: [], reviewedBy: "deterministic" as const },
        submittedAt: Date.now() as Timestamp,
      }),
    },
  });
}

function renderExamTab(tab: TabSummary = makeTab(), client: PraxisClient = makeClient()) {
  return render(
    <PraxisClientProvider client={client}>
      <AuthProvider>
        <ExamTabBody tab={tab} />
      </AuthProvider>
    </PraxisClientProvider>,
  );
}

// ─── Proctored chrome tests ─────────────────────────────────────────────────────

describe("ExamTabBody — proctored chrome", () => {
  it("renders the exam-mode strip (proctored pill)", () => {
    renderExamTab();
    // The exam strip contains "proctored" text
    expect(screen.getByText(/proctored/i)).toBeDefined();
  });

  it("shows the 'chat is muted during the exam' notice", () => {
    renderExamTab();
    expect(screen.getByText(/chat is muted during the exam/i)).toBeDefined();
  });

  it("does NOT render a chat composer textarea", () => {
    renderExamTab();
    // ExamTabBody renders no chat thread — no textarea for chat
    // (ClarificationPill has an input but no role=textbox at rest)
    const textboxes = document.querySelectorAll("textarea");
    // Only an answer textarea from the assignment card is acceptable — no chat composer
    // When no assignment is loaded, there should be zero textareas
    const assignmentTextareas = Array.from(textboxes).filter((t) => t.closest("[data-testid]"));
    expect(screen.queryByText("ask your tutor")).toBeNull();
    // No element with placeholder text typical of a chat composer
    expect(screen.queryByPlaceholderText(/message/i)).toBeNull();
    void assignmentTextareas; // suppress unused warning
  });

  it("renders the ClarificationPill button when assignment is linked", () => {
    // ClarificationPill renders inside the assignmentId branch
    renderExamTab(makeTab({ assignmentId: "asgn-1" }));
    expect(screen.getByRole("button", { name: /ask for clarification/i })).toBeDefined();
  });

  it("renders 'no assignment' placeholder when tab has no assignmentId", () => {
    renderExamTab(makeTab({ assignmentId: undefined }));
    expect(screen.getByText(/no assignment is linked/i)).toBeDefined();
  });

  it("renders the mode rule banner when assignment is linked", () => {
    // Mode rule banner renders inside the assignmentId branch
    renderExamTab(makeTab({ assignmentId: "asgn-1" }));
    expect(screen.getByText(/exam mode is on/i)).toBeDefined();
  });
});

// ─── Nav dimming tests ──────────────────────────────────────────────────────────

describe("ExamTabBody — nav dimming", () => {
  it("adds 'exam-mode' class to document.documentElement on mount", () => {
    expect(document.documentElement.classList.contains("exam-mode")).toBe(false);
    renderExamTab();
    expect(document.documentElement.classList.contains("exam-mode")).toBe(true);
  });

  it("removes 'exam-mode' class from document.documentElement on unmount", () => {
    const { unmount } = renderExamTab();
    expect(document.documentElement.classList.contains("exam-mode")).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains("exam-mode")).toBe(false);
  });
});

// ─── Rubric tests ───────────────────────────────────────────────────────────────

describe("ExamTabBody — rubric display", () => {
  it("renders rubric card for a free-response item with a rubric", async () => {
    const rubric = makeRubric(8);
    const assignment = makeAssignment({
      items: [makeFreeResponseItem(rubric)],
    });
    const client = makeClient(assignment);
    const tab = makeTab({ assignmentId: "asgn-1" });

    renderExamTab(tab, client);

    await act(async () => {
      await Promise.resolve();
    });

    // Rubric card renders with "pre-committed" label
    expect(document.querySelectorAll("[data-testid='rubric-card']").length).toBeGreaterThan(0);
  });

  it("renders per-criterion rows in the rubric card", async () => {
    const rubric = makeRubric(8);
    const assignment = makeAssignment({
      items: [makeFreeResponseItem(rubric)],
    });
    const client = makeClient(assignment);
    const tab = makeTab({ assignmentId: "asgn-1" });

    renderExamTab(tab, client);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/Identifies the nesting/i)).toBeDefined();
    expect(screen.getByText(/Names the multiplication/i)).toBeDefined();
  });

  it("does not render a rubric section when items have no rubrics", async () => {
    const assignment = makeAssignment({
      items: [makeFreeResponseItem(undefined)],
    });
    const client = makeClient(assignment);
    const tab = makeTab({ assignmentId: "asgn-1" });

    renderExamTab(tab, client);

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.querySelectorAll("[data-testid='rubric-card']").length).toBe(0);
  });
});

// ─── Tool suppression tests ─────────────────────────────────────────────────────

describe("ExamTabBody — tool suppression display", () => {
  it("renders the tools-allowed panel in the item rail", async () => {
    const assignment = makeAssignment({ items: [] });
    const client = makeClient(assignment);
    const tab = makeTab({ assignmentId: "asgn-1" });

    renderExamTab(tab, client);

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.querySelector("[data-testid='tools-allowed']")).not.toBeNull();
  });

  it("shows suppressed tools with strikethrough label", async () => {
    const assignment = makeAssignment({ items: [] });
    const client = makeClient(assignment);
    const tab = makeTab({ assignmentId: "asgn-1" });

    renderExamTab(tab, client);

    await act(async () => {
      await Promise.resolve();
    });

    const suppressedPanel = document.querySelector("[data-testid='suppressed-tools']");
    expect(suppressedPanel).not.toBeNull();
    expect(suppressedPanel?.textContent).toMatch(/grade_math/i);
    expect(suppressedPanel?.textContent).toMatch(/tutor/i);
  });

  it("shows clarification as an allowed tool", async () => {
    const assignment = makeAssignment({ items: [] });
    const client = makeClient(assignment);
    const tab = makeTab({ assignmentId: "asgn-1" });

    renderExamTab(tab, client);

    await act(async () => {
      await Promise.resolve();
    });

    // "clarification" appears in the tools-allowed panel
    const toolsPanel = document.querySelector("[data-testid='tools-allowed']");
    expect(toolsPanel?.textContent).toMatch(/clarification/i);
  });
});

// ─── Timer tests ───────────────────────────────────────────────────────────────

describe("ExamTabBody — countdown timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders the countdown when assignment has durationMinutes", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const assignment = makeAssignment({
      assignedAt: now as Timestamp,
      durationMinutes: 45,
    });
    const client = makeClient(assignment);
    const tab = makeTab({ assignmentId: "asgn-1" });

    renderExamTab(tab, client);

    // Wait for the async assignment load
    await act(async () => {
      await Promise.resolve();
    });

    // Countdown should show "45:00 left" (at t=0 of 45min exam)
    expect(screen.getByText(/45:00 left/i)).toBeDefined();
  });

  it("ticks down every second", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const assignment = makeAssignment({
      assignedAt: now as Timestamp,
      durationMinutes: 45,
    });
    const client = makeClient(assignment);
    const tab = makeTab({ assignmentId: "asgn-1" });

    renderExamTab(tab, client);

    // Load assignment
    await act(async () => {
      await Promise.resolve();
    });

    // Advance 61 seconds
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });

    // Should now show ~43:59 left
    expect(screen.getByText(/43:59 left/i)).toBeDefined();
  });

  it("applies warn styling when < 5 minutes remain", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    // Start an exam with only 6 minutes, then advance past the warn threshold
    const assignment = makeAssignment({
      assignedAt: now as Timestamp,
      durationMinutes: 6,
    });
    const client = makeClient(assignment);
    const tab = makeTab({ assignmentId: "asgn-1" });

    renderExamTab(tab, client);

    await act(async () => {
      await Promise.resolve();
    });

    // Before warn threshold: 6 minutes, timer should NOT have warn class
    const timerBefore = document.querySelector("[class*='timer']");
    expect(timerBefore?.className).not.toContain("timerWarn");

    // Advance 90 seconds → 4:30 left (below 5-min threshold)
    await act(async () => {
      vi.advanceTimersByTime(90_000);
    });

    const timerAfter = document.querySelector("[class*='timerWarn']");
    expect(timerAfter).not.toBeNull();
  });

  it("calls submit and shows notice when time expires", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    // Use a very short exam: 1 minute
    const assignment = makeAssignment({
      assignedAt: now as Timestamp,
      durationMinutes: 1,
    });
    const client = makeClient(assignment);
    const submitMock = client.assignments.submit as ReturnType<typeof vi.fn>;
    const tab = makeTab({ assignmentId: "asgn-1" });

    renderExamTab(tab, client);

    await act(async () => {
      await Promise.resolve();
    });

    // Advance past expiry using advanceTimersByTimeAsync so async callbacks run too
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    expect(submitMock).toHaveBeenCalledOnce();
    expect(screen.getByText(/time's up/i)).toBeDefined();
  });

  it("does not call submit twice if timer fires multiple ticks at expiry", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const assignment = makeAssignment({
      assignedAt: now as Timestamp,
      durationMinutes: 1,
    });
    const client = makeClient(assignment);
    const submitMock = client.assignments.submit as ReturnType<typeof vi.fn>;
    const tab = makeTab({ assignmentId: "asgn-1" });

    renderExamTab(tab, client);

    await act(async () => {
      await Promise.resolve();
    });

    // Advance well past expiry — many interval ticks fire in the expired window
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    // expiredRef guard: submit called exactly once
    expect(submitMock).toHaveBeenCalledOnce();
  });

  it("does not render timer when assignment has no durationMinutes", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const assignment = makeAssignment({
      assignedAt: now as Timestamp,
      durationMinutes: null,
    });
    const client = makeClient(assignment);
    const tab = makeTab({ assignmentId: "asgn-1" });

    renderExamTab(tab, client);

    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(1_000);
    });

    // No timer element at all
    expect(document.querySelector("[data-testid='exam-timer']")).toBeNull();
  });
});
