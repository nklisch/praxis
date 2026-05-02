import type { Course, Lesson, PraxisClient, SessionHandle, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { CourseDetailRoute } from "../routes/course-detail.js";

const COURSE_ID = brandId<"CourseId">("course-abc");

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  useParams: () => ({ courseId: "course-abc" }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

afterEach(() => {
  cleanup();
});

function makeCourse(): Course {
  return {
    id: COURSE_ID,
    studentId: brandId<"StudentId">("student-1"),
    title: "Algebra 1",
    subject: brandId<"SubjectId">("mathematics"),
    gradeLevel: "grade-8" as import("@praxis/core/types").GradeBand,
    source: { kind: "bootstrapped", sourceMaterials: [] },
    lessons: [],
    conceptGraphId: brandId<"ConceptGraphId">("cg-1"),
    gates: [],
    thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
    createdAt: Date.now() as Timestamp,
    updatedAt: Date.now() as Timestamp,
  };
}

function makeLesson(id: string, title: string, conceptCount: number, minutes: number): Lesson {
  return {
    id: brandId<"LessonId">(id),
    courseId: COURSE_ID,
    title,
    conceptIds: Array.from({ length: conceptCount }, (_, i) =>
      brandId<"ConceptId">(`concept-${id}-${i}`),
    ),
    references: [],
    suggestedStrategy: brandId<"StrategyId">("worked-example"),
    estimatedMinutes: minutes,
  };
}

function makeClient(
  course: Course | null = makeCourse(),
  lessons: Lesson[] = [
    makeLesson("l1", "Variables and Expressions", 3, 45),
    makeLesson("l2", "Solving Linear Equations", 2, 60),
  ],
  sessionStart?: ReturnType<typeof vi.fn>,
): PraxisClient {
  const startFn =
    sessionStart ??
    vi.fn().mockResolvedValue({
      sessionId: brandId<"SessionId">("s1"),
      modeId: "teach",
      startedAt: Date.now() as Timestamp,
    } satisfies SessionHandle);

  return {
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: startFn as PraxisClient["session"]["start"],
      end: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("s1"),
        endedAt: Date.now() as Timestamp,
        unlockedGates: [],
        newMisconceptions: 0,
      }),
      send: vi.fn(),
    },
    artifacts: {
      courses: vi.fn().mockResolvedValue([]),
      course: vi.fn().mockResolvedValue(course),
      lessons: vi.fn().mockResolvedValue(lessons),
      gates: vi.fn().mockResolvedValue([]),
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
      <CourseDetailRoute />
    </PraxisClientProvider>,
  );
}

describe("CourseDetailRoute", () => {
  it("renders course title after load", async () => {
    renderRoute(makeClient());

    await waitFor(() => {
      expect(screen.getByText("Algebra 1")).toBeDefined();
    });
  });

  it("renders lesson list in order", async () => {
    renderRoute(makeClient());

    await waitFor(() => {
      expect(screen.getByText("Variables and Expressions")).toBeDefined();
      expect(screen.getByText("Solving Linear Equations")).toBeDefined();
    });

    // Lesson index labels should appear
    expect(screen.getByText("Lesson 1")).toBeDefined();
    expect(screen.getByText("Lesson 2")).toBeDefined();
  });

  it("renders lesson metadata (concepts + minutes)", async () => {
    renderRoute(makeClient());

    await waitFor(() => {
      expect(screen.getByText(/3 concepts/)).toBeDefined();
      expect(screen.getByText(/~45 min/)).toBeDefined();
    });
  });

  it("renders the Start session button", async () => {
    renderRoute(makeClient());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start session/i })).toBeDefined();
    });
  });

  it("Start session button calls session.start with modeId: teach and courseId", async () => {
    const startFn = vi.fn().mockResolvedValue({
      sessionId: brandId<"SessionId">("s2"),
      modeId: "teach",
      startedAt: Date.now() as Timestamp,
    } satisfies SessionHandle);
    const client = makeClient(makeCourse(), undefined, startFn);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start session/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Start session/i }));

    await waitFor(() => {
      expect(startFn).toHaveBeenCalledWith({ modeId: "teach", courseId: COURSE_ID });
    });
  });

  it("shows loading state initially", () => {
    renderRoute(makeClient());
    expect(screen.getByText("Loading…")).toBeDefined();
  });

  it("shows 'Course not found' when course is null", async () => {
    renderRoute(makeClient(null, []));

    await waitFor(() => {
      expect(screen.getByText("Course not found.")).toBeDefined();
    });
  });
});
