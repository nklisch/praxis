import type { CourseId } from "@praxis/core/types";
import { createContext, useContext } from "react";

export interface ConfigureState {
  selectedCourseId: CourseId | null;
  setSelectedCourseId: (id: CourseId | null) => void;
}

/**
 * Context for cross-tab state in the /configure route.
 * Holds the selected courseId so switching from Course tab → Gates tab
 * preserves the user's selection.
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
