import { describe, expect, it } from "vitest";
import { engineError } from "../types/engine.js";

describe("engineError", () => {
  it("returns error with defaults when no opts provided", () => {
    const err = engineError("foo", "bar");
    expect(err).toEqual({ code: "foo", message: "bar", recoverable: false });
    expect(Object.hasOwn(err, "cause")).toBe(false);
  });

  it("returns error with recoverable: true when explicitly set", () => {
    const err = engineError("foo", "bar", { recoverable: true });
    expect(err).toEqual({ code: "foo", message: "bar", recoverable: true });
  });

  it("includes cause when provided", () => {
    const cause = new Error("x");
    const err = engineError("foo", "bar", { cause });
    expect(err).toEqual({ code: "foo", message: "bar", recoverable: false, cause });
    expect(Object.hasOwn(err, "cause")).toBe(true);
  });
});
