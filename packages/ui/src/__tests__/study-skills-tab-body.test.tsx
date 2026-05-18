/**
 * StudySkillsTabBody — render tests.
 *
 * 1. Head kicker renders "study skills".
 * 2. Composer is present (TeachChatTabBody is embedded).
 * 3. Metacognitive prompt banner renders.
 * 4. Rail sections render: active-technique, observed-patterns, review-queue.
 * 5. ChatTabBody dispatcher routes modeId 'study-skills' to this component.
 * 6. Switching teach → study-skills → teach preserves chip isolation.
 */
import type {
  AffectiveModel,
  Flashcard,
  PraxisClient,
  ProceduralModel,
  StudentId,
  TabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatTabBody } from "../components/chat-tab-body.js";
import { StudySkillsTabBody } from "../components/study-skills-tab-body.js";
import { AuthProvider } from "../context/auth-context.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ tabId: undefined }),
    useSearch: () => ({}),
  };
});

vi.mock("tldraw", () => ({ Tldraw: () => <div data-testid="tldraw-canvas" /> }));
vi.mock("tldraw/tldraw.css", () => ({}));

function makeTab(overrides: Partial<TabSummary> = {}): TabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "study-skills",
    title: "study skills · coaching",
    sortOrder: 0,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 5_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function makeFakeProceduralModel(): ProceduralModel {
  const strategies = new Map();
  strategies.set("feynman", {
    strategyId: "feynman",
    preference: 0.8,
    evidenceCount: 3,
  });
  strategies.set("cornell-notes", {
    strategyId: "cornell-notes",
    preference: 0.4,
    evidenceCount: 2,
  });
  return { studentId: brandId<"StudentId">("student-1"), strategies };
}

function makeFakeAffectiveModel(): AffectiveModel {
  return {
    studentId: brandId<"StudentId">("student-1"),
    recent: [
      {
        ts: (Date.now() - 3000) as Timestamp,
        source: "model-inferred",
        engagement: 0.75,
        frustration: 0.2,
        confidence: 0.65,
      },
    ],
    baseline: { engagement: 0.6, frustration: 0.3, confidence: 0.5 },
  };
}

function makeFakeDueCards(): Flashcard[] {
  return [
    {
      id: brandId<"FlashcardId">("card-1"),
      studentId: brandId<"StudentId">("student-1") as unknown as StudentId,
      conceptId: brandId<"ConceptId">("derivatives"),
      front: "What is the chain rule?",
      back: "d/dx[f(g(x))] = f'(g(x)) · g'(x)",
      source: { kind: "authored" },
      reviewState: {
        algorithm: "fsrs",
        state: {},
        nextReviewAt: (Date.now() - 1000) as Timestamp,
      },
    } as unknown as Flashcard,
  ];
}

function makeClient(overrides?: Partial<PraxisClient>): PraxisClient {
  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("session-1"),
        modeId: "study-skills",
        startedAt: Date.now() as Timestamp,
      }),
      end: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("session-1"),
        endedAt: Date.now() as Timestamp,
        unlockedGates: [],
        newMisconceptions: 0,
      }),
      send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
      list: vi.fn().mockResolvedValue([]),
      spawnFromAssignment: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("child-1"),
        modeId: "study-skills",
        startedAt: Date.now() as Timestamp,
      }),
    },
    memory: {
      episodic: vi.fn(async function* () {}),
      studentModel: vi.fn().mockResolvedValue(null),
      misconceptions: vi.fn().mockResolvedValue([]),
      procedural: vi.fn().mockResolvedValue(makeFakeProceduralModel()),
      affective: vi.fn().mockResolvedValue(makeFakeAffectiveModel()),
      export: vi.fn(),
      delete: vi.fn(),
    } as unknown as PraxisClient["memory"],
    flashcards: {
      list: vi.fn().mockResolvedValue(makeFakeDueCards()),
      dueCount: vi.fn().mockResolvedValue(1),
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      review: vi.fn(),
    } as unknown as PraxisClient["flashcards"],
    assignments: {
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      getResponses: vi.fn().mockResolvedValue([]),
      recordResponse: vi.fn().mockResolvedValue(undefined),
      submit: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  });
}

function renderWithProviders(ui: React.ReactElement, client: PraxisClient = makeClient()) {
  return render(
    <PraxisClientProvider client={client}>
      <AuthProvider>{ui}</AuthProvider>
    </PraxisClientProvider>,
  );
}

// ── Basic render ──────────────────────────────────────────────────────────────

describe("StudySkillsTabBody", () => {
  it("renders 'study skills' in the head kicker", () => {
    const tab = makeTab();
    renderWithProviders(<StudySkillsTabBody tab={tab} />);
    expect(screen.getAllByText("study skills").length).toBeGreaterThan(0);
  });

  it("renders the chat composer (TeachChatTabBody is embedded)", () => {
    const tab = makeTab();
    renderWithProviders(<StudySkillsTabBody tab={tab} />);
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("renders the metacognitive prompt banner", () => {
    const tab = makeTab();
    renderWithProviders(<StudySkillsTabBody tab={tab} />);
    expect(screen.getByRole("note")).toBeDefined();
    // Banner contains the label text.
    expect(screen.getByText(/metacognitive prompt/i)).toBeDefined();
  });
});

// ── Rail sections ─────────────────────────────────────────────────────────────

describe("StudySkillsTabBody — right rail sections", () => {
  it("renders the rail container", () => {
    const tab = makeTab();
    renderWithProviders(<StudySkillsTabBody tab={tab} />);
    expect(screen.getByTestId("study-skills-rail")).toBeDefined();
  });

  it("renders the active-technique section", () => {
    const tab = makeTab();
    renderWithProviders(<StudySkillsTabBody tab={tab} />);
    expect(screen.getByTestId("active-technique")).toBeDefined();
  });

  it("renders the observed-patterns section", () => {
    const tab = makeTab();
    renderWithProviders(<StudySkillsTabBody tab={tab} />);
    expect(screen.getByTestId("observed-patterns")).toBeDefined();
  });

  it("renders the review-queue section", () => {
    const tab = makeTab();
    renderWithProviders(<StudySkillsTabBody tab={tab} />);
    expect(screen.getByTestId("review-queue")).toBeDefined();
  });
});

// ── Prompt sequence ───────────────────────────────────────────────────────────

describe("StudySkillsTabBody — metacognitive prompt sequence", () => {
  it("renders prompt citation text", () => {
    const tab = makeTab();
    renderWithProviders(<StudySkillsTabBody tab={tab} />);
    expect(screen.getByText(/Schraw 2006/)).toBeDefined();
  });

  it("renders prompt trigger label", () => {
    const tab = makeTab();
    renderWithProviders(<StudySkillsTabBody tab={tab} />);
    expect(screen.getByText(/metacognitive prompt/i)).toBeDefined();
  });
});

// ── ChatTabBody dispatcher routes study-skills ────────────────────────────────

describe("ChatTabBody dispatcher routes study-skills", () => {
  it("renders 'study skills' for modeId 'study-skills'", () => {
    const tab = makeTab({ modeId: "study-skills" });
    renderWithProviders(<ChatTabBody tab={tab} />);
    expect(screen.getAllByText("study skills").length).toBeGreaterThan(0);
  });

  it("renders the chat composer when modeId is 'study-skills'", () => {
    const tab = makeTab({ modeId: "study-skills" });
    renderWithProviders(<ChatTabBody tab={tab} />);
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("renders the right rail when dispatched via ChatTabBody", () => {
    const tab = makeTab({ modeId: "study-skills" });
    renderWithProviders(<ChatTabBody tab={tab} />);
    expect(screen.getByTestId("study-skills-rail")).toBeDefined();
  });
});

// ── Tab-state isolation ───────────────────────────────────────────────────────

describe("Tab-state isolation — teach ↔ study-skills chip parity", () => {
  /**
   * Asserts the no-bleed invariant: switching teach → study-skills → teach
   * must NOT leave study-skills chip state behind in the teach render.
   *
   * ChatTabBody is a pure dispatcher — rerendering with a different modeId
   * swaps the entire child tree, so state isolation is structural. The test
   * pins this invariant so a future refactor (e.g. keep-alive) can't
   * silently break it.
   */
  it("switching teach → study-skills → teach preserves chip absence vs presence per tab", () => {
    const client = makeClient();
    const teachTab = makeTab({ modeId: "teach", title: "teach session" });
    const studySkillsTab = makeTab({ modeId: "study-skills", title: "study skills session" });

    // 1. Start with a teach tab — no study-skills chip.
    const { rerender } = renderWithProviders(<ChatTabBody tab={teachTab} />, client);
    expect(screen.queryByText("study skills")).toBeNull();

    // 2. Switch to study-skills — chip appears.
    rerender(
      <PraxisClientProvider client={client}>
        <AuthProvider>
          <ChatTabBody tab={studySkillsTab} />
        </AuthProvider>
      </PraxisClientProvider>,
    );
    expect(screen.getAllByText("study skills").length).toBeGreaterThan(0);

    // 3. Switch back to teach — chip must be gone; no bleed.
    rerender(
      <PraxisClientProvider client={client}>
        <AuthProvider>
          <ChatTabBody tab={teachTab} />
        </AuthProvider>
      </PraxisClientProvider>,
    );
    expect(screen.queryByText("study skills")).toBeNull();
  });
});
