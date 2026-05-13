/**
 * Tests for ExamTabBody (Phase 16).
 *
 * Key assertions:
 * - No chat thread (no textarea / message composer)
 * - ClarificationPill renders
 * - "chat is muted during the exam" notice visible
 */
import type { PraxisClient, TabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExamTabBody } from "../components/exam-tab-body.js";
import { AuthProvider } from "../context/auth-context.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

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

function makeClient(): PraxisClient {
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
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      getResponses: vi.fn().mockResolvedValue([]),
      recordResponse: vi.fn().mockResolvedValue(undefined),
      submit: vi.fn().mockResolvedValue(null),
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
