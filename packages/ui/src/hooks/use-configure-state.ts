import type { CourseId, Lesson, LessonId } from "@praxis/core/types";
import { createContext, useContext } from "react";

/** The selected lesson in the course-tab canvas, surfaced to the inspector strip. */
export interface SelectedLessonState {
  lesson: Lesson;
  /** 1-based unit number (display only). */
  unitIndex: number;
  /** 1-based lesson number within unit (display only). */
  lessonIndex: number;
}

export interface ConfigureState {
  selectedCourseId: CourseId | null;
  setSelectedCourseId: (id: CourseId | null) => void;
  /** Currently selected lesson in the Course tab canvas. Null when nothing is selected. */
  selectedLesson: SelectedLessonState | null;
  setSelectedLesson: (state: SelectedLessonState | null) => void;
  /** Clears the selection (used when switching courses or tabs). */
  clearSelectedLesson: () => void;
}

/**
 * Context for cross-tab state in the /configure route.
 * Holds the selected courseId so switching from Course tab → Gates tab
 * preserves the user's selection. Also holds the selected lesson so the
 * inspector strip (in the shell) can show its editable fields.
 *
 * Provider is created in configure.tsx; consumer tabs read via useConfigureState().
 */
export const ConfigureStateContext = createContext<ConfigureState | null>(null);

export function useConfigureState(): ConfigureState {
  const ctx = useContext(ConfigureStateContext);
  if (!ctx) {
    throw new Error("useConfigureState must be used within ConfigureStateContext.Provider");
  }
  return ctx;
}

// Re-export the LessonId type so callers importing from this module don't need
// a separate @praxis/core/types import just for LessonId.
export type { LessonId };
