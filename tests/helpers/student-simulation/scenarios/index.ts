import type { StudentSimulationScenario } from "@praxis/core/types";
import type { ReplayTurn } from "../../replay-engine.js";
import type { ScriptedQuickCheck } from "../scripted-engine.js";
import {
  courseCreateStructuredQuestionEngineTurns,
  courseCreateStructuredQuestionQuickChecks,
  courseCreateStructuredQuestionScenario,
} from "./course-create-structured-question.js";
import {
  modeTransitionAssignmentEngineTurns,
  modeTransitionAssignmentScenario,
} from "./mode-transition-assignment.js";
import {
  teachQuickCheckWrongThenRightEngineTurns,
  teachQuickCheckWrongThenRightQuickChecks,
  teachQuickCheckWrongThenRightScenario,
} from "./teach-quick-check-wrong-then-right.js";

export interface ScriptedStudentSimulationFixture {
  scenario: StudentSimulationScenario;
  engineTurns: readonly ReplayTurn[];
  quickChecks?: readonly ScriptedQuickCheck[];
}

export const STUDENT_SIMULATION_FIXTURES: readonly ScriptedStudentSimulationFixture[] = [
  {
    scenario: courseCreateStructuredQuestionScenario,
    engineTurns: courseCreateStructuredQuestionEngineTurns,
    quickChecks: courseCreateStructuredQuestionQuickChecks,
  },
  {
    scenario: teachQuickCheckWrongThenRightScenario,
    engineTurns: teachQuickCheckWrongThenRightEngineTurns,
    quickChecks: teachQuickCheckWrongThenRightQuickChecks,
  },
  {
    scenario: modeTransitionAssignmentScenario,
    engineTurns: modeTransitionAssignmentEngineTurns,
  },
] as const;

export const STUDENT_SIMULATION_SCENARIOS: readonly StudentSimulationScenario[] =
  STUDENT_SIMULATION_FIXTURES.map((fixture) => fixture.scenario);

const FIXTURES_BY_ID = new Map(
  STUDENT_SIMULATION_FIXTURES.map((fixture) => [fixture.scenario.id, fixture]),
);

export function getStudentSimulationScenario(id: string): StudentSimulationScenario {
  return getStudentSimulationFixture(id).scenario;
}

export function getStudentSimulationFixture(id: string): ScriptedStudentSimulationFixture {
  const fixture = FIXTURES_BY_ID.get(id);
  if (fixture === undefined) throw new Error(`Unknown student simulation scenario: ${id}`);
  return fixture;
}
