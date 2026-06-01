import { attachSpawnErrorHandler, buildCliArgs, spawnCli, streamEvents } from "./cli/index.js";
import { CLIError } from "./errors.js";
import type { Options, Query, ResultEvent, StreamEvent } from "./types/index.js";
import { createDeferredPromise, createLogger } from "./utils.js";

const logger = createLogger("query");

/**
 * Execute a one-shot query against the Claude CLI, streaming events as they arrive.
 *
 * Spawns a `claude -p <prompt> --stream-json` subprocess and yields
 * {@link StreamEvent} values. The returned {@link Query} object is both an
 * async iterable and provides promise-based accessors:
 *
 * - `query.sessionId` — `Promise<string>` resolving when the init event arrives.
 * - `query.result` — `Promise<ResultEvent>` resolving when the query completes.
 * - `query.abort()` — Sends SIGTERM to the CLI process.
 *
 * **Default timeout**: 300,000 ms (5 minutes). Override with `options.timeout`.
 * Pass `0` or `Infinity` to disable the timeout entirely.
 *
 * @param prompt - The user message to send to Claude.
 * @param options - Query options (model, tools, timeout, etc.). See {@link Options}.
 * @returns A {@link Query} async generator.
 *
 * @throws {CLINotFoundError} If the `claude` binary is not in PATH.
 * @throws {CLITimeoutError} If the query exceeds `options.timeout`.
 * @throws {CLIError} If the CLI process exits with a non-zero code.
 *
 * @example
 * // Stream text output
 * const q = query('Explain async iterators', { maxTurns: 1 });
 * for await (const event of q) {
 *   if (event.type === 'assistant') process.stdout.write(event.delta ?? '');
 * }
 *
 * @example
 * // Collect result without streaming
 * const result = await collectResult(query('What is 2+2?', { maxTurns: 1 }));
 * console.log(result.result); // "4"
 *
 * @example
 * // Structured output with Zod
 * const schema = z.object({ answer: z.number() });
 * const q = query('What is 2+2?', { jsonSchema: zodToOutputFormat(schema), maxTurns: 1 });
 * const result = await collectResult(q);
 * const parsed = parseStructuredOutput(schema, result);
 * console.log(parsed.answer); // 4
 */
export function query(prompt: string, options: Options = {}): Query {
  const timeout = options.timeout ?? 300_000;

  const sessionId = createDeferredPromise<string>();
  const result = createDeferredPromise<ResultEvent>();
  let sessionIdSettled = false;

  // Prevent unhandled rejection if caller never awaits .result
  result.promise.catch(() => {});
  sessionId.promise.catch(() => {});

  // Abort controller — caller can abort, or we create one to expose .abort()
  const ac = options.abortController ?? new AbortController();
  let procKilled = false;

  async function* generate(): AsyncGenerator<StreamEvent, ResultEvent, unknown> {
    const rejectBeforeInit = (err: Error): void => {
      if (!sessionIdSettled) {
        sessionIdSettled = true;
        sessionId.reject(err);
      }
    };

    const resolveSessionId = (id: string): void => {
      if (!sessionIdSettled) {
        sessionIdSettled = true;
        sessionId.resolve(id);
      }
    };

    let proc: ReturnType<typeof spawnCli>["proc"] | undefined;
    let cleanup = async () => {};

    // Wire abort signal to process kill
    const onAbort = () => {
      if (!procKilled && proc) {
        procKilled = true;
        proc.kill("SIGTERM");
      }
    };

    let resultEvent: ResultEvent | undefined;

    try {
      const { args, tempFiles } = await buildCliArgs(prompt, options);

      logger.debug("Spawning CLI", { args: args.slice(0, 6), workDir: options.workDir });

      const spawnResult = spawnCli(args, { workDir: options.workDir, env: options.env }, tempFiles);
      proc = spawnResult.proc;
      cleanup = spawnResult.cleanup;

      ac.signal.addEventListener("abort", onAbort, { once: true });

      // Handle ENOENT spawn error
      attachSpawnErrorHandler(proc, (err) => {
        result.reject(err);
        rejectBeforeInit(err);
      });

      for await (const event of streamEvents(proc, timeout)) {
        if (event.type === "system" && event.subtype === "init") {
          resolveSessionId(event.sessionId);
        }

        if (event.type === "result") {
          resultEvent = event;
          result.resolve(resultEvent);
        }

        yield event;

        // Once we have the result, stop iterating — don't wait for process exit
        if (resultEvent) break;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      result.reject(error);
      rejectBeforeInit(error);
      throw err;
    } finally {
      // Kill the process if it's still running (e.g. stuck during cleanup)
      if (!procKilled && proc && proc.exitCode === null) {
        procKilled = true;
        proc.kill("SIGTERM");
      }
      ac.signal.removeEventListener("abort", onAbort);
      await cleanup();
    }

    if (!resultEvent) {
      // Process ended without a result event
      const err = new CLIError(0, "Claude CLI exited without a result event");
      result.reject(err);
      rejectBeforeInit(err);
      throw err;
    }

    return resultEvent;
  }

  const gen = generate();

  const q: Query = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next: (...args) => gen.next(...args),
    return: (value) => gen.return(value),
    throw: (err) => gen.throw(err),
    get sessionId() {
      return sessionId.promise;
    },
    get result() {
      return result.promise;
    },
    abort() {
      ac.abort();
    },
    async [Symbol.asyncDispose]() {
      this.abort();
    },
  };

  return q;
}
