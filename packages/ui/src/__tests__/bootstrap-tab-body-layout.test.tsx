/**
 * Layout regression tests for BootstrapTabBody — Canvas + Side Chat shape.
 *
 * Guards the two-column structure (draft canvas left, authoring chat right)
 * introduced by the course-create tab body rebuild.
 *
 * jsdom has no real layout engine, so these tests verify DOM structure and
 * CSS-module class names as proxies for the layout invariants.
 */
import type { SessionTabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// Mutable draft state for parameterising useDrafts in tests.
let _mockCurrentDraft: unknown = null;

// Mock TanStack Router so useNavigate works in test context.
const mockNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({}),
  };
});

// Mock heavy sub-components to isolate layout concerns.
vi.mock("../components/authoring-chat-pane.js", () => ({
  AuthoringChatPane: ({ mode }: { mode: string }) => (
    <div data-testid="authoring-chat-pane" data-mode={mode} />
  ),
}));
vi.mock("../components/draft-card.js", () => ({
  DraftCard: () => <div data-testid="draft-card" />,
}));
vi.mock("../hooks/use-drafts.js", () => ({
  useDrafts: () => ({ current: _mockCurrentDraft }),
}));
vi.mock("../hooks/use-bootstrap-budget.js", () => ({
  BOOTSTRAP_BUDGET_MIN: 5,
  BOOTSTRAP_BUDGET_MAX: 200,
  useBootstrapBudget: () => ({ maxSteps: 100, saving: false, setMaxSteps: vi.fn() }),
}));

// Import after mocks (Vitest hoists vi.mock calls).
const { BootstrapTabBody } = await import("../components/bootstrap-tab-body.js");

afterEach(() => {
  cleanup();
  // Reset to no-draft state between tests.
  _mockCurrentDraft = null;
});

function makeTab(overrides: Partial<SessionTabSummary> = {}): SessionTabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "bootstrap",
    title: "bootstrap",
    sortOrder: 0,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 5_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function renderBootstrap() {
  const client = makeFakeClient({
    subAgent: {
      list: vi.fn().mockResolvedValue([]),
      events: vi.fn(async function* () {}),
    } as unknown as ReturnType<typeof makeFakeClient>["subAgent"],
    author: {
      listConfiguratorActions: vi.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof makeFakeClient>["author"],
    // The finalization handler subscribes to drafts.events — return an empty
    // async generator so the useEffect doesn't throw in tests.
    drafts: {
      events: vi.fn(async function* () {}),
    } as unknown as ReturnType<typeof makeFakeClient>["drafts"],
  });

  return render(
    <PraxisClientProvider client={client}>
      <BootstrapTabBody tab={makeTab()} />
    </PraxisClientProvider>,
  );
}

describe("BootstrapTabBody — Canvas + Side Chat layout", () => {
  it("renders the draft canvas scroll region", () => {
    const { getByTestId } = renderBootstrap();
    expect(getByTestId("draft-canvas-scroll")).toBeTruthy();
  });

  it("mounts AuthoringChatPane in bootstrap mode", () => {
    renderBootstrap();
    const pane = screen.getByTestId("authoring-chat-pane");
    expect(pane).toBeTruthy();
    expect(pane.getAttribute("data-mode")).toBe("bootstrap");
  });

  it("canvas scroll and chat panel are siblings (not nested)", () => {
    const { getByTestId, container } = renderBootstrap();
    const canvasScroll = getByTestId("draft-canvas-scroll");

    // Find chatPanel by class substring.
    const chatPanel = Array.from(container.querySelectorAll("*")).find((el) =>
      Array.from(el.classList).some((c) => /chatPanel/.test(c)),
    );
    expect(chatPanel, "chatPanel must exist").toBeTruthy();

    // They should share the same parent — the grid container.
    expect(canvasScroll.parentElement).not.toBeNull();
    // chatPanel is not inside draftCanvas, and canvasScroll is not inside chatPanel.
    expect(chatPanel?.contains(canvasScroll)).toBe(false);
    expect(canvasScroll.contains(chatPanel ?? null)).toBe(false);
  });

  it("renders empty-state copy when no draft is present", () => {
    renderBootstrap();
    expect(screen.getByText(/the outline will appear here/i)).toBeTruthy();
  });

  it("renders the budget field", () => {
    renderBootstrap();
    expect(screen.getByRole("spinbutton", { name: /course-design budget/i })).toBeTruthy();
  });
});

describe("BootstrapTabBody — draft canvas with units", () => {
  it("renders unit blocks and lesson rows when draft has units", () => {
    // Set draft state via the shared mutable ref consumed by the useDrafts mock.
    _mockCurrentDraft = {
      draftId: "d1",
      proposed: {
        title: "Calculus I",
        subject: "Mathematics",
        gradeLevel: "University",
        thresholds: {},
        proposedConcepts: [],
        proposedEdges: [],
        proposedLessons: [
          {
            draftLessonId: "l1",
            title: "Limits",
            conceptNames: [],
            references: [],
            suggestedStrategy: "direct",
            estimatedMinutes: 60,
          },
        ],
        proposedUnits: [
          {
            draftUnitId: "u1",
            name: "Unit 1",
            draftLessonIds: ["l1"],
          },
        ],
        proposedLessonAssessments: [],
      },
    };

    const { getAllByTestId } = renderBootstrap();

    const unitBlocks = getAllByTestId("unit-block");
    expect(unitBlocks.length).toBe(1);
    const lessonRows = getAllByTestId("lesson-row");
    expect(lessonRows.length).toBe(1);
  });

  it("shows course title in canvas header when draft is present", () => {
    _mockCurrentDraft = {
      draftId: "d2",
      proposed: {
        title: "Biology 101",
        subject: "Biology",
        gradeLevel: "High School",
        thresholds: {},
        proposedConcepts: [],
        proposedEdges: [],
        proposedLessons: [],
        proposedUnits: [],
        proposedLessonAssessments: [],
      },
    };

    renderBootstrap();
    expect(screen.getByText("Biology 101")).toBeTruthy();
  });
});

describe("BootstrapTabBody — confirm card (draft-ready state)", () => {
  it("does NOT show confirm card when no draft is present", () => {
    _mockCurrentDraft = null;
    renderBootstrap();
    expect(screen.queryByTestId("confirm-card")).toBeNull();
  });

  it("does NOT show confirm card when draft has no lessons", () => {
    _mockCurrentDraft = {
      draftId: "d3",
      proposed: {
        title: "Empty Draft",
        subject: "X",
        gradeLevel: "K",
        thresholds: {},
        proposedConcepts: [],
        proposedEdges: [],
        proposedLessons: [],
        proposedUnits: [],
        proposedLessonAssessments: [],
      },
    };
    renderBootstrap();
    expect(screen.queryByTestId("confirm-card")).toBeNull();
  });

  it("shows confirm card once draft has at least one lesson", () => {
    _mockCurrentDraft = {
      draftId: "d4",
      proposed: {
        title: "Calculus I",
        subject: "Math",
        gradeLevel: "University",
        thresholds: {},
        proposedConcepts: [],
        proposedEdges: [],
        proposedLessons: [
          {
            draftLessonId: "l1",
            title: "Limits",
            conceptNames: [],
            references: [],
            suggestedStrategy: "direct",
            estimatedMinutes: 60,
          },
        ],
        proposedUnits: [],
        proposedLessonAssessments: [],
      },
    };
    renderBootstrap();
    expect(screen.getByTestId("confirm-card")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Confirm and open/i })).toBeTruthy();
  });
});
