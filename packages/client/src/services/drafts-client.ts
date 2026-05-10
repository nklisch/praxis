import type {
  DraftStreamClient as DraftStreamClientPort,
  DraftStreamEvent,
} from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  streamBase: "praxis.bootstrap.drafts.events",
} as const;

/**
 * Renderer-side client for the bootstrap-mode draft stream. `events()` opens
 * a persistent stream and returns each `DraftStreamEvent` as it arrives. The
 * server delivers a `snapshot` first so the renderer sees current state
 * immediately on subscribe.
 *
 * Mirrors `ActivityClient` — same shape, same transport conventions, just a
 * different domain.
 */
export class DraftsClient implements DraftStreamClientPort {
  constructor(private readonly transport: ClientTransport) {}

  events(): AsyncIterable<DraftStreamEvent> {
    return this.transport.stream<DraftStreamEvent>(C.streamBase, undefined);
  }
}
