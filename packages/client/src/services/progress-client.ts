import type { CourseProgressRollup, ProgressClientApi } from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

const C = {
  rollup: "praxis.progress.rollup",
} as const;

/**
 * ProgressClient — thin IPC wrapper over praxis.progress.rollup.
 *
 * Implements the client-side ProgressClientApi from @praxis/core/types/client.
 */
class ProgressClientImpl implements ProgressClientApi {
  constructor(private readonly transport: ClientTransport) {}

  async rollup(): Promise<CourseProgressRollup[]> {
    const result = await this.transport.invoke<
      IpcEnvelope<CourseProgressRollup[]> | CourseProgressRollup[]
    >(C.rollup, {});
    return unwrapEnvelope(result);
  }
}

export { ProgressClientImpl as ProgressClient };
