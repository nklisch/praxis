import type { ActivityClient as ActivityClientPort, ActivityEvent } from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

const C = {
  streamBase: "praxis.activity.events",
  dismiss: "praxis.activity.dismiss",
} as const;

/**
 * Typed renderer-side client for the activity rail. `events()` opens a
 * persistent stream and returns each `ActivityEvent` as it arrives. The
 * server delivers a `snapshot` first so the renderer sees current state
 * immediately on subscribe.
 */
export class ActivityClient implements ActivityClientPort {
  constructor(private readonly transport: ClientTransport) {}

  events(): AsyncIterable<ActivityEvent> {
    return this.transport.stream<ActivityEvent>(C.streamBase, undefined);
  }

  async dismiss(id: string): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(C.dismiss, id);
    return unwrapEnvelope(result);
  }
}
