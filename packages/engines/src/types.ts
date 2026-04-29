import type { Engine, EngineEvent, EngineOpenOptions, Logger } from "@praxis/core/types";

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
