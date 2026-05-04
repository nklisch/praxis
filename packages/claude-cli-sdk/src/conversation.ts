import type { ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import {
  attachSpawnErrorHandler,
  buildConversationArgs,
  parseStreamLine,
  spawnCli,
} from "./cli/index.js";
import { CLIError, CLITimeoutError } from "./errors.js";
import type {
  ConversationOptions,
  ResultEvent,
  StreamEvent,
  ToolHandler,
  ToolUseEvent,
} from "./types/index.js";
import { createDeferredPromise } from "./utils.js";

// ============================================
// CONVERSATION TYPES
// ============================================

/**
 * Result of a single conversation turn, returned by `turn.result` or `sendAndCollect()`.
 *
 * Contains the text response plus cost/usage metadata. Access the full
 * {@link ResultEvent} via `resultEvent` for detailed token usage.
 */
export interface TurnResult {
  /** The final text response for this turn. `undefined` if structured output only. */
  result?: string;
  /** Parsed structured output (when `jsonSchema` option was used). */
  structuredOutput?: unknown;
  /** Session UUID (same across all turns). */
  sessionId: string;
  /** Cost for this turn in USD. */
  costUsd?: number;
  /** Wall-clock duration for this turn in milliseconds. */
  durationMs?: number;
  /** Number of agentic turns the model took. */
  numTurns?: number;
  /** Full {@link ResultEvent} with complete usage details. */
  resultEvent: ResultEvent;
}

/**
 * A single conversation turn — an async iterable of {@link StreamEvent} values.
 *
 * Iterate to stream events, or await `.result` to skip streaming and just
 * get the final {@link TurnResult}.
 *
 * @example
 * const turn = conv.send('Hello');
 * for await (const event of turn) {
 *   if (event.type === 'assistant') process.stdout.write(event.delta ?? '');
 * }
 * const result = await turn.result;
 */
export interface Turn extends AsyncIterable<StreamEvent> {
  /** Resolves with the {@link TurnResult} when the model finishes responding. */
  readonly result: Promise<TurnResult>;
}

/**
 * A tool result to send back to Claude via {@link Conversation.sendToolResult}.
 *
 * Build this from a {@link ToolUseEvent} you intercepted during streaming.
 */
export interface ToolResultContent {
  /** The `toolId` from the {@link ToolUseEvent} this responds to. */
  toolUseId: string;
  /**
   * The tool's return value. Pass any structured object, array, primitive,
   * or string — the SDK JSON-stringifies internally for the MCP wire.
   */
  value: unknown;
  /** Set `true` to signal that the tool call failed. */
  isError?: boolean;
}

/**
 * A persistent multi-turn conversation backed by a single CLI process.
 *
 * Created by {@link createConversation}. The CLI process is spawned lazily
 * on the first `send()` or `sendAndCollect()` call.
 *
 * Implements `AsyncDisposable` — use `await using conv = createConversation()`
 * for automatic cleanup, or call `close()` manually.
 *
 * @example
 * await using conv = createConversation({ maxTurns: 5, dangerouslySkipPermissions: true });
 * const r1 = await conv.sendAndCollect('My name is Alice');
 * const r2 = await conv.sendAndCollect('What is my name?');
 * console.log(r2.result); // "Your name is Alice"
 */
export interface Conversation extends AsyncDisposable {
  /** Session UUID. Resolves after the first message is sent and the init event arrives. */
  readonly sessionId: Promise<string>;

  /**
   * Send a user message and stream events for this turn.
   *
   * @param content - The user message text.
   * @returns A {@link Turn} — async iterable of events with a `.result` promise.
   */
  send(content: string): Turn;

  /**
   * Send a user message and wait for the complete result (no streaming).
   *
   * Internally iterates the turn to drive event processing (including tool handlers),
   * then returns the final {@link TurnResult}.
   *
   * @param content - The user message text.
   */
  sendAndCollect(content: string): Promise<TurnResult>;

  /**
   * Send one or more tool results back to Claude for intercepted tool calls.
   *
   * Use this when you detect a {@link ToolUseEvent} that you want to handle
   * yourself (e.g. `AskUserQuestion`) rather than letting the CLI execute it.
   * Returns a {@link Turn} that streams Claude's subsequent response.
   *
   * For automatic tool interception, prefer `toolHandlers` in
   * {@link ConversationOptions} — the SDK handles the send/receive loop for you.
   *
   * @param results - One or more {@link ToolResultContent} objects.
   *
   * @example
   * for await (const event of turn) {
   *   if (event.type === 'tool_use' && event.toolName === 'AskUserQuestion') {
   *     const answer = await getUserAnswer(event.toolInput);
   *     const nextTurn = conv.sendToolResult([{
   *       toolUseId: event.toolId,
   *       content: JSON.stringify({ answers: answer }),
   *     }]);
   *     for await (const e of nextTurn) { ... }
   *   }
   * }
   */
  sendToolResult(results: ToolResultContent[]): Turn;

  /** `true` while the CLI process is running and accepting messages. */
  readonly isOpen: boolean;

  /** Close the conversation — ends stdin, sends SIGTERM, and cleans up resources. */
  close(): Promise<void>;

  /** Abort the current turn by signaling the abort controller. */
  abort(): void;
}

// ============================================
// CONVERSATION FACTORY
// ============================================

/**
 * Create a persistent two-way conversation backed by a single CLI process.
 *
 * Uses `--input-format stream-json` so multiple messages share the same
 * session without `--resume` overhead. The process is spawned lazily on the
 * first call to `send()` or `sendAndCollect()`.
 *
 * Use `await using` for automatic cleanup, or call `close()` manually.
 *
 * **Default turn timeout**: 600,000 ms (10 minutes). Override with `options.timeout`.
 * Set to `0` or `Infinity` for unlimited.
 *
 * @param options - Conversation options. See {@link ConversationOptions}.
 * @returns A {@link Conversation} handle.
 *
 * @throws {CLINotFoundError} If the `claude` binary is not in PATH (on first send).
 * @throws {CLITimeoutError} If a turn exceeds `options.timeout`.
 * @throws {CLIError} If the CLI process exits unexpectedly.
 *
 * @example
 * // Simple multi-turn (no streaming)
 * await using conv = createConversation({ maxTurns: 5 });
 * await conv.sendAndCollect('My name is Alice');
 * const r = await conv.sendAndCollect('What is my name?');
 * console.log(r.result); // "Your name is Alice"
 *
 * @example
 * // Streaming events from a turn
 * await using conv = createConversation({ maxTurns: 3 });
 * const turn = conv.send('Explain closures');
 * for await (const event of turn) {
 *   if (event.type === 'assistant') process.stdout.write(event.delta ?? '');
 * }
 * const result = await turn.result;
 *
 * @example
 * // With tool handlers for interactive skills
 * await using conv = createConversation({
 *   toolHandlers: {
 *     AskUserQuestion: askUserQuestionHandler(q => rl.question(q + ' ')),
 *   },
 * });
 */
export function createConversation(options: ConversationOptions = {}): Conversation {
  let proc: ChildProcess | null = null;
  let _isOpen = false;
  let lineHandler: ((line: string) => void) | null = null;
  let closeHandler: ((exitCode: number | null) => void) | null = null;
  let _toolServerClose: (() => Promise<void>) | undefined;

  const ac = options.abortController ?? new AbortController();
  /** Per-turn timeout in ms. Default 600s; 0 or Infinity = unlimited. */
  const turnTimeout = options.timeout ?? 600_000;
  const hasHandlers = options.toolHandlers && Object.keys(options.toolHandlers).length > 0;

  const sessionId = createDeferredPromise<string>();

  // Collect stderr for error messages
  const stderrChunks: string[] = [];
  let spawnError: Error | null = null;

  // Lazy init — spawn on first send()
  async function ensureProcess(): Promise<ChildProcess> {
    if (proc && _isOpen) return proc;

    const { args, tempFiles, toolServerClose } = await buildConversationArgs(options);
    _toolServerClose = toolServerClose;
    const spawnResult = spawnCli(
      args,
      { workDir: options.workDir, env: options.env, keepStdinOpen: true },
      tempFiles,
    );
    proc = spawnResult.proc;
    _isOpen = true;

    // Collect stderr for error reporting
    proc.stderr?.on("data", (chunk: unknown) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk));
    });

    // Handle ENOENT spawn error — store and propagate to active turn
    attachSpawnErrorHandler(proc, (err: Error) => {
      spawnError = err;
      _isOpen = false;
      closeHandler?.(1);
    });

    const rl = createInterface({ input: proc.stdout! });
    rl.on("line", (line: string) => {
      lineHandler?.(line);
    });
    rl.on("close", () => {
      _isOpen = false;
      closeHandler?.(proc?.exitCode ?? null);
    });

    proc.on("close", (code: number | null) => {
      _isOpen = false;
      closeHandler?.(code);
    });

    ac.signal.addEventListener(
      "abort",
      () => {
        proc?.kill("SIGTERM");
        _isOpen = false;
      },
      { once: true },
    );

    return proc;
  }

  /**
   * Shared turn creation: sets up line handler, event queue, and result promise.
   * Writes the given JSON message to stdin after ensuring the process is alive.
   */
  function createTurn(stdinMessage: string): Turn {
    const turnResult = createDeferredPromise<TurnResult>();
    // Prevent unhandled rejection if caller only uses the iterable
    turnResult.promise.catch(() => {});

    const eventQueue: StreamEvent[] = [];
    let eventResolve: (() => void) | null = null;
    let turnDone = false;
    let turnError: Error | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    /** Mark turn as done with an error, waking any pending iterator. */
    function failTurn(err: Error): void {
      if (turnDone) return;
      turnDone = true;
      turnError = err;
      turnResult.reject(err);
      eventResolve?.();
      eventResolve = null;
    }

    // Set up per-turn timeout (0 or Infinity = unlimited)
    if (turnTimeout > 0 && isFinite(turnTimeout)) {
      timeoutId = setTimeout(() => {
        failTurn(new CLITimeoutError(turnTimeout));
        proc?.kill("SIGTERM");
      }, turnTimeout);
    }

    // Wire process exit to wake this turn's iterator
    closeHandler = (exitCode: number | null) => {
      if (!turnDone) {
        const stderr = stderrChunks.join("");
        failTurn(
          new CLIError(exitCode ?? 1, stderr || "CLI process exited without a result event"),
        );
      }
    };

    lineHandler = (line: string) => {
      const event = parseStreamLine(line);
      if (!event) return;

      if (event.type === "system" && event.subtype === "init") {
        sessionId.resolve(event.sessionId);
        options.onSessionReady?.(event.sessionId);
      }

      eventQueue.push(event);
      eventResolve?.();
      eventResolve = null;

      if (event.type === "result") {
        turnDone = true;
        if (timeoutId) clearTimeout(timeoutId);
        turnResult.resolve({
          result: event.result,
          structuredOutput: event.structuredOutput,
          sessionId: event.sessionId,
          costUsd: event.costUsd,
          durationMs: event.durationMs,
          numTurns: event.numTurns,
          resultEvent: event,
        });
      }
    };

    ensureProcess()
      .then((p) => {
        p.stdin!.write(stdinMessage + "\n");
      })
      .catch((err: Error) => {
        failTurn(err instanceof CLIError ? err : new CLIError(1, err.message));
      });

    async function* iterateEvents(): AsyncGenerator<StreamEvent> {
      try {
        while (true) {
          while (eventQueue.length > 0) {
            yield eventQueue.shift()!;
          }
          if (turnDone) break;
          await new Promise<void>((resolve) => {
            eventResolve = resolve;
            // Guard against events arriving between the check above and here
            if (turnDone || eventQueue.length > 0) resolve();
          });
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      // If the turn ended with an error (process exit, timeout), throw it
      if (turnError) throw turnError;
    }

    return {
      [Symbol.asyncIterator]() {
        return iterateEvents();
      },
      get result() {
        return turnResult.promise;
      },
    };
  }

  async function invokeToolHandler(
    handler: ToolHandler,
    event: ToolUseEvent,
  ): Promise<ToolResultContent> {
    try {
      const result = await handler(event);
      // Two acceptable shapes: a bare value (success) or a structured
      // `{ value, isError? }` for explicit error signaling. Anything that
      // looks like the structured form is treated as such; everything else
      // is treated as a bare value.
      if (
        result !== null &&
        typeof result === "object" &&
        "value" in (result as Record<string, unknown>)
      ) {
        const r = result as { value: unknown; isError?: boolean };
        return { toolUseId: event.toolId, value: r.value, isError: r.isError };
      }
      return { toolUseId: event.toolId, value: result };
    } catch (err) {
      // Throws from the handler surface as `isError: true` with the message
      // string as the value. Lets handlers signal unexpected failures
      // ergonomically without constructing the structured shape.
      return {
        toolUseId: event.toolId,
        value: err instanceof Error ? err.message : String(err),
        isError: true,
      };
    }
  }

  function createHandledTurn(stdinMessage: string): Turn {
    const handlers = options.toolHandlers!;
    const finalResult = createDeferredPromise<TurnResult>();
    finalResult.promise.catch(() => {});

    async function* iterateWithHandlers(): AsyncGenerator<StreamEvent> {
      let currentTurn = createTurn(stdinMessage);

      try {
        while (true) {
          let intercepted: ToolResultContent | null = null;

          for await (const event of currentTurn) {
            yield event;

            if (!intercepted && event.type === "tool_use" && handlers[event.toolName]) {
              const result = await invokeToolHandler(handlers[event.toolName]!, event);
              intercepted = result;

              yield {
                type: "tool_result" as const,
                toolId: event.toolId,
                value: result.value,
                isError: result.isError,
              };

              break;
            }

            if (event.type === "result") {
              finalResult.resolve({
                result: event.result,
                structuredOutput: event.structuredOutput,
                sessionId: event.sessionId,
                costUsd: event.costUsd,
                durationMs: event.durationMs,
                numTurns: event.numTurns,
                resultEvent: event,
              });
              return;
            }
          }

          if (intercepted) {
            const msg = JSON.stringify({
              type: "user",
              message: {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: intercepted.toolUseId,
                    // MCP wire requires text. JSON-stringify the structured
                    // value here so the receive side can parse it back.
                    content: JSON.stringify(intercepted.value),
                    is_error: intercepted.isError ?? false,
                  },
                ],
              },
            });
            currentTurn = createTurn(msg);
          } else {
            break;
          }
        }
      } catch (err) {
        finalResult.reject(err);
        throw err;
      }
    }

    return {
      [Symbol.asyncIterator]() {
        return iterateWithHandlers();
      },
      get result() {
        return finalResult.promise;
      },
    };
  }

  function send(content: string): Turn {
    const msg = JSON.stringify({
      type: "user",
      message: { role: "user", content },
    });
    return hasHandlers ? createHandledTurn(msg) : createTurn(msg);
  }

  function sendToolResult(results: ToolResultContent[]): Turn {
    const msg = JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.toolUseId,
          // MCP wire requires text on the content field. We JSON-stringify
          // the structured value here so callers don't have to. The receive
          // side (parseStreamLine + extractToolResultValue) inverts this.
          content: JSON.stringify(r.value),
          is_error: r.isError ?? false,
        })),
      },
    });
    return createTurn(msg);
  }

  async function sendAndCollect(content: string): Promise<TurnResult> {
    const turn = send(content);
    try {
      for await (const _ of turn) {
        // no-op; drives lineHandler + tool handlers
      }
    } catch {
      // Error captured in turn.result (rejected)
    }
    return turn.result;
  }

  async function close(): Promise<void> {
    if (proc && _isOpen) {
      proc.stdin?.end();
      proc.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        proc!.on("close", () => resolve());
        setTimeout(resolve, 5_000);
      });
    }
    _isOpen = false;
    if (_toolServerClose) {
      await _toolServerClose();
      _toolServerClose = undefined;
    }
  }

  return {
    get sessionId() {
      return sessionId.promise;
    },
    send,
    sendAndCollect,
    sendToolResult,
    get isOpen() {
      return _isOpen;
    },
    close,
    abort() {
      ac.abort();
    },
    async [Symbol.asyncDispose]() {
      await close();
    },
  };
}
