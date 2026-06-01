import type { LogClientApi, LogRecord } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const LOG_CHANNEL = "praxis.log.record" as const;

export class LogClient implements LogClientApi {
  constructor(private readonly transport: ClientTransport) {}

  record(record: LogRecord): void {
    try {
      this.transport.send(LOG_CHANNEL, record);
    } catch (err) {
      console.warn("[praxis] renderer log sink failed", err);
    }
  }
}
