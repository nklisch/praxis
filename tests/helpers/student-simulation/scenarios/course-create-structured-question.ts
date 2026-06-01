import type { AssignmentItem, EngineEvent, StudentSimulationScenario } from "@praxis/core/types";
import type { ReplayTurn } from "../../replay-engine.js";
import { HESITANT_NURSING_STUDENT } from "../personas.js";
import type { ScriptedQuickCheck } from "../scripted-engine.js";

const CALL_ID = "call-course-scope";
const USER_MESSAGE = "Build a nursing pathophysiology course from my decks.";

const structuredQuestion: AssignmentItem = {
  kind: "structured-question",
  id: CALL_ID,
  questions: [
    {
      header: "Scope",
      prompt: "Use all three pathophysiology decks?",
      multiSelect: false,
      options: [
        {
          label: 'All 3 - "Pathophysiology for Nursing"',
          description: "Use all three decks under the standard RN-level title.",
        },
        {
          label: "Only some decks",
          description: "Select a smaller document scope before drafting.",
        },
      ],
    },
  ],
};

const engineEvents: readonly EngineEvent[] = [
  {
    type: "model_message",
    content:
      "I found the three pathophysiology decks. Confirm the scope and title, then I will draft.",
    partial: false,
  },
  {
    type: "tool_call",
    toolName: "ask_student_question",
    args: { prompt: "scope and title" },
    callId: CALL_ID,
  },
  {
    type: "tool_result",
    callId: CALL_ID,
    result: {
      ok: true,
      value: { selected: 'All 3 - "Pathophysiology for Nursing"' },
      tier: "deterministic",
    },
  },
  { type: "final", usage: { inputTokens: 18, outputTokens: 22 }, finalReason: "success" },
];

export const courseCreateStructuredQuestionScenario: StudentSimulationScenario = {
  id: "course-create-structured-question",
  title: "Course-create structured question",
  persona: HESITANT_NURSING_STUDENT,
  determinism: "scripted",
  drivers: ["client", "browser"],
  tags: ["course-create", "structured-question", "tool-markup"],
  steps: [
    { kind: "start-session", ref: "course", modeId: "course-create" },
    { kind: "send-message", sessionRef: "course", text: USER_MESSAGE },
    { kind: "answer-quick-check", strategy: "scripted" },
    { kind: "expect-event", sessionRef: "course", eventType: "tool_call", callId: CALL_ID },
    { kind: "expect-visible", text: "<invoke", absent: true },
    { kind: "expect-visible", text: "[object Object]", absent: true },
  ],
};

export const courseCreateStructuredQuestionEngineTurns: readonly ReplayTurn[] = [
  {
    turnIndex: 0,
    userMessage: USER_MESSAGE,
    events: engineEvents,
  },
];

export const courseCreateStructuredQuestionQuickChecks: readonly ScriptedQuickCheck[] = [
  { callId: CALL_ID, item: structuredQuestion },
];
