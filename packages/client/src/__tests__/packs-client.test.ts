/**
 * Unit tests for PacksClient — Phase 10.
 *
 * Verifies that PacksClientImpl routes each method to the correct IPC channel
 * with the correct arguments. Uses a stub ClientTransport that records invocations.
 *
 * Covers:
 *  - listAvailable routes to praxis.packs.listAvailable
 *  - listImported routes to praxis.packs.listImported
 *  - import routes to praxis.packs.import with packId argument
 *  - client has packs property
 */
import { describe, expect, it } from "vitest";
import { createPraxisClient } from "../client.js";
import type { ClientTransport } from "../transport/types.js";

function makeTransport(): {
  transport: ClientTransport;
  invokedChannels: Array<{ channel: string; args: unknown[] }>;
} {
  const invokedChannels: Array<{ channel: string; args: unknown[] }> = [];
  const transport: ClientTransport = {
    invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
      invokedChannels.push({ channel, args });
      return Promise.resolve(undefined as unknown as T);
    },
    send(_channel: string, ..._args: unknown[]): void {},
    stream<T>(_channel: string, ..._args: unknown[]): AsyncIterable<T> {
      return {
        [Symbol.asyncIterator]() {
          return { next: () => Promise.resolve({ done: true, value: undefined as T }) };
        },
      };
    },
  };
  return { transport, invokedChannels };
}

describe("PacksClient", () => {
  it("client has packs property", () => {
    const { transport } = makeTransport();
    const client = createPraxisClient(transport);
    expect(client.packs).toBeDefined();
  });

  it("listAvailable routes to praxis.packs.listAvailable", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.packs.listAvailable();
    expect(invokedChannels[0]?.channel).toBe("praxis.packs.listAvailable");
    expect(invokedChannels[0]?.args).toHaveLength(0);
  });

  it("listImported routes to praxis.packs.listImported", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.packs.listImported();
    expect(invokedChannels[0]?.channel).toBe("praxis.packs.listImported");
  });

  it("import routes to praxis.packs.import with packId argument", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.packs.import("algebra-1");
    expect(invokedChannels[0]?.channel).toBe("praxis.packs.import");
    expect(invokedChannels[0]?.args[0]).toBe("algebra-1");
  });
});
