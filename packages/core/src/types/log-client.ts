import type { LogRecord } from "./common.js";

export interface LogClientApi {
  /**
   * Best-effort renderer log sink. Implementations must not throw to callers:
   * logging failures must never block or alter UI behavior.
   */
  record(record: LogRecord): void;
}
