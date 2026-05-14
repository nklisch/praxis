import type { SubAgentEvent, SubAgentItem } from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

const C = {
  streamBase: "praxis.subAgent.events",
  list: "praxis.subAgent.list",
} as const;

/**
 * Typed renderer-side client for sub-agent transparency events.
 * `events()` opens a persistent stream and delivers each `SubAgentEvent` as it
 * arrives. The server sends a `snapshot` first so the renderer sees current state
 * immediately on subscribe.
 *
 * `events({ parentCallId })` filters the stream to a single sub-agent item —
 * useful for the inline `<SubAgentBlock>` component that subscribes per tool call.
 */
export class SubAgentClient {
  constructor(private readonly transport: ClientTransport) {}

  events(input?: { parentCallId?: string }): AsyncIterable<SubAgentEvent> {
    return this.transport.stream<SubAgentEvent>(C.streamBase, input?.parentCallId);
  }

  async list(): Promise<readonly SubAgentItem[]> {
    const result = await this.transport.invoke<
      IpcEnvelope<readonly SubAgentItem[]> | readonly SubAgentItem[]
    >(C.list, undefined);
    return unwrapEnvelope(result);
  }
}
