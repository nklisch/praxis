import type { EngineEvent, StudentSimulationScenario } from "@praxis/core/types";
import type { ReplayTurn } from "../../replay-engine.js";
import { CONFIDENT_PRACTICE_STUDENT } from "../personas.js";

const ASSIGNMENT_CALL_ID = "call-assignment-create";
const HOMEWORK_CALL_ID = "call-homework-show";
const TEACH_MESSAGE = "Give me practice after the explanation.";
const HOMEWORK_MESSAGE = "Start the homework.";

const teachEvents: readonly EngineEvent[] = [
  {
    type: "model_message",
    content: "I made a short homework set and opened it for practice.",
    partial: false,
  },
  {
    type: "tool_call",
    toolName: "assignment.create",
    args: { kind: "homework", title: "Cardiac output practice" },
    callId: ASSIGNMENT_CALL_ID,
  },
  {
    type: "tool_result",
    callId: ASSIGNMENT_CALL_ID,
    result: { ok: true, value: { assignmentId: "assignment-sim-1" }, tier: "deterministic" },
  },
  { type: "final", usage: { inputTokens: 16, outputTokens: 20 }, finalReason: "success" },
];

const homeworkEvents: readonly EngineEvent[] = [
  {
    type: "model_message",
    content: "Homework started: answer the first cardiac output item.",
    partial: false,
  },
  {
    type: "tool_call",
    toolName: "assignment.show",
    args: { assignmentId: "assignment-sim-1" },
    callId: HOMEWORK_CALL_ID,
  },
  {
    type: "tool_result",
    callId: HOMEWORK_CALL_ID,
    result: { ok: true, value: { shown: true }, tier: "deterministic" },
  },
  { type: "final", usage: { inputTokens: 10, outputTokens: 12 }, finalReason: "success" },
];

export const modeTransitionAssignmentScenario: StudentSimulationScenario = {
  id: "mode-transition-assignment",
  title: "Mode transition assignment",
  persona: CONFIDENT_PRACTICE_STUDENT,
  determinism: "scripted",
  drivers: ["client", "browser"],
  tags: ["teach", "homework", "mode-transition"],
  steps: [
    { kind: "start-session", ref: "teach", modeId: "teach" },
    { kind: "send-message", sessionRef: "teach", text: TEACH_MESSAGE },
    {
      kind: "expect-event",
      sessionRef: "teach",
      eventType: "tool_call",
      callId: ASSIGNMENT_CALL_ID,
    },
    { kind: "start-session", ref: "homework", modeId: "homework" },
    { kind: "send-message", sessionRef: "homework", text: HOMEWORK_MESSAGE },
    {
      kind: "expect-event",
      sessionRef: "homework",
      eventType: "tool_call",
      callId: HOMEWORK_CALL_ID,
    },
    { kind: "expect-visible", text: "Homework started" },
  ],
};

export const modeTransitionAssignmentEngineTurns: readonly ReplayTurn[] = [
  {
    turnIndex: 0,
    userMessage: TEACH_MESSAGE,
    events: teachEvents,
  },
  {
    turnIndex: 1,
    userMessage: HOMEWORK_MESSAGE,
    events: homeworkEvents,
  },
];
