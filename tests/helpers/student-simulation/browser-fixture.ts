import type {
  AssignmentItem,
  EngineEvent,
  PraxisClient,
  QuickCheckAnswer,
  QuickCheckEvent,
  SessionHandle,
  SessionId,
  StudentPersona,
  Timestamp,
} from "@praxis/core/types";
import type { ScriptedStudentSimulationFixture } from "./scenarios/index.js";
import type { ScriptedQuickCheck } from "./scripted-engine.js";

export interface BrowserSimulationClient {
  client: PraxisClient;
  sessionIds: readonly SessionId[];
  callIds: readonly string[];
}

export function createBrowserSimulationClient(
  fixture: ScriptedStudentSimulationFixture,
): BrowserSimulationClient {
  const quickCheckBus = new BrowserQuickCheckEventBus();
  const sessions: SessionHandle[] = [];
  const callIds = new Set<string>();
  const quickChecksByCallId = new Map(
    fixture.quickChecks?.map((quickCheck) => [quickCheck.callId, quickCheck]),
  );
  let nextTurnIndex = 0;

  const sessionApi: PraxisClient["session"] = {
    async start(input: { modeId: string }): Promise<SessionHandle> {
      const handle: SessionHandle = {
        sessionId: makeSessionId(),
        modeId: input.modeId,
        startedAt: Date.now() as Timestamp,
      };
      sessions.push(handle);
      return handle;
    },
    send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent> {
      return sendBrowserTurn({
        fixture,
        sessionId,
        message,
        turnIndex: nextTurnIndex++,
        quickChecksByCallId,
        quickCheckBus,
        callIds,
      });
    },
    async end(sessionId: SessionId) {
      return {
        sessionId,
        endedAt: Date.now() as Timestamp,
        unlockedGates: [],
        newMisconceptions: 0,
      };
    },
    async active() {
      return sessions.at(-1) ?? null;
    },
    async list() {
      return sessions.map((session) => ({ ...session, endedAt: null }));
    },
    async spawnFromAssignment() {
      throw new Error("browser simulation does not support spawnFromAssignment");
    },
    async spawnFromNote() {
      throw new Error("browser simulation does not support spawnFromNote");
    },
    async spawnFromPassage() {
      throw new Error("browser simulation does not support spawnFromPassage");
    },
    async discardIfUnpromoted() {
      return { discarded: false };
    },
  };

  return {
    client: makeBrowserClient({
      session: sessionApi,
      quickCheck: {
        events: () => quickCheckBus.events(),
        resolve: async ({ callId, answer }) => {
          quickCheckBus.emit({ kind: "resolved", callId, answer });
        },
      },
    }),
    get sessionIds() {
      return sessions.map((session) => session.sessionId);
    },
    get callIds() {
      return [...callIds];
    },
  };
}

export function buildBrowserQuickCheckAnswer(input: {
  item: AssignmentItem;
  strategy: "wrong" | "right" | "abandon" | "scripted";
  persona: StudentPersona;
}): QuickCheckAnswer {
  if (input.strategy === "abandon") return { kind: "abandoned" };
  const right = input.strategy === "right" || input.strategy === "scripted";
  switch (input.item.kind) {
    case "single-choice":
      return {
        kind: "single-choice",
        selectedIndex: right
          ? input.item.correctOptionIndex
          : pickDifferentIndex(input.item.correctOptionIndex, input.item.options.length),
      };
    case "multi-select":
      return {
        kind: "multi-select",
        selectedIndices: right ? [...input.item.correctOptionIndices] : [],
      };
    case "short-answer":
      return {
        kind: "short-answer",
        text: right ? (input.item.acceptedAnswers[0] ?? "correct") : wrongText(input.persona),
      };
    case "matching":
      return {
        kind: "matching",
        pairs: right ? input.item.correctPairs.map((pair) => ({ ...pair })) : [],
      };
    case "structured-question":
      return {
        kind: "structured-question",
        answers: input.item.questions.map((question, questionIndex) => ({
          questionIndex,
          selectedIndices:
            question.options.length === 0 ? [] : [right ? 0 : question.options.length - 1],
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

function makeBrowserClient(input: {
  session: PraxisClient["session"];
  quickCheck: PraxisClient["quickCheck"];
}): PraxisClient {
  return {
    session: input.session,
    artifacts: {} as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {} as PraxisClient["packs"],
    notes: {} as PraxisClient["notes"],
    flashcards: {} as PraxisClient["flashcards"],
    claudeAuth: {} as PraxisClient["claudeAuth"],
    shell: {} as PraxisClient["shell"],
    tabs: {} as PraxisClient["tabs"],
    sketches: {} as PraxisClient["sketches"],
    conceptMaps: {} as PraxisClient["conceptMaps"],
    documentScopes: {} as PraxisClient["documentScopes"],
    activity: {} as PraxisClient["activity"],
    drafts: {} as PraxisClient["drafts"],
    quickCheck: input.quickCheck,
    update: {} as PraxisClient["update"],
    subAgent: {} as PraxisClient["subAgent"],
    recommendations: {} as PraxisClient["recommendations"],
    citations: {} as PraxisClient["citations"],
    library: {} as PraxisClient["library"],
    progress: {} as PraxisClient["progress"],
    log: { record: () => {} },
  };
}

async function* sendBrowserTurn(input: {
  fixture: ScriptedStudentSimulationFixture;
  sessionId: SessionId;
  message: string;
  turnIndex: number;
  quickChecksByCallId: ReadonlyMap<string, ScriptedQuickCheck>;
  quickCheckBus: BrowserQuickCheckEventBus;
  callIds: Set<string>;
}): AsyncIterable<EngineEvent> {
  const turn = input.fixture.engineTurns.find(
    (candidate) => candidate.turnIndex === input.turnIndex,
  );
  if (turn === undefined) throw new Error(`browser simulation has no turn ${input.turnIndex}`);
  if (turn.userMessage !== input.message) {
    throw new Error(
      `browser simulation turn ${input.turnIndex} expected ${JSON.stringify(
        turn.userMessage,
      )}, received ${JSON.stringify(input.message)}`,
    );
  }

  yield { type: "user_message", content: input.message };

  for (const event of turn.events) {
    const callId = getEventCallId(event);
    if (callId !== undefined) input.callIds.add(callId);
    if (event.type === "tool_call") {
      const quickCheck = input.quickChecksByCallId.get(event.callId);
      if (quickCheck !== undefined) {
        input.quickCheckBus.emit({
          kind: "pending",
          callId: event.callId,
          sessionId: input.sessionId,
          item: quickCheck.item,
        });
      }
    }
    yield event;
  }
}

function makeSessionId(): SessionId {
  const cryptoLike = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const id = cryptoLike?.randomUUID?.() ?? `browser-session-${Date.now()}`;
  return `browser-session-${id}` as SessionId;
}

function getEventCallId(event: EngineEvent): string | undefined {
  return event.type === "tool_call" || event.type === "tool_result" ? event.callId : undefined;
}

function pickDifferentIndex(correctIndex: number, optionCount: number): number {
  if (optionCount <= 1) return correctIndex;
  return correctIndex === 0 ? 1 : 0;
}

function wrongText(persona: StudentPersona): string {
  if (persona.wrongAnswerStyle === "avoidant") return "I am not sure.";
  if (persona.wrongAnswerStyle === "misconception") {
    return "I think the opposite cause is responsible.";
  }
  if (persona.wrongAnswerStyle === "partial") return "partly correct";
  return "guess";
}

class BrowserQuickCheckEventBus {
  private readonly backlog: QuickCheckEvent[] = [];
  private readonly waiters = new Set<() => void>();

  emit(event: QuickCheckEvent): void {
    this.backlog.push(event);
    for (const waiter of this.waiters) waiter();
    this.waiters.clear();
  }

  async *events(): AsyncIterable<QuickCheckEvent> {
    let cursor = 0;
    while (true) {
      while (cursor < this.backlog.length) {
        const event = this.backlog[cursor];
        cursor++;
        if (event !== undefined) yield event;
      }
      await new Promise<void>((resolveWaiter) => {
        this.waiters.add(resolveWaiter);
      });
    }
  }
}
