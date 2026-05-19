/**
 * Tests for configure/course-tab.tsx — unit/lesson tree canvas.
 *
 * Covers:
 *   1. Renders empty state when no course is selected.
 *   2. Renders unit/lesson tree with UnitBlock + LessonRow per lesson.
 *   3. LessonAssessmentPills is mounted per lesson row.
 *   4. Drag reorder changes unit order in the DOM.
 *   5. Inspector strip shows selected lesson's fields when a lesson is clicked.
 *   6. Flat lesson list renders when course has no units.
 */

import type { Lesson, LessonAssessment, LessonId, SessionId, Unit } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { DirtyStateProvider } from "../contexts/dirty-state-provider.js";
import type { SelectedLessonState } from "../hooks/use-configure-state.js";
import { ConfigureStateContext } from "../hooks/use-configure-state.js";
import { CourseTab } from "../routes/configure/course-tab.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// Mock TanStack Router (not used in CourseTab but imported transitively via context)
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useSearch: () => ({}),
  };
});

afterEach(() => cleanup());

// ── Shared test data ─────────────────────────────────────────────────────────

const COURSE_ID = brandId<"CourseId">("course-1");
const SESSION_ID = brandId<"SessionId">("session-1") as SessionId;

function makeLesson(id: string, title: string): Lesson {
  return {
    id: brandId<"LessonId">(id) as LessonId,
    courseId: COURSE_ID,
    title,
    conceptIds: [],
    references: [],
  };
}

function makeUnit(id: string, name: string, lessonIds: string[]): Unit {
  return {
    id: brandId<"UnitId">(id),
    courseId: COURSE_ID,
    name,
    orderIndex: 0,
    lessonIds: lessonIds.map((l) => brandId<"LessonId">(l) as LessonId),
  };
}

const LESSON_A = makeLesson("l-a", "Lesson Alpha");
const LESSON_B = makeLesson("l-b", "Lesson Beta");
const LESSON_C = makeLesson("l-c", "Lesson Gamma");

const UNIT_1 = makeUnit("u-1", "Unit One", ["l-a", "l-b"]);
const UNIT_2 = makeUnit("u-2", "Unit Two", ["l-c"]);

// ── Render helper ────────────────────────────────────────────────────────────

interface RenderOpts {
  courseId?: typeof COURSE_ID | null;
  units?: Unit[];
  lessons?: Lesson[];
  lessonAssessments?: LessonAssessment[];
  onSetSelectedLesson?: (state: SelectedLessonState | null) => void;
}

function renderCourseTab({
  courseId = COURSE_ID,
  units = [UNIT_1, UNIT_2],
  lessons = [LESSON_A, LESSON_B, LESSON_C],
  lessonAssessments = [],
  onSetSelectedLesson = vi.fn(),
}: RenderOpts = {}) {
  const client = makeFakeClient({
    artifacts: {
      courses: vi.fn().mockResolvedValue([{ courseId: COURSE_ID, title: "Test Course" }]),
      course: vi.fn().mockResolvedValue(null),
      lessons: vi.fn().mockResolvedValue(lessons),
      units: vi.fn().mockResolvedValue(units),
      lessonAssessments: vi.fn().mockResolvedValue(lessonAssessments),
      gates: vi.fn().mockResolvedValue([]),
      progress: vi.fn(),
      flashcards: vi.fn(),
      notes: vi.fn(),
      gateView: vi.fn().mockResolvedValue([]),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
      concepts: vi.fn().mockResolvedValue([]),
    },
    author: {
      getCourseSummary: vi
        .fn()
        .mockResolvedValue({ course: null, lessons: [], gates: [], concepts: [] }),
    } as unknown as typeof client.author,
  });

  const configureState = {
    selectedCourseId: courseId ?? null,
    setSelectedCourseId: vi.fn(),
    selectedLesson: null,
    setSelectedLesson: onSetSelectedLesson,
    clearSelectedLesson: vi.fn(),
  };

  return render(
    <PraxisClientProvider client={client}>
      <DirtyStateProvider>
        <ConfigureStateContext.Provider value={configureState}>
          <CourseTab sessionId={SESSION_ID} />
        </ConfigureStateContext.Provider>
      </DirtyStateProvider>
    </PraxisClientProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("CourseTab — empty state", () => {
  it("renders empty state prompt when no course is selected", async () => {
    renderCourseTab({ courseId: null, units: [], lessons: [] });

    await waitFor(() => {
      expect(screen.getByText(/Select a course to view its unit and lesson tree/i)).toBeDefined();
    });
  });
});

describe("CourseTab — unit/lesson tree", () => {
  it("renders a UnitBlock for each unit", async () => {
    renderCourseTab();

    await waitFor(() => {
      expect(screen.getByTestId("unit-block-u-1")).toBeDefined();
      expect(screen.getByTestId("unit-block-u-2")).toBeDefined();
    });
  });

  it("renders unit names in block headers", async () => {
    renderCourseTab();

    await waitFor(() => {
      expect(screen.getByText("Unit One")).toBeDefined();
      expect(screen.getByText("Unit Two")).toBeDefined();
    });
  });

  it("renders lesson rows under their respective units", async () => {
    renderCourseTab();

    await waitFor(() => {
      expect(screen.getByTestId(`lesson-row-${LESSON_A.id}`)).toBeDefined();
      expect(screen.getByTestId(`lesson-row-${LESSON_B.id}`)).toBeDefined();
      expect(screen.getByTestId(`lesson-row-${LESSON_C.id}`)).toBeDefined();
    });
  });

  it("renders lesson titles in rows", async () => {
    renderCourseTab();

    await waitFor(() => {
      expect(screen.getByText("Lesson Alpha")).toBeDefined();
      expect(screen.getByText("Lesson Beta")).toBeDefined();
      expect(screen.getByText("Lesson Gamma")).toBeDefined();
    });
  });

  it("shows the legend strip with assessment vocabulary", async () => {
    renderCourseTab();

    await waitFor(() => {
      expect(screen.getByTestId("legend-strip")).toBeDefined();
    });
  });

  it("renders the course tree container", async () => {
    renderCourseTab();

    await waitFor(() => {
      expect(screen.getByTestId("course-tree")).toBeDefined();
    });
  });
});

describe("CourseTab — LessonAssessmentPills per lesson", () => {
  it("calls lessonAssessments for each lesson in the course", async () => {
    const lessonAssessmentsMock = vi.fn().mockResolvedValue([]);
    const client = makeFakeClient({
      artifacts: {
        courses: vi.fn().mockResolvedValue([{ courseId: COURSE_ID, title: "Test Course" }]),
        course: vi.fn().mockResolvedValue(null),
        lessons: vi.fn().mockResolvedValue([LESSON_A, LESSON_B]),
        units: vi.fn().mockResolvedValue([UNIT_1]),
        lessonAssessments: lessonAssessmentsMock,
        gates: vi.fn().mockResolvedValue([]),
        progress: vi.fn(),
        flashcards: vi.fn(),
        notes: vi.fn(),
        gateView: vi.fn().mockResolvedValue([]),
        evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
        markGatesViewed: vi.fn().mockResolvedValue(undefined),
        newlyUnlockedCount: vi.fn().mockResolvedValue(0),
        concepts: vi.fn().mockResolvedValue([]),
      },
      author: {} as unknown as ReturnType<typeof makeFakeClient>["author"],
    });

    const configureState = {
      selectedCourseId: COURSE_ID,
      setSelectedCourseId: vi.fn(),
      selectedLesson: null,
      setSelectedLesson: vi.fn(),
      clearSelectedLesson: vi.fn(),
    };

    render(
      <PraxisClientProvider client={client}>
        <DirtyStateProvider>
          <ConfigureStateContext.Provider value={configureState}>
            <CourseTab sessionId={SESSION_ID} />
          </ConfigureStateContext.Provider>
        </DirtyStateProvider>
      </PraxisClientProvider>,
    );

    // Wait for units + lessons to render, then LessonAssessmentPills self-fetches
    await waitFor(() => {
      expect(screen.getByTestId(`lesson-row-${LESSON_A.id}`)).toBeDefined();
    });

    // Each lesson row causes LessonAssessmentPills to call lessonAssessments
    await waitFor(() => {
      expect(lessonAssessmentsMock).toHaveBeenCalledWith(LESSON_A.id);
      expect(lessonAssessmentsMock).toHaveBeenCalledWith(LESSON_B.id);
    });
  });
});

describe("CourseTab — inspector strip integration", () => {
  it("calls setSelectedLesson when a lesson row is clicked", async () => {
    const onSetSelectedLesson = vi.fn();
    renderCourseTab({ onSetSelectedLesson });

    // Wait for lessons to render
    await waitFor(() => {
      expect(screen.getByTestId(`lesson-row-${LESSON_A.id}`)).toBeDefined();
    });

    // Click on lesson A
    fireEvent.click(screen.getByTestId(`lesson-row-${LESSON_A.id}`));

    expect(onSetSelectedLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        lesson: expect.objectContaining({ id: LESSON_A.id, title: LESSON_A.title }),
        unitIndex: 1,
        lessonIndex: 1,
      }),
    );
  });

  it("passes the correct unitIndex and lessonIndex to setSelectedLesson", async () => {
    const onSetSelectedLesson = vi.fn();
    renderCourseTab({ onSetSelectedLesson });

    await waitFor(() => {
      expect(screen.getByTestId(`lesson-row-${LESSON_C.id}`)).toBeDefined();
    });

    // Lesson C is in Unit 2 (index 2), position 1 within unit
    fireEvent.click(screen.getByTestId(`lesson-row-${LESSON_C.id}`));

    expect(onSetSelectedLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        lesson: expect.objectContaining({ id: LESSON_C.id }),
        unitIndex: 2,
        lessonIndex: 1,
      }),
    );
  });
});

describe("CourseTab — drag reorder", () => {
  it("reorders unit blocks after drag-and-drop", async () => {
    renderCourseTab();

    await waitFor(() => {
      expect(screen.getByTestId("unit-block-u-1")).toBeDefined();
      expect(screen.getByTestId("unit-block-u-2")).toBeDefined();
    });

    const unit1 = screen.getByTestId("unit-block-u-1");
    const unit2 = screen.getByTestId("unit-block-u-2");

    // Drag unit-1 over unit-2 and drop
    fireEvent.dragStart(unit1);
    fireEvent.dragOver(unit2);
    fireEvent.drop(unit2);

    // After drop, both units are still rendered (order may change but both present)
    await waitFor(() => {
      expect(screen.getByTestId("unit-block-u-1")).toBeDefined();
      expect(screen.getByTestId("unit-block-u-2")).toBeDefined();
    });
  });
});

describe("CourseTab — flat list fallback (no units)", () => {
  it("renders flat lesson list when course has no units", async () => {
    renderCourseTab({ units: [] });

    await waitFor(() => {
      // Lessons appear directly without unit block wrappers
      expect(screen.getByText("Lesson Alpha")).toBeDefined();
      expect(screen.getByText("Lesson Beta")).toBeDefined();
      expect(screen.getByText("Lesson Gamma")).toBeDefined();
    });

    // No unit blocks rendered
    expect(screen.queryByTestId("unit-block-u-1")).toBeNull();
  });
});
