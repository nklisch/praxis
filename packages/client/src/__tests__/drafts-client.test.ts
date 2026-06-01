/**
 * DraftsClient — wire-protocol channel name test.
 *
 * Pins that `DraftsClient.events()` opens a stream against the renamed channel
 * `praxis.courseCreate.drafts.events` (not the legacy `praxis.bootstrap.*`
 * prefix). This guards against accidental drift if either side of the IPC
 * rename is partially reverted.
 */

import { describe, expect, it } from "vitest";
import { DraftsClient } from "../services/drafts-client.js";
import type { ClientTransport } from "../transport/types.js";

function makeTransport(): {
  transport: ClientTransport;
  streamedChannels: Array<{ channel: string; args: unknown[] }>;
} {
  const streamedChannels: Array<{ channel: string; args: unknown[] }> = [];
  const transport: ClientTransport = {
    invoke<T>(_channel: string, ..._args: unknown[]): Promise<T> {
      return Promise.resolve(undefined as unknown as T);
    },
    send(_channel: string, ..._args: unknown[]): void {},
    stream<T>(channel: string, ...args: unknown[]): AsyncIterable<T> {
      streamedChannels.push({ channel, args });
      return {
        [Symbol.asyncIterator]() {
          return { next: () => Promise.resolve({ done: true as const, value: undefined as T }) };
        },
      };
    },
  };
  return { transport, streamedChannels };
}

describe("DraftsClient", () => {
  it("opens streams against praxis.courseCreate.drafts.events (not legacy praxis.bootstrap.* channel)", () => {
    const { transport, streamedChannels } = makeTransport();
    const client = new DraftsClient(transport);
    client.events();
    expect(streamedChannels[0]?.channel).toBe("praxis.courseCreate.drafts.events");
  });

  it("passes undefined as the stream argument (no filter payload)", () => {
    const { transport, streamedChannels } = makeTransport();
    const client = new DraftsClient(transport);
    client.events();
    // DraftsClient calls transport.stream(C.streamBase, undefined) — the second
    // positional arg is `undefined` (no filter). Confirm it is present and
    // not some other value that could break the server-side handler.
    expect(streamedChannels[0]?.args[0]).toBeUndefined();
  });
});
