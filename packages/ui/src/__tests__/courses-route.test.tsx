import type { CourseSummary, PraxisClient, SessionHandle, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { CoursesRoute } from "../routes/courses.js";

// TanStack Router hooks used in CoursesRoute — mock at module level.
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

afterEach(() => {
  cleanup();
});

function makeSummary(overrides: Partial<CourseSummary> = {}): CourseSummary {
  return {
    courseId: brandId<"CourseId">("course-1"),
    title: "Algebra 1",
    subject: "mathematics",
    gradeLevel: "grade-8",
    lessonCount: 10,
    conceptCount: 30,
    studiedConcepts: 5,
    createdAt: Date.now() as Timestamp,
    ...overrides,
  };
}

function makeClient(
  coursesResult: CourseSummary[] = [],
  sessionOverride?: Partial<PraxisClient["session"]>,
): PraxisClient {
  const session: PraxisClient["session"] = {
    active: vi.fn().mockResolvedValue(null),
    start: vi.fn().mockResolvedValue({
      sessionId: brandId<"SessionId">("s1"),
      modeId: "bootstrap",
      startedAt: Date.now() as Timestamp,
    } satisfies SessionHandle),
    end: vi.fn().mockResolvedValue({
      sessionId: brandId<"SessionId">("s1"),
      endedAt: Date.now() as Timestamp,
      unlockedGates: [],
      newMisconceptions: 0,
    }),
    send: vi.fn(),
    ...sessionOverride,
  };

  return {
    session,
    artifacts: {
      courses: vi.fn().mockResolvedValue(coursesResult),
      course: vi.fn(),
      lessons: vi.fn(),
      gates: vi.fn(),
      progress: vi.fn(),
      flashcards: vi.fn(),
      notes: vi.fn(),
      conceptMaps: vi.fn(),
      // Phase 9 methods
      gateView: vi.fn().mockResolvedValue([]),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
      // Phase 10
      concepts: vi.fn().mockResolvedValue([]),
    } as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    // biome-ignore lint/suspicious/noExplicitAny: Phase 10 placeholder
    packs: {} as PraxisClient["packs"],
    notes: {} as PraxisClient["notes"],
    flashcards: {} as PraxisClient["flashcards"],
    claudeAuth: {} as PraxisClient["claudeAuth"],
    shell: {} as PraxisClient["shell"],
  };
}

function renderRoute(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <CoursesRoute />
    </PraxisClientProvider>,
  );
}

describe("CoursesRoute", () => {
  it("renders the page title", async () => {
    const client = makeClient([]);
    renderRoute(client);
    expect(screen.getByText("Courses")).toBeDefined();
  });

  it("shows empty state when there are no courses", async () => {
    const client = makeClient([]);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText(/No courses yet/)).toBeDefined();
    });
  });

  it("renders a list of courses", async () => {
    const client = makeClient([
      makeSummary({ title: "Algebra 1", courseId: brandId<"CourseId">("c1") }),
      makeSummary({ title: "Biology 101", courseId: brandId<"CourseId">("c2") }),
    ]);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("Algebra 1")).toBeDefined();
      expect(screen.getByText("Biology 101")).toBeDefined();
    });
  });

  it("renders the New course button", async () => {
    const client = makeClient([]);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /\+ New course/i })).toBeDefined();
    });
  });

  it("New course button calls session.start with modeId: bootstrap", async () => {
    const client = makeClient([]);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /\+ New course/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /\+ New course/i }));

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "bootstrap" });
    });
  });
});
