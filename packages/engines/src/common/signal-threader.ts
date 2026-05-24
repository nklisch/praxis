/**
 * Threads a per-turn `AbortSignal` through a long-lived session so that MCP
 * tool-call handlers registered once at `open()` time can always read the
 * live signal for the current `send()` turn.
 *
 * The pattern is:
 *   1. Pass `threader.getSignal` to `startToolBridge` at open time.
 *   2. At the start of each `send()` call, invoke `threader.enter(signal)`.
 *   3. In the `finally` block of `send()`, invoke `threader.exit()`.
 *
 * Using `enter`/`exit` rather than a single `with(signal, fn)` wrapper keeps
 * the API compatible with `async function*` generators, where the generator
 * body cannot be wrapped in a plain `Promise<T>` callback without fully
 * draining the generator before clearing the signal.
 */
export class SignalThreader {
  private current: AbortSignal | undefined = undefined;

  /**
   * Returns the AbortSignal for the currently active `send()` turn, or
   * `undefined` when no turn is in progress. Pass this to `startToolBridge`
   * so every tool dispatch carries the live per-turn signal.
   */
  readonly getSignal = (): AbortSignal | undefined => this.current;

  /**
   * Called at the start of `send()` to make the turn's signal available to
   * `getSignal`. Always pair with a matching `exit()` in a `finally` block.
   */
  enter(signal: AbortSignal | undefined): void {
    this.current = signal;
  }

  /**
   * Called in the `finally` block of `send()` to clear the signal so a stale
   * aborted signal does not bleed into the next turn.
   */
  exit(): void {
    this.current = undefined;
  }
}
