import { describe, expect, it } from "vitest";
import { serializeError } from "../errors.js";

describe("serializeError", () => {
  it("extracts message + stack + name from an Error", () => {
    const err = new Error("boom");
    const out = serializeError(err);
    expect(out.message).toBe("boom");
    expect(out.name).toBe("Error");
    expect(typeof out.stack).toBe("string");
    expect(out.stack).toContain("boom");
  });

  it("preserves a custom Error subclass name", () => {
    class CustomError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "CustomError";
      }
    }
    const out = serializeError(new CustomError("nope"));
    expect(out.name).toBe("CustomError");
    expect(out.message).toBe("nope");
  });

  it("extracts code when present on an Error (e.g., Node fs error)", () => {
    const err = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
    const out = serializeError(err);
    expect(out.code).toBe("ENOENT");
    expect(out.message).toBe("ENOENT: no such file");
  });

  it("ignores non-string code on Error", () => {
    const err = Object.assign(new Error("x"), { code: 42 });
    const out = serializeError(err);
    expect(out.code).toBeUndefined();
  });

  it("handles plain object with message field", () => {
    const out = serializeError({ message: "from-object", code: "OBJ_CODE" });
    expect(out.message).toBe("from-object");
    expect(out.code).toBe("OBJ_CODE");
    expect(out.stack).toBeUndefined();
    expect(out.name).toBeUndefined();
  });

  it("handles plain object with non-string message", () => {
    const out = serializeError({ message: 123 });
    expect(out.message).toBe("123");
    expect(out.code).toBeUndefined();
  });

  it("handles plain object with non-string code", () => {
    const out = serializeError({ message: "x", code: 7 });
    expect(out.message).toBe("x");
    expect(out.code).toBeUndefined();
  });

  it("handles a bare string", () => {
    const out = serializeError("oh no");
    expect(out.message).toBe("oh no");
    expect(out.stack).toBeUndefined();
    expect(out.code).toBeUndefined();
    expect(out.name).toBeUndefined();
  });

  it("handles a number", () => {
    const out = serializeError(42);
    expect(out.message).toBe("42");
  });

  it("handles null", () => {
    const out = serializeError(null);
    expect(out.message).toBe("null");
  });

  it("handles undefined", () => {
    const out = serializeError(undefined);
    expect(out.message).toBe("undefined");
  });

  it("handles an object without a message field", () => {
    const out = serializeError({ foo: "bar" });
    expect(out.message).toBe("[object Object]");
  });

  it("never throws on a circular object", () => {
    type Circ = { self?: Circ };
    const a: Circ = {};
    a.self = a;
    expect(() => serializeError(a)).not.toThrow();
  });
});
