import type {
  DebugTraceContext,
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
} from "@praxis/core/types";

export interface ReplayTurn {
  turnIndex: number;
  userMessage: string;
  events: readonly EngineEvent[];
}

export class ReplayEngine implements Engine {
  readonly id: string;
  readonly kind = "looped" as const;
  private readonly turnsByIndex: ReadonlyMap<number, ReplayTurn>;

  constructor(input: { id?: string; turns: readonly ReplayTurn[] }) {
    this.id = input.id ?? "replay-engine";
    this.turnsByIndex = new Map(input.turns.map((turn) => [turn.turnIndex, turn]));
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: {
        vision: false,
        streaming: false,
        nativeMCP: false,
        contextWindow: 1,
      },
    };
  }

  async open(_opts: EngineOpenOptions): Promise<EngineSession> {
    return new ReplayEngineSession(this.id, this.turnsByIndex);
  }
}

class ReplayEngineSession implements EngineSession {
  readonly id: string;

  constructor(
    engineId: string,
    private readonly turnsByIndex: ReadonlyMap<number, ReplayTurn>,
  ) {
    this.id = `${engineId}-session`;
  }

  async *send(
    userMessage: string,
    _signal?: AbortSignal,
    trace?: DebugTraceContext,
  ): AsyncIterable<EngineEvent> {
    const turnIndex = trace?.turnIndex;
    if (turnIndex === undefined) {
      throw new Error("ReplayEngine requires debug trace turnIndex to select a recorded turn");
    }
    const turn = this.turnsByIndex.get(turnIndex);
    if (turn === undefined) {
      throw new Error(`ReplayEngine has no recorded turn for turnIndex ${turnIndex}`);
    }
    if (turn.userMessage !== userMessage) {
      throw new Error(
        `ReplayEngine user message mismatch for turnIndex ${turnIndex}: expected ${JSON.stringify(
          turn.userMessage,
        )}, received ${JSON.stringify(userMessage)}`,
      );
    }
    for (const event of turn.events) yield event;
  }

  async close(): Promise<void> {}
}
