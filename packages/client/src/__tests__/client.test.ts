import { describe, expect, it } from "vitest";
import { createPraxisClient } from "../client.js";
import type { ClientTransport } from "../transport/types.js";

function makeTransport(): {
  transport: ClientTransport;
  invokedChannels: Array<{ channel: string; args: unknown[] }>;
  streamedChannels: Array<{ channel: string; args: unknown[] }>;
} {
  const invokedChannels: Array<{ channel: string; args: unknown[] }> = [];
  const streamedChannels: Array<{ channel: string; args: unknown[] }> = [];

  const transport: ClientTransport = {
    invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
      invokedChannels.push({ channel, args });
      return Promise.resolve(undefined as unknown as T);
    },
    stream<T>(channel: string, ...args: unknown[]): AsyncIterable<T> {
      streamedChannels.push({ channel, args });
      return {
        [Symbol.asyncIterator]() {
          return {
            next() {
              return Promise.resolve({ done: true, value: undefined as unknown as T });
            },
          };
        },
      };
    },
  };

  return { transport, invokedChannels, streamedChannels };
}

describe("createPraxisClient", () => {
  it("session.active routes to praxis.session.active invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.session.active();
    expect(invokedChannels[0]?.channel).toBe("praxis.session.active");
  });

  it("session.start routes to praxis.session.start invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.session.start({ modeId: "teach" });
    expect(invokedChannels[0]?.channel).toBe("praxis.session.start");
    expect(invokedChannels[0]?.args[0]).toEqual({ modeId: "teach" });
  });

  it("session.send routes to praxis.session.send stream", () => {
    const { transport, streamedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    // biome-ignore lint/suspicious/noExplicitAny: test
    client.session.send("session-1" as any, "hello");
    expect(streamedChannels[0]?.channel).toBe("praxis.session.send");
  });

  it("session.end routes to praxis.session.end invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    // biome-ignore lint/suspicious/noExplicitAny: test
    await client.session.end("session-1" as any);
    expect(invokedChannels[0]?.channel).toBe("praxis.session.end");
  });

  it("config.engineConfig routes to praxis.config.engineConfig invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.config.engineConfig();
    expect(invokedChannels[0]?.channel).toBe("praxis.config.engineConfig");
  });

  it("config.setEngineConfig routes to praxis.config.setEngineConfig invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.config.setEngineConfig({ engineId: "direct.anthropic" });
    expect(invokedChannels[0]?.channel).toBe("praxis.config.setEngineConfig");
    expect(invokedChannels[0]?.args[0]).toEqual({ engineId: "direct.anthropic" });
  });

  describe("claudeAuth", () => {
    it("claudeAuth.status() routes to praxis.auth.claude.status invoke", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      await client.claudeAuth.status();
      expect(invokedChannels[0]?.channel).toBe("praxis.auth.claude.status");
    });

    it("claudeAuth.login() routes to praxis.auth.claude.login stream", () => {
      const { transport, streamedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // Calling login() returns the AsyncIterable immediately (no await needed)
      client.claudeAuth.login();
      expect(streamedChannels[0]?.channel).toBe("praxis.auth.claude.login");
    });

    it("claudeAuth.login() passes no extra args to transport.stream", () => {
      const { transport, streamedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      client.claudeAuth.login();
      expect(streamedChannels[0]?.args).toEqual([]);
    });
  });

  describe("shell", () => {
    it("shell.openExternal(url) routes to praxis.shell.openExternal invoke with url arg", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      await client.shell.openExternal("https://example.com");
      expect(invokedChannels[0]?.channel).toBe("praxis.shell.openExternal");
      expect(invokedChannels[0]?.args[0]).toBe("https://example.com");
    });
  });
});
