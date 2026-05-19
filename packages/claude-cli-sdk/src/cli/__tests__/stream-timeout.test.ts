/**
 * Regression tests for the wall-clock timeout escape hatch in streamEvents.
 *
 * The gate predicate in stream.ts is `timeout > 0 && isFinite(timeout)`:
 * only schedule a SIGTERM timer when a positive, finite timeout is provided.
 * Passing 0 or Infinity disables the timer entirely — the contract that lets
 * the drafter run long textbook reads without a wall-clock kill.
 *
 * These tests verify:
 *   1. timeout:0 — no timer scheduled, proc.kill never called
 *   2. timeout:Infinity — same guarantee
 *   3. timeout:300000 — timer fires, CLITimeoutError is thrown
 */

import type { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLITimeoutError } from "../../errors.js";
import { streamEvents } from "../stream.js";

// A well-formed result line that parseStreamLine can decode into a result event.
const RESULT_LINE = JSON.stringify({
  type: "result",
  subtype: "success",
  session_id: "test-session",
  is_error: false,
});

/**
 * Build a minimal fake ChildProcess. stdout is a real PassThrough so
 * readline.createInterface works without errors. The kill function is spied
 * so tests can assert on SIGTERM delivery.
 */
function makeFakeProc(): {
  proc: ChildProcess;
  /** Push a NDJSON line to stdout (adds trailing newline automatically). */
  pushLine: (line: string) => void;
  /** Signal that stdout is done (readline 'close' event fires). */
  closeStdout: () => void;
  killMock: ReturnType<typeof vi.fn>;
} {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const killMock = vi.fn(() => true);

  // Minimal subset of ChildProcess that streamEvents actually touches.
  const closeListeners: Array<(code: number | null) => void> = [];
  const proc = {
    stdout,
    stderr,
    kill: killMock,
    exitCode: null as number | null,
    on(event: string, cb: (...args: unknown[]) => void) {
      if (event === "close") closeListeners.push(cb as (code: number | null) => void);
      return this;
    },
  } as unknown as ChildProcess;

  function pushLine(line: string): void {
    stdout.push(`${line}\n`);
  }

  function closeStdout(): void {
    stdout.push(null); // EOF → readline emits 'close'
  }

  return { proc, pushLine, closeStdout, killMock };
}

describe("streamEvents — wall-clock timeout gate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("timeout:0 does not schedule a setTimeout (proc.kill is never called)", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const { proc, pushLine, closeStdout, killMock } = makeFakeProc();

    const gen = streamEvents(proc, 0);

    // Drive the stream: emit a result line so the generator completes normally.
    pushLine(RESULT_LINE);
    closeStdout();

    // Drain the generator to its natural end.
    const events = [];
    for await (const ev of gen) {
      events.push(ev);
    }

    // Advance fake timers all the way — nothing should fire.
    vi.advanceTimersByTime(Number.MAX_SAFE_INTEGER);

    expect(killMock).not.toHaveBeenCalled();
    // streamEvents must not have called setTimeout with a positive delay.
    // (clearTimeout(undefined) in the finally block is a harmless no-op and is
    // allowed — we only care no kill timer was scheduled.)
    const killTimerCalls = setTimeoutSpy.mock.calls.filter(
      ([, delay]) => typeof delay === "number" && delay > 0,
    );
    expect(killTimerCalls).toHaveLength(0);
  });

  it("timeout:Infinity does not schedule a setTimeout (proc.kill is never called)", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const { proc, pushLine, closeStdout, killMock } = makeFakeProc();

    const gen = streamEvents(proc, Infinity);

    pushLine(RESULT_LINE);
    closeStdout();

    const events = [];
    for await (const ev of gen) {
      events.push(ev);
    }

    vi.advanceTimersByTime(Number.MAX_SAFE_INTEGER);

    expect(killMock).not.toHaveBeenCalled();
    const killTimerCalls = setTimeoutSpy.mock.calls.filter(
      ([, delay]) => typeof delay === "number" && delay > 0,
    );
    expect(killTimerCalls).toHaveLength(0);
  });

  it("timeout:300000 fires CLITimeoutError when the stream does not complete in time", async () => {
    const { proc, killMock } = makeFakeProc();

    // Do NOT push any lines — stream stays open until the timer fires.
    const gen = streamEvents(proc, 300_000);

    let caughtError: unknown;
    const drainPromise = (async () => {
      try {
        for await (const _ of gen) {
          /* generator stalls waiting for a line */
        }
      } catch (err) {
        caughtError = err;
      }
    })();

    // Advance past the 300-second wall-clock limit; the timer callback runs,
    // calls proc.kill("SIGTERM"), sets done=true, and resolveNext fires so the
    // generator unblocks and throws CLITimeoutError.
    await vi.advanceTimersByTimeAsync(300_001);

    await drainPromise;

    expect(killMock).toHaveBeenCalledWith("SIGTERM");
    expect(caughtError).toBeInstanceOf(CLITimeoutError);
    expect((caughtError as CLITimeoutError).timeoutMs).toBe(300_000);
  });
});
