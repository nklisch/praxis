/**
 * AuthoringClientImpl.restoreAction — client-layer envelope unwrapping tests.
 *
 * Verifies that the client method:
 *   - peels a success envelope and returns the RestoreResult payload
 *   - throws IpcError (with correct code) when the envelope carries ok=false
 *   - passes the correct payload to the transport
 *
 * No Electron runtime required — the transport is stubbed at the interface.
 */
import { describe, expect, it } from "vitest";
import { AuthoringClientImpl } from "../services/authoring-client.js";
import { IpcError } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

function makeTransport(
  invokeImpl: (channel: string, ...args: unknown[]) => unknown,
): ClientTransport {
  return {
    invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
      return Promise.resolve(invokeImpl(channel, ...args) as T);
    },
    send(_channel: string, ..._args: unknown[]): void {},
    stream<T>(_channel: string, ..._args: unknown[]): AsyncIterable<T> {
      return {
        [Symbol.asyncIterator]() {
          return { next: () => Promise.resolve({ done: true as const, value: undefined as T }) };
        },
      };
    },
  };
}

describe("AuthoringClientImpl.restoreAction — envelope unwrapping", () => {
  it("returns the RestoreResult payload when the envelope is ok=true", async () => {
    const restoreResult = {
      ok: true as const,
      restoredEntity: "lesson" as const,
      entityKey: "lesson-1",
    };
    const transport = makeTransport(() => ({ ok: true, value: restoreResult }));
    const client = new AuthoringClientImpl(transport);

    const result = await client.restoreAction({ actionId: "action-123" });

    expect(result).toEqual(restoreResult);
  });

  it("returns RestoreResult with ok=false when the service returned no_snapshot", async () => {
    const transport = makeTransport(() => ({
      ok: true,
      value: { ok: false, reason: "no_snapshot" },
    }));
    const client = new AuthoringClientImpl(transport);

    const result = await client.restoreAction({ actionId: "action-missing" });

    expect(result).toEqual({ ok: false, reason: "no_snapshot" });
  });

  it("returns RestoreResult with ok=false when the service returned already_restored", async () => {
    const transport = makeTransport(() => ({
      ok: true,
      value: { ok: false, reason: "already_restored" },
    }));
    const client = new AuthoringClientImpl(transport);

    const result = await client.restoreAction({ actionId: "action-done" });

    expect(result).toEqual({ ok: false, reason: "already_restored" });
  });

  it("throws IpcError with code='VALIDATION_FAILED' when the envelope is ok=false", async () => {
    const transport = makeTransport(() => ({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "actionId is required",
        requestId: "req-val-1",
      },
    }));
    const client = new AuthoringClientImpl(transport);

    await expect(client.restoreAction({ actionId: "" })).rejects.toThrow(IpcError);
  });

  it("IpcError.code is 'VALIDATION_FAILED' on the thrown error", async () => {
    const transport = makeTransport(() => ({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "actionId is required",
        requestId: "req-val-2",
      },
    }));
    const client = new AuthoringClientImpl(transport);

    let thrown: unknown;
    try {
      await client.restoreAction({ actionId: "" });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(IpcError);
    if (thrown instanceof IpcError) {
      expect(thrown.code).toBe("VALIDATION_FAILED");
      expect(thrown.requestId).toBe("req-val-2");
    }
  });

  it("throws IpcError with code='INTERNAL' when the service threw", async () => {
    const transport = makeTransport(() => ({
      ok: false,
      error: {
        code: "INTERNAL",
        message: "An internal error occurred",
        requestId: "req-internal-1",
      },
    }));
    const client = new AuthoringClientImpl(transport);

    let thrown: unknown;
    try {
      await client.restoreAction({ actionId: "action-bad" });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(IpcError);
    if (thrown instanceof IpcError) {
      expect(thrown.code).toBe("INTERNAL");
    }
  });

  it("passes the correct channel and payload to the transport", async () => {
    const calls: Array<{ channel: string; args: unknown[] }> = [];
    const transport = makeTransport((channel, ...args) => {
      calls.push({ channel, args });
      return { ok: true, value: { ok: true, restoredEntity: "course", entityKey: "c-1" } };
    });
    const client = new AuthoringClientImpl(transport);

    await client.restoreAction({ actionId: "action-xyz" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.channel).toBe("praxis.author.restoreAction");
    expect(calls[0]?.args[0]).toEqual({ actionId: "action-xyz" });
  });
});
