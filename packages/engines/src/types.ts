import type { Engine, EngineEvent, EngineOpenOptions, Logger, ToolResult } from "@praxis/core/types";

export interface EngineDeps {
  log: Logger;
}

/**
 * Convenience wrapper for single-turn use cases (test scripts, conformance
 * suite). Opens an engine session, sends one message, drains the stream,
 * closes the session. Equivalent to old Phase 2 `engine.run(brief, tools)`.
 */
export async function* runOneShot(
  engine: Engine,
  opts: EngineOpenOptions,
  userMessage: string,
): AsyncGenerator<EngineEvent, void, void> {
  const session = await engine.open(opts);
  try {
    yield* session.send(userMessage);
  } finally {
    await session.close();
  }
}

/**
 * Sentinel dispatch for one-shot LLM inference callers that register no tools.
 *
 * Pass `noopDispatch(label)` as `tools.dispatch` in `runOneShot` options to
 * return a diagnostic "no_tools" error if the model improvises a tool call.
 * The `label` identifies the calling agent in the error message so unexpected
 * model behaviour is attributable at a glance.
 *
 * Usage:
 *   tools: { list: () => [], dispatch: noopDispatch("affective-indexer") }
 */
export const noopDispatch =
  (label = "one-shot inference") =>
  async (_name: string, _args: unknown): Promise<ToolResult> => ({
    ok: false,
    error: {
      code: "no_tools",
      message: `${label}: model attempted a tool call but no tools are registered`,
      recoverable: false,
    },
  });
