/**
 * Tests for ExamTabBody (Phase 16 + timer).
 *
 * Key assertions:
 * - No chat thread (no textarea / message composer)
 * - ClarificationPill renders
 * - "chat is muted during the exam" notice visible
 *
 * Timer assertions:
 * - Countdown renders when assignment has durationMinutes
 * - Warn CSS class applied when < 5 minutes remain
 * - Auto-submits at expiry and surfaces notice
 */
import type { Assignment, PraxisClient, TabSummary, Timestamp } from "@praxis/core/types";
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

// ─── Existing layout tests ─────────────────────────────────────────────────────

describe("ExamTabBody", () => {
  it("renders the exam kicker bar", () => {
    renderExamTab();
    const kickerMode = document.querySelector("[class*='kickerMode']");
    expect(kickerMode?.textContent).toBe("exam");
  });

  it("shows the 'chat is muted during the exam' notice", () => {
    renderExamTab();
    expect(screen.getByText(/chat is muted during the exam/i)).toBeDefined();
  });

  it("does NOT render a chat composer textarea", () => {
    renderExamTab();
    // ExamTabBody renders no chat thread — no textarea
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does NOT render a message log (chat thread)", () => {
    renderExamTab();
    // No chat messages area; the sidekick panel is also absent in exam mode
    expect(screen.queryByText("ask your tutor")).toBeNull();
  });

  it("renders the ClarificationPill button", () => {
    renderExamTab();
    expect(screen.getByRole("button", { name: /ask for clarification/i })).toBeDefined();
  });

  it("renders 'no assignment' placeholder when tab has no assignmentId", () => {
    renderExamTab(makeTab({ assignmentId: undefined }));
    expect(screen.getByText(/no assignment is linked/i)).toBeDefined();
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
    expect(document.querySelector("[class*='timer']")).toBeNull();
  });
});
