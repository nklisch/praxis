/**
 * Layout regression tests for CourseCreateTabBody — Canvas + Side Chat shape.
 *
 * Guards the two-column structure (draft canvas left, authoring chat right)
 * introduced by the course-create tab body rebuild.
 *
 * jsdom has no real layout engine, so these tests verify DOM structure and
 * CSS-module class names as proxies for the layout invariants.
 */
import type { SessionTabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// Mutable draft state for parameterising useDrafts in tests.
let _mockCurrentDraft: unknown = null;
const mockOpenTab = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    kind: "session",
    id: "tab-new",
    sessionId: "session-new",
    modeId: "course-create",
    title: "course-create",
    sortOrder: 0,
    openedAt: 0,
    lastSeenAt: 0,
    closedAt: null,
  }),
);

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
vi.mock("../hooks/use-course-create-budget.js", () => ({
  COURSE_CREATE_BUDGET_MIN: 5,
  COURSE_CREATE_BUDGET_MAX: 200,
  useCourseCreateBudget: () => ({ maxSteps: 100, saving: false, setMaxSteps: vi.fn() }),
}));
vi.mock("../hooks/use-tabs.js", () => ({
  useTabs: () => ({
    openTab: mockOpenTab,
  }),
}));

// Import after mocks (Vitest hoists vi.mock calls).
const { CourseCreateTabBody } = await import("../components/course-create-tab-body.js");

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
    modeId: "course-create",
    title: "course-create",
    sortOrder: 0,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 5_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function renderCourseCreate() {
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
      <CourseCreateTabBody tab={makeTab()} />
    </PraxisClientProvider>,
  );
}

describe("CourseCreateTabBody — Canvas + Side Chat layout", () => {
  it("renders the draft canvas scroll region", () => {
    const { getByTestId } = renderCourseCreate();
    expect(getByTestId("draft-canvas-scroll")).toBeTruthy();
  });

  it("mounts AuthoringChatPane in course-create mode", () => {
    renderCourseCreate();
    const pane = screen.getByTestId("authoring-chat-pane");
    expect(pane).toBeTruthy();
    expect(pane.getAttribute("data-mode")).toBe("course-create");
  });

  it("canvas scroll and chat panel are siblings (not nested)", () => {
    const { getByTestId, container } = renderCourseCreate();
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
    renderCourseCreate();
    expect(screen.getByText(/the outline will appear here/i)).toBeTruthy();
  });

  it("renders the budget field", () => {
    renderCourseCreate();
    expect(screen.getByRole("spinbutton", { name: /course-design budget/i })).toBeTruthy();
  });

  it("returns the draft finalization stream on unmount", async () => {
    const streams: Array<{
      next: ReturnType<typeof vi.fn>;
      returnStream: ReturnType<typeof vi.fn>;
    }> = [];
    const client = makeFakeClient({
      subAgent: {
        list: vi.fn().mockResolvedValue([]),
        events: vi.fn(async function* () {}),
      } as unknown as ReturnType<typeof makeFakeClient>["subAgent"],
      author: {
        listConfiguratorActions: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof makeFakeClient>["author"],
      documentScopes: {
        listForScope: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof makeFakeClient>["documentScopes"],
      drafts: {
        events: vi.fn(() => {
          const next = vi.fn(() => new Promise<IteratorResult<never, void>>(() => {}));
          const returnStream = vi.fn().mockResolvedValue({ done: true, value: undefined });
          const iterator: AsyncIterator<never, void, unknown> = {
            next,
            return: returnStream,
          };
          streams.push({ next, returnStream });
          return {
            [Symbol.asyncIterator]: () => iterator,
          } as ReturnType<ReturnType<typeof makeFakeClient>["drafts"]["events"]>;
        }),
      } as unknown as ReturnType<typeof makeFakeClient>["drafts"],
    });

    const { unmount } = render(
      <PraxisClientProvider client={client}>
        <CourseCreateTabBody tab={makeTab()} />
      </PraxisClientProvider>,
    );

    await waitFor(() => expect(streams.length).toBeGreaterThan(0));
    const activeStream = streams[streams.length - 1];
    expect(activeStream).toBeDefined();
    await waitFor(() => expect(activeStream?.next).toHaveBeenCalled());
    const returnCallsBeforeUnmount = activeStream?.returnStream.mock.calls.length ?? 0;
    unmount();

    expect(activeStream?.returnStream.mock.calls.length).toBe(returnCallsBeforeUnmount + 1);
  });
});

describe("CourseCreateTabBody — draft canvas with units", () => {
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

    const { getAllByTestId } = renderCourseCreate();

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

    renderCourseCreate();
    expect(screen.getByText("Biology 101")).toBeTruthy();
  });
});

describe("CourseCreateTabBody — confirm card (draft-ready state)", () => {
  it("does NOT show confirm card when no draft is present", () => {
    _mockCurrentDraft = null;
    renderCourseCreate();
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
    renderCourseCreate();
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
    renderCourseCreate();
    expect(screen.getByTestId("confirm-card")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Confirm and open/i })).toBeTruthy();
  });
});
