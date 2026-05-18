/**
 * Tests for LibraryRoute — the Workbench.
 *
 * Verifies:
 * - Greeting renders with time-of-day text and count of ready things
 * - What's-next queue renders recommendation rows (and empty state)
 * - Lately timeline renders session entries grouped by day
 * - Footer cards render (packs / concept maps / documents)
 * - "+ Create a course" CTA triggers bootstrap session
 * - Timeline session click calls tabs.open (or switchTo if open)
 * - Recommendation CTA clicks dispatch to correct surface
 */
import type {
  PraxisClient,
  Recommendation,
  SessionSummary,
  TabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { TabsProvider } from "../context/tabs-context.js";
import { LibraryRoute } from "../routes/library.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// ── Mock TanStack Router ───────────────────────────────────────────────────────

const mockNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({}),
  };
});

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "teach",
    startedAt: Date.now() as Timestamp,
    endedAt: null,
    firstUserMessage: "Explain fractions",
    ...overrides,
  };
}

function makeTab(overrides: Partial<TabSummary> = {}): TabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "teach",
    title: "algebra · teach",
    sortOrder: 0,
    openedAt: Date.now() as Timestamp,
    lastSeenAt: Date.now() as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

const RESUME_REC: Recommendation = {
  kind: "resume_session",
  sessionId: brandId<"SessionId">("session-resume"),
  mode: "teach",
  lastTouchedAt: Date.now() as Timestamp,
  reason: "You stopped mid-lesson.",
  score: 0.95,
};

const REVIEW_REC: Recommendation = {
  kind: "review_cards",
  courseId: brandId<"CourseId">("course-1"),
  dueNow: 5,
  dueIn24h: 3,
  reason: "5 cards due today.",
  score: 0.8,
};

const DRAFT_REC: Recommendation = {
  kind: "resume_draft",
  draftId: "draft-1" as import("@praxis/core/types").DraftId,
  lastTouchedAt: Date.now() as Timestamp,
  reason: "Draft is ready to review.",
  score: 0.6,
};

interface MakeClientOpts {
  sessions?: SessionSummary[];
  openTabs?: TabSummary[];
  recommendations?: Recommendation[];
}

function makeClient(opts: MakeClientOpts = {}): PraxisClient {
  const { sessions = [], openTabs = [], recommendations = [] } = opts;

  const newTab = makeTab({ id: brandId<"TabId">("tab-new") });

  return makeFakeClient({
    session: {
      start: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("session-new"),
        modeId: "teach",
        startedAt: Date.now() as Timestamp,
      }),
      end: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("s"),
        endedAt: Date.now() as Timestamp,
        unlockedGates: [],
        newMisconceptions: 0,
      }),
      send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
      active: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue(sessions),
    },
    tabs: {
      // biome-ignore lint/suspicious/noExplicitAny: studentId ignored on client
      listOpen: vi.fn().mockResolvedValue(openTabs) as any,
      // biome-ignore lint/suspicious/noExplicitAny: studentId ignored on client
      list: vi.fn().mockResolvedValue(openTabs) as any,
      get: vi.fn().mockResolvedValue(null),
      // biome-ignore lint/suspicious/noExplicitAny: studentId resolved server-side
      open: vi.fn().mockResolvedValue(newTab) as any,
      reopen: vi.fn().mockResolvedValue(newTab),
      close: vi.fn().mockResolvedValue(undefined),
      touch: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(newTab),
    },
    artifacts: {
      courses: vi.fn().mockResolvedValue([]),
      course: vi.fn().mockResolvedValue(null),
      lessons: vi.fn().mockResolvedValue([]),
      gates: vi.fn().mockResolvedValue([]),
      progress: vi
        .fn()
        .mockResolvedValue({ studentId: "s", courseProgress: [], recentUnlocks: [] }),
      flashcards: vi.fn().mockResolvedValue([]),
      notes: vi.fn().mockResolvedValue([]),
      gateView: vi.fn().mockResolvedValue([]),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
      concepts: vi.fn().mockResolvedValue([]),
    } as PraxisClient["artifacts"],
    packs: {
      listAvailable: vi.fn().mockResolvedValue([]),
      listImported: vi.fn().mockResolvedValue([]),
      import: vi.fn().mockResolvedValue({
        packId: "algebra-1",
        version: "1.0.0",
        conceptGraphId: "cg-1",
        importedAt: Date.now(),
      }),
    },
    documents: {
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      pageImage: vi.fn().mockResolvedValue(null),
    } as unknown as PraxisClient["documents"],
    ingest: {
      pickFile: vi.fn().mockResolvedValue(null),
      start: vi.fn(async function* () {}) as unknown as PraxisClient["ingest"]["start"],
      isAvailable: vi.fn().mockReturnValue(false),
    },
    flashcards: {
      dueCount: vi.fn().mockResolvedValue(0),
    } as unknown as PraxisClient["flashcards"],
    recommendations: {
      next: vi.fn().mockResolvedValue(recommendations),
    },
  });
}

function renderRoute(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <TabsProvider>
        <LibraryRoute />
      </TabsProvider>
    </PraxisClientProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("LibraryRoute — Workbench", () => {
  // ── Greeting ────────────────────────────────────────────────────────────────

  it("renders a time-of-day greeting", () => {
    renderRoute(makeClient());
    // Should contain "Good morning/afternoon/evening"
    expect(screen.getByText(/Good (morning|afternoon|evening)\./)).toBeDefined();
  });

  it("shows 'You're all caught up.' when no recommendations", async () => {
    renderRoute(makeClient({ recommendations: [] }));
    await waitFor(() => {
      expect(screen.getByText(/You're all caught up\./)).toBeDefined();
    });
  });

  it("shows count of ready things when recommendations exist", async () => {
    renderRoute(makeClient({ recommendations: [RESUME_REC, REVIEW_REC] }));
    await waitFor(() => {
      expect(screen.getByText(/two things/i)).toBeDefined();
    });
  });

  it("shows 'one thing' (singular) for exactly one recommendation", async () => {
    renderRoute(makeClient({ recommendations: [RESUME_REC] }));
    await waitFor(() => {
      expect(screen.getByText(/one thing/i)).toBeDefined();
    });
  });

  // ── What's-next queue ────────────────────────────────────────────────────────

  it("renders 'What's next' column heading", async () => {
    renderRoute(makeClient());
    await waitFor(() => {
      expect(screen.getByText(/What's next/i)).toBeDefined();
    });
  });

  it("renders recommendation rows when recs exist", async () => {
    renderRoute(makeClient({ recommendations: [RESUME_REC, REVIEW_REC] }));
    await waitFor(() => {
      // ResumeSession shows "Resume ↵" CTA
      expect(screen.getByRole("button", { name: /Resume/i })).toBeDefined();
    });
  });

  it("shows '+ Create a course' link in empty queue state", async () => {
    renderRoute(makeClient({ recommendations: [] }));
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /\+ Create a course/i }).length).toBeGreaterThan(
        0,
      );
    });
  });

  it("'+ Create a course' navigates to /course-create upload screen", async () => {
    const client = makeClient({ recommendations: [] });
    renderRoute(client);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /\+ Create a course/i }).length).toBeGreaterThan(
        0,
      );
    });
    // Click the first one (in the empty queue state)
    const createBtns = screen.getAllByRole("button", { name: /\+ Create a course/i });
    fireEvent.click(createBtns[0] as HTMLElement);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/course-create" });
    });
  });

  // ── Lately timeline ──────────────────────────────────────────────────────────

  it("renders 'Lately' column heading", async () => {
    renderRoute(makeClient());
    await waitFor(() => {
      expect(screen.getByText(/Lately/i)).toBeDefined();
    });
  });

  it("shows 'No sessions yet' empty state when no sessions", async () => {
    renderRoute(makeClient({ sessions: [] }));
    await waitFor(() => {
      expect(screen.getByText(/No sessions yet/i)).toBeDefined();
    });
  });

  it("renders session entries in the timeline", async () => {
    renderRoute(makeClient({ sessions: [makeSession()] }));
    await waitFor(() => {
      // The timeline groups sessions; "Today" should appear
      expect(screen.getByText("Today")).toBeDefined();
    });
  });

  it("renders session first message in timeline title", async () => {
    renderRoute(makeClient({ sessions: [makeSession()] }));
    await waitFor(() => {
      expect(screen.getByText(/Explain fractions/i)).toBeDefined();
    });
  });

  it("clicking a timeline session (no existing tab) calls tabs.open", async () => {
    const session = makeSession({ sessionId: brandId<"SessionId">("existing-session") });
    const client = makeClient({ sessions: [session], openTabs: [] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText(/Explain fractions/i)).toBeDefined();
    });

    const sessionBtn = screen.getByRole("button", { name: /Open teach session/i });
    fireEvent.click(sessionBtn);

    await waitFor(() => {
      expect(client.tabs.open).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "existing-session" }),
      );
    });
    expect(client.session.start).not.toHaveBeenCalled();
  });

  it("clicking a timeline session with open tab calls tabs.touch (switchTo), not tabs.open", async () => {
    const sessionId = brandId<"SessionId">("session-open");
    const tabId = brandId<"TabId">("tab-open");
    const session = makeSession({ sessionId });
    const tab = makeTab({ id: tabId, sessionId });
    const client = makeClient({ sessions: [session], openTabs: [tab] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText(/Explain fractions/i)).toBeDefined();
    });

    const sessionBtn = screen.getByRole("button", { name: /Open teach session/i });
    fireEvent.click(sessionBtn);

    await waitFor(() => {
      expect(client.tabs.touch).toHaveBeenCalledWith(tabId);
    });
    expect(client.tabs.open).not.toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-open" }),
    );
  });

  // ── Footer cards ─────────────────────────────────────────────────────────────

  it("renders Packs footer card", async () => {
    renderRoute(makeClient());
    await waitFor(() => {
      expect(screen.getByText(/Packs available/i)).toBeDefined();
    });
  });

  it("renders Concept maps footer card", async () => {
    renderRoute(makeClient());
    await waitFor(() => {
      // Heading text is "‡ Concept maps" — use open concept maps button as the probe
      expect(screen.getByRole("button", { name: /open concept maps/i })).toBeDefined();
    });
  });

  it("renders Documents footer card", async () => {
    renderRoute(makeClient());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /\+ attach a document/i })).toBeDefined();
    });
  });

  it("Packs footer card has '+ Create a course ↗' link", async () => {
    renderRoute(makeClient());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /\+ Create a course ↗/i })).toBeDefined();
    });
  });

  it("concept maps footer 'open concept maps' navigates to /concept-maps", async () => {
    renderRoute(makeClient());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open concept maps/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /open concept maps/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/concept-maps" }));
    });
  });

  // ── Recommendation dispatch ──────────────────────────────────────────────────

  it("resume_session rec: clicking 'Resume' opens the session tab", async () => {
    const client = makeClient({ recommendations: [RESUME_REC] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Resume/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /Resume ↵/i }));

    await waitFor(() => {
      expect(client.tabs.open).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "session-resume" }),
      );
    });
  });

  it("review_cards rec: clicking CTA opens study-skills session", async () => {
    const client = makeClient({ recommendations: [REVIEW_REC] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Review 5 cards/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /Review 5 cards/i }));

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith(
        expect.objectContaining({ modeId: "study-skills" }),
      );
    });
  });

  it("resume_draft rec: clicking CTA opens bootstrap session", async () => {
    const client = makeClient({ recommendations: [DRAFT_REC] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Review draft/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /Review draft/i }));

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "bootstrap" });
    });
  });
});
