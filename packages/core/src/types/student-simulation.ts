export type StudentSimulationDriverKind = "client" | "browser";
export type StudentSimulationDeterminism = "scripted" | "live";
export type StudentSimulationStatus = "passed" | "failed" | "skipped";

export interface StudentPersona {
  id: string;
  label: string;
  gradeBand?: string;
  traits: readonly string[];
  wrongAnswerStyle?: "misconception" | "guess" | "partial" | "avoidant";
}

export type StudentSimulationStep =
  | { kind: "start-session"; ref: string; modeId: string }
  | { kind: "send-message"; sessionRef: string; text: string }
  | {
      kind: "answer-quick-check";
      strategy: "wrong" | "right" | "abandon" | "scripted";
    }
  | { kind: "expect-event"; sessionRef: string; eventType: string; callId?: string }
  | { kind: "expect-visible"; text: string; absent?: boolean }
  | { kind: "capture-browser-artifacts"; label: string };

export interface StudentSimulationScenario {
  id: string;
  title: string;
  persona: StudentPersona;
  determinism: StudentSimulationDeterminism;
  drivers: readonly StudentSimulationDriverKind[];
  tags: readonly string[];
  steps: readonly StudentSimulationStep[];
  maxTurns?: number;
}

export interface StudentSimulationArtifact {
  kind: "jsonl" | "json" | "markdown" | "trace-zip" | "screenshot" | "dom-excerpt";
  path: string;
  source: "simulation_step" | "browser_trace" | "renderer" | "session_event";
  description?: string;
}

export interface StudentSimulationStepResult {
  index: number;
  kind: StudentSimulationStep["kind"];
  status: StudentSimulationStatus;
  observation?: string;
  error?: string;
}

export interface StudentSimulationTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StudentSimulationResult {
  kind: "student_simulation_result";
  schemaVersion: 1;
  scenarioId: string;
  runId: string;
  driver: StudentSimulationDriverKind;
  determinism: StudentSimulationDeterminism;
  status: StudentSimulationStatus;
  startedAt: string;
  finishedAt: string;
  summary: string;
  sessionIds: string[];
  callIds: string[];
  rendererEventIds: string[];
  steps: StudentSimulationStepResult[];
  artifacts: StudentSimulationArtifact[];
  tokenUsage?: StudentSimulationTokenUsage;
}
