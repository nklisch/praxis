/**
 * Tests for LibraryRoute (Unit 12).
 *
 * Verifies:
 * - Renders all four editorial section kickers
 * - Empty states per section when data is empty
 * - Course "Continue" CTA calls session.start then tabs.open then navigate
 * - Pack "Use this pack" calls packs.import then session.start then tabs.open
 * - Recent session click (no existing tab) calls tabs.open with the existing sessionId
 * - Recent session click (existing tab) calls tabs.touch and navigates without session.start
 */
import type {
  CourseSummary,
  DocumentSummary,
  PackSummaryClient,
  PraxisClient,
  SessionSummary,
  TabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { LibraryRoute } from "../routes/library.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// ── Mock TanStack Router ───────────────────────────────────────────────────────

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn().mockResolvedValue(undefined),
    useParams: () => ({}),
  };
});

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeCourse(): CourseSummary {
  return {
    courseId: brandId<"CourseId">("course-1"),
    title: "Algebra 1",
    subject: "mathematics",
    gradeLevel: "grade-8",
    lessonCount: 5,
    conceptCount: 20,
    studiedConcepts: 3,
    createdAt: Date.now() as Timestamp,
  };
}

function makePack(): PackSummaryClient {
  return {
    id: "algebra-1",
    version: "1.0.0",
    name: "Algebra 1 (CCSS)",
    subject: "math.algebra-1",
    gradeLevel: "9-12",
    conceptCount: 32,
    edgeCount: 40,
    imported: false,
  };
}

function makeDocument(): DocumentSummary {
  return {
    documentId: "doc-1",
    filename: "textbook.pdf",
    mimeType: "application/pdf",
    ingestorId: "pdf",
    ingestorLabel: "PDF",
    chunkCount: 10,
    createdAt: new Date().toISOString(),
    hasPageImages: false,
  };
}

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "teach",
    startedAt: (Date.now() - 60_000) as Timestamp,
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

interface MakeClientOpts {
  courses?: CourseSummary[];
  packs?: PackSummaryClient[];
  documents?: DocumentSummary[];
  sessions?: SessionSummary[];
  openTabs?: TabSummary[];
}

function makeClient(opts: MakeClientOpts = {}): PraxisClient {
  const { courses = [], packs = [], documents = [], sessions = [], openTabs = [] } = opts;

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
      courses: vi.fn().mockResolvedValue(courses),
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
      listAvailable: vi.fn().mockResolvedValue(packs),
      listImported: vi.fn().mockResolvedValue([]),
      import: vi.fn().mockResolvedValue({
        packId: "algebra-1",
        version: "1.0.0",
        conceptGraphId: "cg-1",
        importedAt: Date.now(),
      }),
    },
    documents: {
      list: vi.fn().mockResolvedValue(documents),
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
  });
}

function renderRoute(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <LibraryRoute />
    </PraxisClientProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("LibraryRoute", () => {
  it("renders the LIBRARY kicker", () => {
    const client = makeClient();
    renderRoute(client);
    expect(screen.getByText("LIBRARY")).toBeDefined();
  });

  it("renders editorial title and deck", () => {
    const client = makeClient();
    renderRoute(client);
    expect(screen.getByText("your library")).toBeDefined();
    expect(screen.getByText("what you have to work with")).toBeDefined();
  });

  it("renders all four section kickers", async () => {
    const client = makeClient();
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("COURSES")).toBeDefined();
      expect(screen.getByText("PACKS")).toBeDefined();
      expect(screen.getByText("DOCUMENTS")).toBeDefined();
      expect(screen.getByText("RECENT SESSIONS")).toBeDefined();
    });
  });

  it("shows courses empty state when no courses", async () => {
    const client = makeClient({ courses: [] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText(/No courses in progress/)).toBeDefined();
    });
  });

  it("shows packs empty state when no packs", async () => {
    const client = makeClient({ packs: [] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText(/No knowledge packs available/)).toBeDefined();
    });
  });

  it("shows documents empty state when no documents", async () => {
    const client = makeClient({ documents: [] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText(/No documents ingested/)).toBeDefined();
    });
  });

  it("shows sessions empty state when no recent sessions", async () => {
    const client = makeClient({ sessions: [] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText(/No recent sessions/)).toBeDefined();
    });
  });

  it("renders course list when courses present", async () => {
    const client = makeClient({ courses: [makeCourse()] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("Algebra 1")).toBeDefined();
    });
  });

  it("renders pack list when packs present", async () => {
    const client = makeClient({ packs: [makePack()] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("Algebra 1 (CCSS)")).toBeDefined();
    });
  });

  it("renders document list when documents present", async () => {
    const client = makeClient({ documents: [makeDocument()] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("textbook.pdf")).toBeDefined();
    });
  });

  it("renders recent session when sessions present", async () => {
    const client = makeClient({ sessions: [makeSession()] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("Explain fractions")).toBeDefined();
    });
  });

  it("'Continue' on a course calls session.start with modeId teach and courseId", async () => {
    const client = makeClient({ courses: [makeCourse()] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Continue/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({
        modeId: "teach",
        courseId: brandId<"CourseId">("course-1"),
      });
    });
  });

  it("'Continue' on a course calls tabs.open after session.start", async () => {
    const client = makeClient({ courses: [makeCourse()] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Continue/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(client.tabs.open).toHaveBeenCalled();
    });
  });

  it("'Use this pack' calls packs.import then session.start", async () => {
    const client = makeClient({ packs: [makePack()] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Use this pack/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Use this pack/i }));

    await waitFor(() => {
      expect(client.packs.import).toHaveBeenCalledWith("algebra-1");
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "bootstrap" });
    });
  });

  it("clicking a recent session (no open tab) calls tabs.open with the existing sessionId", async () => {
    const session = makeSession({ sessionId: brandId<"SessionId">("existing-session") });
    const client = makeClient({ sessions: [session], openTabs: [] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("Explain fractions")).toBeDefined();
    });

    // Click the session button (wraps the text)
    const button = screen.getByRole("button", { name: /teach/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(client.tabs.open).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "existing-session" }),
      );
    });

    // Should NOT start a new session
    expect(client.session.start).not.toHaveBeenCalled();
  });

  it("clicking a recent session with an existing open tab calls tabs.touch, not tabs.open", async () => {
    const sessionId = brandId<"SessionId">("session-open");
    const tabId = brandId<"TabId">("tab-open");
    const session = makeSession({ sessionId });
    const tab = makeTab({ id: tabId, sessionId });
    const client = makeClient({ sessions: [session], openTabs: [tab] });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("Explain fractions")).toBeDefined();
    });

    const button = screen.getByRole("button", { name: /teach/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(client.tabs.touch).toHaveBeenCalledWith(tabId);
    });

    // Should NOT open a new tab
    expect(client.tabs.open).not.toHaveBeenCalledWith(expect.objectContaining({ sessionId }));
  });
});
