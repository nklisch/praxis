import { describe, expect, it } from "vitest";
import { redactSecrets, serializeError, serializeErrorRedacted } from "../errors.js";

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

describe("redactSecrets", () => {
  it("redacts an Anthropic sk-ant key while keeping the prefix", () => {
    expect(redactSecrets("apiKey=sk-ant-abc123-def456")).toBe("apiKey=sk-ant-[REDACTED]");
  });

  it("redacts a generic OpenAI-style sk- key", () => {
    expect(redactSecrets("Authorization: sk-1234567890abcdef")).toBe(
      "Authorization: sk-[REDACTED]",
    );
  });

  it("redacts an xAI key while keeping the prefix", () => {
    expect(redactSecrets("token=xai-abcdef123")).toBe("token=xai-[REDACTED]");
  });

  it("redacts a Groq gsk_ key while keeping the prefix", () => {
    expect(redactSecrets("key=gsk_abcdef123")).toBe("key=gsk_[REDACTED]");
  });

  it("redacts a Bearer token (case-insensitive)", () => {
    expect(redactSecrets("Authorization: Bearer eyJ.aaa.bbb")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
    expect(redactSecrets("authorization: bearer abc123def456")).toBe(
      "authorization: Bearer [REDACTED]",
    );
  });

  it("redacts JWT-shaped strings (three base64url segments)", () => {
    expect(redactSecrets("token=abcdefgh.ijklmnop.qrstuvwx and friends")).toBe(
      "token=[REDACTED_JWT] and friends",
    );
  });

  it("redacts URL-embedded ?key= and &authorization= values", () => {
    expect(redactSecrets("GET https://api.example.com/v1?key=secret123&user=alice")).toContain(
      "key=[REDACTED]",
    );
    expect(redactSecrets("https://api.example.com/?api_key=xyz&format=json")).toContain(
      "api_key=[REDACTED]",
    );
    expect(redactSecrets("/v1/foo?authorization=eyJabc&q=1")).toContain("authorization=[REDACTED]");
  });

  it("redacts the value but preserves the param name", () => {
    const out = redactSecrets("?password=hunter2");
    expect(out).toBe("?password=[REDACTED]");
  });

  it("redacts a production-shaped Anthropic key with dashes and underscores in body", () => {
    expect(
      redactSecrets(
        "API_KEY=sk-ant-api03-AbCdEfG_HiJkL-MnOpQ_RsTuV-WxYz1234567890_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AAAAAAAA",
      ),
    ).toContain("sk-ant-[REDACTED]");
  });

  it("redacts a key embedded inside a stack trace line", () => {
    expect(
      redactSecrets(
        "    at fetch (file:///x.js:42:1) [Authorization: Bearer sk-ant-api03-abc...]",
      ),
    ).toContain("[REDACTED]");
  });

  it("is a no-op on plain text", () => {
    expect(redactSecrets("no secrets here")).toBe("no secrets here");
  });

  it("is a no-op on empty string", () => {
    expect(redactSecrets("")).toBe("");
  });

  it("handles a mix of patterns in one string", () => {
    const out = redactSecrets("first sk-ant-aaa then Bearer bbbccc and ?token=ddd done");
    expect(out).toContain("sk-ant-[REDACTED]");
    expect(out).toContain("Bearer [REDACTED]");
    expect(out).toContain("token=[REDACTED]");
    expect(out).not.toContain("sk-ant-aaa");
    expect(out).not.toContain("bbbccc");
    expect(out).not.toContain("ddd");
  });
});

describe("serializeErrorRedacted", () => {
  it("redacts secrets in the message", () => {
    const out = serializeErrorRedacted(new Error("connect failed with apiKey=sk-ant-leaked-key"));
    expect(out.message).toContain("sk-ant-[REDACTED]");
    expect(out.message).not.toContain("sk-ant-leaked-key");
  });

  it("redacts secrets in the stack trace", () => {
    const err = new Error("inner");
    err.stack = "Error: inner\n  at foo with sk-ant-stack-leak\n  at bar";
    const out = serializeErrorRedacted(err);
    expect(out.stack).toBeDefined();
    expect(out.stack).toContain("sk-ant-[REDACTED]");
    expect(out.stack).not.toContain("sk-ant-stack-leak");
  });

  it("preserves name and code on a custom error", () => {
    class CustomError extends Error {
      readonly code: string;
      constructor(msg: string) {
        super(msg);
        this.name = "CustomError";
        this.code = "DECRYPTION_FAILED";
      }
    }
    const out = serializeErrorRedacted(new CustomError("plain"));
    expect(out.name).toBe("CustomError");
    expect(out.code).toBe("DECRYPTION_FAILED");
  });

  it("is identity-equivalent to serializeError on a clean message", () => {
    const out = serializeErrorRedacted(new Error("nothing sensitive"));
    expect(out.message).toBe("nothing sensitive");
  });

  it("handles non-Error inputs (string, number, null)", () => {
    expect(serializeErrorRedacted("apiKey=sk-ant-x123").message).toBe("apiKey=sk-ant-[REDACTED]");
    expect(serializeErrorRedacted(42).message).toBe("42");
    expect(serializeErrorRedacted(null).message).toBe("null");
  });

  it("never throws on a circular object input", () => {
    type Circ = { self?: Circ; message: string };
    const a: Circ = { message: "loop" };
    a.self = a;
    expect(() => serializeErrorRedacted(a)).not.toThrow();
  });
});
