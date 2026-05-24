/**
 * ConfigClient — IPC trust-boundary tests.
 *
 * Verifies that the ConfigClient surfaces envelope failures correctly, in
 * particular the `apiKeyEncrypted` injection guard: a renderer that passes
 * `apiKeyEncrypted` through `setEngineConfig` must receive `IpcError` with
 * `code: 'VALIDATION_FAILED'` — the main-process envelope layer validates the
 * payload against the public `EngineConfigSchema` (which is `.strict()` and
 * rejects `apiKeyEncrypted`).
 */

import { describe, expect, it } from "vitest";
import { ConfigClient } from "../services/config-client.js";
import { IpcError } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

function makeTransport(
  invokeImpl: (channel: string, ...args: unknown[]) => unknown,
): ClientTransport {
  return {
    invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
      return Promise.resolve(invokeImpl(channel, ...args) as T);
    },
    stream<T>(_channel: string, ..._args: unknown[]): AsyncIterable<T> {
      return {
        [Symbol.asyncIterator]() {
          return { next: () => Promise.resolve({ done: true as const, value: undefined as T }) };
        },
      };
    },
  };
}

describe("ConfigClient.setEngineConfig — envelope failure propagation", () => {
  it("throws IpcError with code='VALIDATION_FAILED' when main process rejects apiKeyEncrypted injection", async () => {
    // Simulate the main-process envelope response: schema validation failed
    // because the renderer tried to smuggle an encrypted blob.
    const transport = makeTransport(() => ({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Unrecognized key(s) in object: 'apiKeyEncrypted'",
        requestId: "req-trust-boundary-1",
      },
    }));

    const client = new ConfigClient(transport);

    // biome-ignore lint/suspicious/noExplicitAny: simulating a malformed renderer payload
    const malformedPayload1 = {
      engineId: "claude-code",
      hasApiKey: false,
      apiKeyEncrypted: "c29tZWJsb2I=",
    } as any;
    await expect(client.setEngineConfig(malformedPayload1)).rejects.toThrow(IpcError);
  });

  it("IpcError.code is 'VALIDATION_FAILED' on the thrown error", async () => {
    const transport = makeTransport(() => ({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Unrecognized key(s) in object: 'apiKeyEncrypted'",
        requestId: "req-trust-boundary-2",
      },
    }));

    const client = new ConfigClient(transport);

    // biome-ignore lint/suspicious/noExplicitAny: simulating a malformed renderer payload
    const malformedPayload2 = {
      engineId: "claude-code",
      hasApiKey: false,
      apiKeyEncrypted: "c29tZWJsb2I=",
    } as any;
    let thrown: unknown;
    try {
      await client.setEngineConfig(malformedPayload2);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(IpcError);
    if (thrown instanceof IpcError) {
      expect(thrown.code).toBe("VALIDATION_FAILED");
      expect(thrown.requestId).toBe("req-trust-boundary-2");
    }
  });

  it("strips hasApiKey from the wire payload before invoking the channel", async () => {
    const invokedArgs: unknown[] = [];
    const transport = makeTransport((_channel, ...args) => {
      invokedArgs.push(...args);
      return { ok: true, value: undefined };
    });

    const client = new ConfigClient(transport);
    await client.setEngineConfig({
      engineId: "direct.anthropic",
      hasApiKey: true,
      model: "claude-sonnet-4-5",
    });

    // The wire payload must not contain hasApiKey — it's stripped by ConfigClient.
    const wirePayload = invokedArgs[0] as Record<string, unknown>;
    expect(wirePayload).not.toHaveProperty("hasApiKey");
    expect(wirePayload.engineId).toBe("direct.anthropic");
    expect(wirePayload.model).toBe("claude-sonnet-4-5");
  });

  it("succeeds (no throw) when main process returns a success envelope", async () => {
    const transport = makeTransport(() => ({ ok: true, value: undefined }));
    const client = new ConfigClient(transport);

    await expect(
      client.setEngineConfig({ engineId: "claude-code", hasApiKey: false }),
    ).resolves.toBeUndefined();
  });
});

describe("ConfigClient.revealApiKey — envelope unwrapping", () => {
  it("returns { apiKey: null } when main process returns that value", async () => {
    const transport = makeTransport(() => ({
      ok: true,
      value: { apiKey: null },
    }));
    const client = new ConfigClient(transport);
    const result = await client.revealApiKey();
    expect(result).toEqual({ apiKey: null });
  });

  it("returns the decrypted key when main process returns one", async () => {
    const transport = makeTransport(() => ({
      ok: true,
      value: { apiKey: "sk-decrypted" },
    }));
    const client = new ConfigClient(transport);
    const result = await client.revealApiKey();
    expect(result).toEqual({ apiKey: "sk-decrypted" });
  });
});

describe("ConfigClient.engineConfig — hasApiKey flag propagation", () => {
  it("returns the snapshot including hasApiKey from the main process", async () => {
    const transport = makeTransport(() => ({
      ok: true,
      value: { engineId: "direct.anthropic", hasApiKey: true, model: "claude-sonnet-4-5" },
    }));
    const client = new ConfigClient(transport);
    const snap = await client.engineConfig();
    expect(snap.hasApiKey).toBe(true);
    expect(snap).not.toHaveProperty("apiKey");
    expect(snap).not.toHaveProperty("apiKeyEncrypted");
  });
});
