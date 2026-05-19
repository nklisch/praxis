/**
 * ScriptedEngine — a fake Engine that drives tool calls from a pre-defined script.
 *
 * Each step in the script is a `{ toolName, args }` object. The scripted engine
 * yields synthetic `tool_call` events that the drafter's registry dispatches,
 * then re-injects the `tool_result` back into the stream, simulating how a real
 * looped engine (Claude Code) would drive the multi-step loop.
 *
 * The engine invokes the registry directly (via `registry.dispatch`) so tool
 * dispatch is REAL — only the model driving is fake.
 */

import type { Engine, EngineEvent, EngineSession, ToolRegistry } from "@praxis/core/types";

export interface ScriptedStep {
  toolName: string;
  args: Record<string, unknown>;
}

export class ScriptedEngine implements Engine {
  readonly id = "scripted-test";
  readonly kind = "looped" as const;

  constructor(private readonly steps: ScriptedStep[]) {}

  async open(opts: { tools: ToolRegistry; maxSteps?: number }): Promise<EngineSession> {
    const { tools } = opts;
    const steps = this.steps;

    return {
      id: "scripted-session",
      send: (_msg: string): AsyncIterable<EngineEvent> => {
        return {
          [Symbol.asyncIterator]: async function* () {
            for (const step of steps) {
              const callId = `call-${step.toolName}-${Date.now()}`;
              // Yield the synthetic tool_call event.
              yield {
                type: "tool_call" as const,
                toolName: step.toolName,
                args: step.args,
                callId,
              };

              // Dispatch through the REAL registry — tool handlers actually run.
              const result = await tools.dispatch(step.toolName, step.args);

              // Yield the tool_result event.
              yield {
                type: "tool_result" as const,
                callId,
                result,
              };
            }

            // Final event to end the stream.
            yield {
              type: "final" as const,
              usage: { inputTokens: 0, outputTokens: 0 },
            };
          },
        };
      },
      close: async () => {},
    };
  }

  async health() {
    return {
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 0 },
    };
  }
}
