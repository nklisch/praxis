import type { DebugTraceContext } from "@praxis/core/types";

/**
 * Threads a per-turn debug trace context through a long-lived session so MCP
 * tool-call handlers registered once at `open()` time can read the active
 * turn's trace when dispatching tools.
 */
export class TraceThreader {
  private current: DebugTraceContext | undefined = undefined;

  readonly getTrace = (): DebugTraceContext | undefined => this.current;

  enter(trace: DebugTraceContext | undefined): void {
    this.current = trace;
  }

  exit(): void {
    this.current = undefined;
  }
}
