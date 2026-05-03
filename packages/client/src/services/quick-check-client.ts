import type { QuickCheckAnswer, QuickCheckEvent } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  streamBase: "praxis.quickCheck.events",
  resolve: "praxis.quickCheck.resolve",
} as const;

/**
 * Phase 17: Typed renderer-side client for the QuickCheck rail.
 *
 * `events()` opens a persistent stream and yields each `QuickCheckEvent`
 * (pending + resolved) as it arrives. The renderer's chat surface subscribes
 * to this stream to render and update `<QuickCheckCard>` instances.
 *
 * `resolve()` is called when the student submits an answer.
 */
export class QuickCheckClient {
  constructor(private readonly transport: ClientTransport) {}

  events(): AsyncIterable<QuickCheckEvent> {
    return this.transport.stream<QuickCheckEvent>(C.streamBase, undefined);
  }

  resolve(input: { callId: string; answer: QuickCheckAnswer }): Promise<void> {
    return this.transport.invoke<void>(C.resolve, input);
  }
}
