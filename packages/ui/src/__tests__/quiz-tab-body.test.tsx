/**
 * Tests for QuizTabBody (Phase 16).
 */
import type { PraxisClient, TabSummary, Timestamp } from "@praxis/core/types";
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

function makeTab(overrides: Partial<TabSummary> = {}): TabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "quiz",
    title: "algebra · quiz",
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
        modeId: "quiz",
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

function renderQuizTab(tab: TabSummary = makeTab(), client: PraxisClient = makeClient()) {
  return render(
    <PraxisClientProvider client={client}>
      <AuthProvider>
        <QuizTabBody tab={tab} />
      </AuthProvider>
    </PraxisClientProvider>,
  );
}

describe("QuizTabBody", () => {
  it("renders the quiz kicker bar", () => {
    renderQuizTab();
    const kickerMode = document.querySelector("[class*='kickerMode']");
    expect(kickerMode?.textContent).toBe("quiz");
  });

  it("renders the tab title in the kicker", () => {
    renderQuizTab(makeTab({ title: "algebra · quiz" }));
    const kickerTitle = document.querySelector("[class*='kickerTitle']");
    expect(kickerTitle?.textContent).toBe("algebra · quiz");
  });

  it("renders a '?' toggle button for the sidekick", () => {
    renderQuizTab();
    const toggle = screen.getByRole("button", { name: /ask tutor/i });
    expect(toggle).toBeDefined();
  });

  it("sidekick panel is initially aria-hidden", () => {
    renderQuizTab();
    // The sidekick panel aside element should have aria-hidden="true" initially
    const panel = document.querySelector("aside[aria-label='Tutor sidekick']");
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("aria-hidden")).toBe("true");
  });

  it("clicking the '?' button removes aria-hidden from the sidekick panel", async () => {
    renderQuizTab();
    const toggle = screen.getByRole("button", { name: /ask tutor/i });
    fireEvent.click(toggle);

    await waitFor(() => {
      const panel = document.querySelector("aside[aria-label='Tutor sidekick']");
      expect(panel?.getAttribute("aria-hidden")).toBe("false");
    });
  });

  it("the sidekick panel toggle goes from hidden to visible", async () => {
    renderQuizTab();
    const toggle = screen.getByRole("button", { name: /ask tutor/i });

    const panel = document.querySelector("aside[aria-label='Tutor sidekick']");
    expect(panel?.getAttribute("aria-hidden")).toBe("true");

    // Open
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(panel?.getAttribute("aria-hidden")).toBe("false");
    });
  });

  it("renders 'no assignment' placeholder when tab has no assignmentId", () => {
    renderQuizTab(makeTab({ assignmentId: undefined }));
    expect(screen.getByText(/no assignment is linked/i)).toBeDefined();
  });
});
