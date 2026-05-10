import type { Mode } from "@praxis/core/types";
import { bootstrapMode } from "./bootstrap.js";
import { configureMode } from "./configure.js";
import { examMode } from "./exam.js";
import { homeworkMode } from "./homework.js";
import { quizMode } from "./quiz.js";
import { studySkillsMode } from "./study-skills.js";
import { teachMode } from "./teach.js";

const MODE_REGISTRY: ReadonlyMap<string, Mode> = new Map([
  [teachMode.id, teachMode],
  [bootstrapMode.id, bootstrapMode],
  [quizMode.id, quizMode],
  [homeworkMode.id, homeworkMode],
  [examMode.id, examMode],
  [configureMode.id, configureMode], // ← Phase 11
  [studySkillsMode.id, studySkillsMode], // ← Phase 18
]);

export function getMode(id: string): Mode | undefined {
  return MODE_REGISTRY.get(id);
}

export function requireMode(id: string): Mode {
  const mode = MODE_REGISTRY.get(id);
  if (!mode) throw new Error(`Unknown mode: ${id}`);
  return mode;
}

export function listModes(): readonly Mode[] {
  return [...MODE_REGISTRY.values()];
}

export { bootstrapMode } from "./bootstrap.js";
export { configureMode } from "./configure.js"; // ← Phase 11
export { examMode } from "./exam.js";
export { homeworkMode } from "./homework.js";
export { quizMode } from "./quiz.js";
export { studySkillsMode } from "./study-skills.js"; // ← Phase 18
export { teachMode } from "./teach.js";
