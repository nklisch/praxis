import { describe, expect, it } from "vitest";
import { isClaudeAuthRequiredError } from "../lib/auth-error.js";

describe("isClaudeAuthRequiredError", () => {
  // Positive cases
  it("returns true for Error with the auth-required prefix", () => {
    expect(isClaudeAuthRequiredError(new Error("claude.auth.required: not signed in"))).toBe(true);
  });

  it("returns true for Error with prefix and no trailing text", () => {
    expect(isClaudeAuthRequiredError(new Error("claude.auth.required:"))).toBe(true);
  });

  it("returns true for a bare string with the auth-required prefix", () => {
    expect(isClaudeAuthRequiredError("claude.auth.required: something")).toBe(true);
  });

  it("returns true for bare prefix string with no trailing text", () => {
    expect(isClaudeAuthRequiredError("claude.auth.required:")).toBe(true);
  });

  // Negative cases
  it("returns false for an unrelated Error message", () => {
    expect(isClaudeAuthRequiredError(new Error("Engine unavailable"))).toBe(false);
  });

  it("returns false for an unrelated Error with a similar but wrong prefix", () => {
    expect(isClaudeAuthRequiredError(new Error("claude.auth.expired: session"))).toBe(false);
  });

  it("returns false for a string that contains the prefix but does not start with it", () => {
    expect(isClaudeAuthRequiredError("wrapped: claude.auth.required: inner")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isClaudeAuthRequiredError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isClaudeAuthRequiredError(undefined)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isClaudeAuthRequiredError("")).toBe(false);
  });

  it("returns false for a plain object", () => {
    expect(isClaudeAuthRequiredError({})).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isClaudeAuthRequiredError(42)).toBe(false);
  });

  it("returns false for false", () => {
    expect(isClaudeAuthRequiredError(false)).toBe(false);
  });

  it("returns false for 0", () => {
    expect(isClaudeAuthRequiredError(0)).toBe(false);
  });
});
