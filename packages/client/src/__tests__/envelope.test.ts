import { describe, expect, it } from "vitest";
import { IpcError, unwrapEnvelope } from "../transport/envelope.js";

describe("unwrapEnvelope", () => {
  it("returns the value on a success envelope", () => {
    const out = unwrapEnvelope({ ok: true, value: 42 });
    expect(out).toBe(42);
  });

  it("throws an IpcError on a failure envelope", () => {
    expect(() =>
      unwrapEnvelope({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "bad input",
          requestId: "req-1",
        },
      }),
    ).toThrow(IpcError);
  });

  it("preserves code and requestId on the thrown IpcError", () => {
    try {
      unwrapEnvelope({
        ok: false,
        error: {
          code: "INTERNAL",
          message: "An internal error occurred",
          requestId: "req-abc",
        },
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IpcError);
      if (err instanceof IpcError) {
        expect(err.code).toBe("INTERNAL");
        expect(err.requestId).toBe("req-abc");
        expect(err.message).toBe("An internal error occurred");
      }
    }
  });

  it("passes through a non-envelope value unchanged (legacy channels)", () => {
    expect(unwrapEnvelope(42 as unknown as number)).toBe(42);
    expect(unwrapEnvelope("hello" as unknown as string)).toBe("hello");
    expect(unwrapEnvelope(null as unknown as null)).toBe(null);
    expect(unwrapEnvelope(undefined as unknown as undefined)).toBe(undefined);
  });

  it("passes through a plain object that doesn't match the envelope shape", () => {
    const value = { foo: "bar", ok: "not-a-boolean" };
    expect(unwrapEnvelope(value as unknown as typeof value)).toEqual(value);
  });

  it("treats { ok: true, value: undefined } as a valid success envelope", () => {
    const out = unwrapEnvelope({ ok: true, value: undefined as unknown });
    expect(out).toBeUndefined();
  });

  it("does NOT treat { ok: false } without a proper error as an envelope", () => {
    // Without `error` key, it's not a valid failure envelope; passthrough.
    const value = { ok: false };
    expect(unwrapEnvelope(value as unknown as typeof value)).toEqual(value);
  });

  // Collision-shape regression: a legacy channel that happens to return an
  // object with an `ok` key (but not a real envelope) must pass through
  // unchanged. The shape-check requires `ok === true` (strict boolean) AND
  // a `value` key in the same object (see isEnvelope in envelope.ts).
  it("passes through { ok: 'truthy-non-bool' } as a legacy value (shape-check is strict)", () => {
    expect(unwrapEnvelope({ ok: "truthy-but-not-bool" } as never)).toEqual({
      ok: "truthy-but-not-bool",
    });
  });

  it("passes through { ok: true } without a 'value' key as a legacy value", () => {
    expect(unwrapEnvelope({ ok: true } as never)).toEqual({ ok: true });
  });
});
