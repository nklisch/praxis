import type {
  AssignmentItem,
  DebugTraceRegistry,
  EngineEvent,
  QuickCheckEvent,
  SessionId,
} from "@praxis/core/types";
import type { ReplayTurn } from "../replay-engine.js";

export interface ScriptedQuickCheck {
  callId: string;
  item: AssignmentItem;
}

export interface ScriptedSimulationClientInput {
  dbPath: string;
  engineTurns: readonly ReplayTurn[];
  debugTrace: DebugTraceRegistry;
  quickChecks?: readonly ScriptedQuickCheck[];
}

export interface StudentSimulationEngineEventRow {
  kind: "engine_event";
  runId: string;
  scenarioId: string;
  stepIndex: number;
  sessionId: SessionId;
  event: EngineEvent;
}

export interface StudentSimulationQuickCheckEventRow {
  kind: "quick_check_event";
  runId: string;
  scenarioId: string;
  stepIndex: number;
  sessionId?: SessionId;
  event: QuickCheckEvent;
}

export type StudentSimulationEventRow =
  | StudentSimulationEngineEventRow
  | StudentSimulationQuickCheckEventRow;
