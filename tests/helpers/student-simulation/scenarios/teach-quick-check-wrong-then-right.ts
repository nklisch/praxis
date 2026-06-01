import type { AssignmentItem, EngineEvent, StudentSimulationScenario } from "@praxis/core/types";
import type { ReplayTurn } from "../../replay-engine.js";
import { HESITANT_NURSING_STUDENT } from "../personas.js";
import type { ScriptedQuickCheck } from "../scripted-engine.js";

const FIRST_CALL_ID = "call-teach-qc-1";
const SECOND_CALL_ID = "call-teach-qc-2";
const FIRST_MESSAGE = "Teach me preload and afterload.";
const SECOND_MESSAGE = "I mixed those up. Give me another check.";

const firstQuickCheck: AssignmentItem = {
  kind: "single-choice",
  id: "qc-afterload-1",
  prompt: "Which term refers to the pressure the ventricle pumps against?",
  options: ["Preload", "Afterload"],
  correctOptionIndex: 1,
};

const secondQuickCheck: AssignmentItem = {
  kind: "single-choice",
  id: "qc-preload-1",
  prompt: "Which term reflects ventricular filling before contraction?",
  options: ["Preload", "Afterload"],
  correctOptionIndex: 0,
};

const firstTurnEvents: readonly EngineEvent[] = [
  {
    type: "model_message",
    content: "Preload is filling stretch; afterload is the resistance the ventricle pumps against.",
    partial: false,
  },
  {
    type: "tool_call",
    toolName: "quick_check.single_choice",
    args: { itemId: "qc-afterload-1" },
    callId: FIRST_CALL_ID,
  },
  {
    type: "tool_result",
    callId: FIRST_CALL_ID,
    result: { ok: true, value: { queued: true }, tier: "deterministic" },
  },
  { type: "final", usage: { inputTokens: 20, outputTokens: 24 }, finalReason: "success" },
];

const secondTurnEvents: readonly EngineEvent[] = [
  {
    type: "model_message",
    content: "Good correction: preload is about filling before contraction.",
    partial: false,
  },
  {
    type: "tool_call",
    toolName: "quick_check.single_choice",
    args: { itemId: "qc-preload-1" },
    callId: SECOND_CALL_ID,
  },
  {
    type: "tool_result",
    callId: SECOND_CALL_ID,
    result: { ok: true, value: { queued: true }, tier: "deterministic" },
  },
  { type: "final", usage: { inputTokens: 12, outputTokens: 18 }, finalReason: "success" },
];

export const teachQuickCheckWrongThenRightScenario: StudentSimulationScenario = {
  id: "teach-quick-check-wrong-then-right",
  title: "Teach quick check wrong then right",
  persona: HESITANT_NURSING_STUDENT,
  determinism: "scripted",
  drivers: ["client", "browser"],
  tags: ["teach", "quick-check", "wrong-then-right"],
  steps: [
    { kind: "start-session", ref: "teach", modeId: "teach" },
    { kind: "send-message", sessionRef: "teach", text: FIRST_MESSAGE },
    { kind: "answer-quick-check", strategy: "wrong" },
    { kind: "expect-event", sessionRef: "teach", eventType: "tool_call", callId: FIRST_CALL_ID },
    { kind: "send-message", sessionRef: "teach", text: SECOND_MESSAGE },
    { kind: "answer-quick-check", strategy: "right" },
    { kind: "expect-event", sessionRef: "teach", eventType: "tool_call", callId: SECOND_CALL_ID },
    { kind: "expect-visible", text: "Good correction" },
  ],
};

export const teachQuickCheckWrongThenRightEngineTurns: readonly ReplayTurn[] = [
  {
    turnIndex: 0,
    userMessage: FIRST_MESSAGE,
    events: firstTurnEvents,
  },
  {
    turnIndex: 1,
    userMessage: SECOND_MESSAGE,
    events: secondTurnEvents,
  },
];

export const teachQuickCheckWrongThenRightQuickChecks: readonly ScriptedQuickCheck[] = [
  { callId: FIRST_CALL_ID, item: firstQuickCheck },
  { callId: SECOND_CALL_ID, item: secondQuickCheck },
];
