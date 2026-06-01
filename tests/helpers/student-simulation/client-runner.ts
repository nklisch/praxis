import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  AssignmentItem,
  DebugTraceRegistry,
  EngineEvent,
  PraxisClient,
  QuickCheckAnswer,
  QuickCheckEvent,
  SessionId,
  StudentPersona,
  StudentSimulationArtifact,
  StudentSimulationResult,
  StudentSimulationScenario,
  StudentSimulationStatus,
  StudentSimulationStep,
  StudentSimulationStepResult,
} from "@praxis/core/types";
import type { StudentSimulationEventRow } from "./scripted-engine.js";

export interface StudentSimulationClientRunnerInput {
  scenario: StudentSimulationScenario;
  client: PraxisClient;
  outputDir: string;
  runId?: string;
  debugTrace?: DebugTraceRegistry;
  now?: () => Date;
}

export interface StudentSimulationClientRunner {
  run(input: StudentSimulationClientRunnerInput): Promise<StudentSimulationResult>;
}

interface RunnerState {
  readonly runId: string;
  readonly scenario: StudentSimulationScenario;
  readonly client: PraxisClient;
  readonly sessionRefs: Map<string, SessionId>;
  readonly sessionIds: Set<string>;
  readonly callIds: Set<string>;
  readonly answeredQuickChecks: Set<string>;
  readonly eventRows: StudentSimulationEventRow[];
  readonly stepRows: StudentSimulationStepResult[];
  readonly visibleText: string[];
  readonly debugTrace?: DebugTraceRegistry;
}

export class StudentSimulationClientRunnerImpl implements StudentSimulationClientRunner {
  async run(input: StudentSimulationClientRunnerInput): Promise<StudentSimulationResult> {
    const startedAt = (input.now ?? (() => new Date()))().toISOString();
    const runId = input.runId ?? `student-simulation-${Date.now()}`;
    const outputDir = resolve(input.outputDir);
    const resultPath = join(outputDir, "simulation-result.json");
    const eventsPath = join(outputDir, "simulation-events.jsonl");
    const stepsPath = join(outputDir, "simulation-steps.jsonl");
    const artifacts: StudentSimulationArtifact[] = [
      {
        kind: "json",
        path: resultPath,
        source: "simulation_step",
        description: "Student simulation result",
      },
      {
        kind: "jsonl",
        path: eventsPath,
        source: "session_event",
        description: "Engine and quick-check events observed during the run",
      },
      {
        kind: "jsonl",
        path: stepsPath,
        source: "simulation_step",
        description: "Per-step simulation observations",
      },
    ];
    const state: RunnerState = {
      runId,
      scenario: input.scenario,
      client: input.client,
      sessionRefs: new Map(),
      sessionIds: new Set(),
      callIds: new Set(),
      answeredQuickChecks: new Set(),
      eventRows: [],
      stepRows: [],
      visibleText: [],
      debugTrace: input.debugTrace,
    };

    let firstFailure: StudentSimulationStepResult | undefined;
    for (const [index, step] of input.scenario.steps.entries()) {
      const result = await runStep(state, step, index);
      state.stepRows.push(result);
      if (result.status === "failed") {
        firstFailure = result;
        break;
      }
    }

    const finishedAt = (input.now ?? (() => new Date()))().toISOString();
    const status: StudentSimulationStatus = firstFailure === undefined ? "passed" : "failed";
    const rendererEventIds = collectRendererEventIds(input.debugTrace);
    const result: StudentSimulationResult = {
      kind: "student_simulation_result",
      schemaVersion: 1,
      scenarioId: input.scenario.id,
      runId,
      driver: "client",
      determinism: input.scenario.determinism,
      status,
      startedAt,
      finishedAt,
      summary:
        firstFailure === undefined
          ? `Passed ${state.stepRows.length} client simulation steps.`
          : `Failed at step ${firstFailure.index} (${firstFailure.kind}): ${firstFailure.error}`,
      sessionIds: [...state.sessionIds],
      callIds: mergeCallIds(state.callIds, input.debugTrace),
      rendererEventIds,
      steps: state.stepRows,
      artifacts,
    };

    await mkdir(outputDir, { recursive: true });
    await writeFile(eventsPath, toJsonl(state.eventRows), "utf8");
    await writeFile(stepsPath, toJsonl(state.stepRows), "utf8");
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

    return result;
  }
}

export function createStudentSimulationClientRunner(): StudentSimulationClientRunner {
  return new StudentSimulationClientRunnerImpl();
}

async function runStep(
  state: RunnerState,
  step: StudentSimulationStep,
  index: number,
): Promise<StudentSimulationStepResult> {
  try {
    switch (step.kind) {
      case "start-session":
        return await runStartSessionStep(state, step, index);
      case "send-message":
        return await runSendMessageStep(state, step, index);
      case "answer-quick-check":
        return await runAnswerQuickCheckStep(state, step, index);
      case "expect-event":
        return runExpectEventStep(state, step, index);
      case "expect-visible":
        return runExpectVisibleStep(state, step, index);
      case "capture-browser-artifacts":
        return {
          index,
          kind: step.kind,
          status: "skipped",
          observation: `Browser artifact capture is skipped by the client runner: ${step.label}`,
        };
    }
  } catch (err) {
    const error = errorMessage(err);
    return {
      index,
      kind: step.kind,
      status: "failed",
      observation: `${error}; ${formatCorrelationIds(state)}`,
      error,
    };
  }
}

async function runStartSessionStep(
  state: RunnerState,
  step: Extract<StudentSimulationStep, { kind: "start-session" }>,
  index: number,
): Promise<StudentSimulationStepResult> {
  const handle = await state.client.session.start({ modeId: step.modeId });
  state.sessionRefs.set(step.ref, handle.sessionId);
  state.sessionIds.add(handle.sessionId);
  return {
    index,
    kind: step.kind,
    status: "passed",
    observation: `Started ${step.modeId} session ${handle.sessionId} as ${step.ref}`,
  };
}

async function runSendMessageStep(
  state: RunnerState,
  step: Extract<StudentSimulationStep, { kind: "send-message" }>,
  index: number,
): Promise<StudentSimulationStepResult> {
  const sessionId = loadSessionRef(state, step.sessionRef);
  let observed = 0;
  for await (const event of state.client.session.send(sessionId, step.text)) {
    observed++;
    recordEngineEvent(state, index, sessionId, event);
    if (event.type === "model_message") state.visibleText.push(event.content);
    if (event.type === "error") throw new Error(event.error.message);
  }
  return {
    index,
    kind: step.kind,
    status: "passed",
    observation: `Sent message to ${sessionId} and observed ${observed} events`,
  };
}

async function runAnswerQuickCheckStep(
  state: RunnerState,
  step: Extract<StudentSimulationStep, { kind: "answer-quick-check" }>,
  index: number,
): Promise<StudentSimulationStepResult> {
  const pending = await waitForPendingQuickCheck(state, index);
  const answer = buildQuickCheckAnswer({
    item: pending.item,
    strategy: step.strategy,
    persona: state.scenario.persona,
  });
  await state.client.quickCheck.resolve({ callId: pending.callId, answer });
  state.answeredQuickChecks.add(pending.callId);
  state.callIds.add(pending.callId);
  state.eventRows.push({
    kind: "quick_check_event",
    runId: state.runId,
    scenarioId: state.scenario.id,
    stepIndex: index,
    event: { kind: "resolved", callId: pending.callId, answer },
  });
  return {
    index,
    kind: step.kind,
    status: "passed",
    observation: `Resolved quick check ${pending.callId} with ${answer.kind}`,
  };
}

function runExpectEventStep(
  state: RunnerState,
  step: Extract<StudentSimulationStep, { kind: "expect-event" }>,
  index: number,
): StudentSimulationStepResult {
  const sessionId = loadSessionRef(state, step.sessionRef);
  const found = state.eventRows.some((row) => {
    if (row.kind !== "engine_event") return false;
    if (row.sessionId !== sessionId) return false;
    if (row.event.type !== step.eventType) return false;
    if (step.callId === undefined) return true;
    return getEventCallId(row.event) === step.callId;
  });
  if (!found) {
    throw new Error(
      `Expected event ${step.eventType}${
        step.callId === undefined ? "" : ` with callId ${step.callId}`
      } for session ${sessionId}`,
    );
  }
  return {
    index,
    kind: step.kind,
    status: "passed",
    observation: `Observed ${step.eventType} for ${sessionId}`,
  };
}

function runExpectVisibleStep(
  state: RunnerState,
  step: Extract<StudentSimulationStep, { kind: "expect-visible" }>,
  index: number,
): StudentSimulationStepResult {
  const haystack = state.visibleText.join("\n");
  const found = haystack.includes(step.text);
  if (step.absent === true && found) {
    throw new Error(`Text was visible but expected absent: ${step.text}`);
  }
  if (step.absent !== true && !found) {
    throw new Error(`Expected visible text was not observed: ${step.text}`);
  }
  return {
    index,
    kind: step.kind,
    status: "passed",
    observation:
      step.absent === true ? `Text remained absent: ${step.text}` : `Text observed: ${step.text}`,
  };
}

function loadSessionRef(state: RunnerState, ref: string): SessionId {
  const sessionId = state.sessionRefs.get(ref);
  if (sessionId === undefined) throw new Error(`Unknown session ref: ${ref}`);
  return sessionId;
}

function recordEngineEvent(
  state: RunnerState,
  stepIndex: number,
  sessionId: SessionId,
  event: EngineEvent,
): void {
  const callId = getEventCallId(event);
  if (callId !== undefined) state.callIds.add(callId);
  state.eventRows.push({
    kind: "engine_event",
    runId: state.runId,
    scenarioId: state.scenario.id,
    stepIndex,
    sessionId,
    event,
  });
}

async function waitForPendingQuickCheck(
  state: RunnerState,
  stepIndex: number,
): Promise<Extract<QuickCheckEvent, { kind: "pending" }>> {
  const iterator = state.client.quickCheck.events()[Symbol.asyncIterator]();
  let timedOut = false;
  try {
    for (;;) {
      let next: IteratorResult<QuickCheckEvent>;
      try {
        next = await nextWithTimeout(iterator, 1_000);
      } catch (err) {
        timedOut = true;
        throw err;
      }
      if (next.done === true) throw new Error("quick-check event stream ended");
      const event = next.value;
      const sessionId = event.kind === "pending" ? event.sessionId : undefined;
      state.eventRows.push({
        kind: "quick_check_event",
        runId: state.runId,
        scenarioId: state.scenario.id,
        stepIndex,
        sessionId,
        event,
      });
      if (event.kind === "pending" && !state.answeredQuickChecks.has(event.callId)) {
        state.callIds.add(event.callId);
        return event;
      }
    }
  } finally {
    const close = iterator.return?.();
    if (!timedOut) await close;
  }
}

async function nextWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs: number,
): Promise<IteratorResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<IteratorResult<T>>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Timed out waiting for quick-check event after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([iterator.next(), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function buildQuickCheckAnswer(input: {
  item: AssignmentItem;
  strategy: "wrong" | "right" | "abandon" | "scripted";
  persona: StudentPersona;
}): QuickCheckAnswer {
  if (input.strategy === "abandon") return { kind: "abandoned" };
  const wantsRightAnswer = input.strategy === "right" || input.strategy === "scripted";
  switch (input.item.kind) {
    case "single-choice":
      return {
        kind: "single-choice",
        selectedIndex: wantsRightAnswer
          ? input.item.correctOptionIndex
          : pickDifferentIndex(input.item.correctOptionIndex, input.item.options.length),
      };
    case "multi-select":
      return {
        kind: "multi-select",
        selectedIndices: wantsRightAnswer ? [...input.item.correctOptionIndices] : [],
      };
    case "short-answer":
      return {
        kind: "short-answer",
        text: wantsRightAnswer
          ? (input.item.acceptedAnswers[0] ?? "correct")
          : wrongText(input.persona),
      };
    case "matching":
      return {
        kind: "matching",
        pairs: wantsRightAnswer ? input.item.correctPairs.map((pair) => ({ ...pair })) : [],
      };
    case "structured-question":
      return {
        kind: "structured-question",
        answers: input.item.questions.map((question, questionIndex) => ({
          questionIndex,
          selectedIndices: chooseStructuredQuestionIndices(
            question.options.length,
            wantsRightAnswer,
          ),
        })),
      };
    case "code":
    case "free-response":
    case "math":
    case "numerical":
    case "ordering":
    case "two-tier":
      return { kind: "abandoned" };
  }
}

function pickDifferentIndex(correctIndex: number, optionCount: number): number {
  if (optionCount <= 1) return correctIndex;
  return correctIndex === 0 ? 1 : 0;
}

function chooseStructuredQuestionIndices(optionCount: number, wantsRightAnswer: boolean): number[] {
  if (optionCount <= 0) return [];
  return [wantsRightAnswer ? 0 : optionCount - 1];
}

function wrongText(persona: StudentPersona): string {
  switch (persona.wrongAnswerStyle) {
    case "avoidant":
      return "I am not sure.";
    case "misconception":
      return "I think the opposite cause is responsible.";
    case "partial":
      return "partly correct";
    default:
      return "guess";
  }
}

function getEventCallId(event: EngineEvent): string | undefined {
  switch (event.type) {
    case "tool_call":
    case "tool_result":
      return event.callId;
    default:
      return undefined;
  }
}

function collectRendererEventIds(debugTrace: DebugTraceRegistry | undefined): string[] {
  if (debugTrace === undefined) return [];
  return [
    ...new Set(
      debugTrace
        .list()
        .map((record) => record.trace.rendererEventId)
        .filter((id): id is string => id !== undefined),
    ),
  ];
}

function mergeCallIds(
  callIds: ReadonlySet<string>,
  debugTrace: DebugTraceRegistry | undefined,
): string[] {
  const merged = new Set(callIds);
  for (const record of debugTrace?.list() ?? []) {
    if (record.trace.callId !== undefined) merged.add(record.trace.callId);
  }
  return [...merged];
}

function formatCorrelationIds(state: RunnerState): string {
  const sessionIds = [...state.sessionIds].join(", ") || "none";
  const callIds = [...state.callIds].join(", ") || "none";
  return `known correlation ids: sessions=${sessionIds}; calls=${callIds}`;
}

function toJsonl(rows: readonly unknown[]): string {
  if (rows.length === 0) return "";
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
