import type { Recommendation, RecommendationsClientApi } from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

const C = {
  next: "praxis.recommendations.next",
} as const;

/**
 * RecommendationsClient — thin IPC wrapper over praxis.recommendations.next.
 *
 * Implements the client-side RecommendationsClientApi from @praxis/core/types/client.
 */
class RecommendationsClientImpl implements RecommendationsClientApi {
  constructor(private readonly transport: ClientTransport) {}

  async next(input?: { limit?: number }): Promise<Recommendation[]> {
    const result = await this.transport.invoke<IpcEnvelope<Recommendation[]> | Recommendation[]>(
      C.next,
      input,
    );
    return unwrapEnvelope(result);
  }
}

export { RecommendationsClientImpl as RecommendationsClient };
