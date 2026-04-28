import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jsonSchemaToZod } from "../util/json-schema-to-zod.js";

describe("jsonSchemaToZod", () => {
  it("round-trips a simple object schema", () => {
    const original = z.object({ text: z.string() });
    const jsonSchema = z.toJSONSchema(original, { unrepresentable: "any" });
    const rebuilt = jsonSchemaToZod(jsonSchema);
    expect(rebuilt.safeParse({ text: "x" }).success).toBe(true);
    expect(rebuilt.safeParse({ text: 1 }).success).toBe(false);
  });

  it("handles optional properties", () => {
    const original = z.object({ name: z.string(), age: z.number().optional() });
    const jsonSchema = z.toJSONSchema(original, { unrepresentable: "any" });
    const rebuilt = jsonSchemaToZod(jsonSchema);
    expect(rebuilt.safeParse({ name: "Alice" }).success).toBe(true);
    expect(rebuilt.safeParse({ name: "Alice", age: 30 }).success).toBe(true);
  });

  it("handles string type", () => {
    const schema = jsonSchemaToZod({ type: "string" });
    expect(schema.safeParse("hello").success).toBe(true);
    expect(schema.safeParse(123).success).toBe(false);
  });

  it("handles number type", () => {
    const schema = jsonSchemaToZod({ type: "number" });
    expect(schema.safeParse(3.14).success).toBe(true);
    expect(schema.safeParse("x").success).toBe(false);
  });

  it("handles integer type", () => {
    const schema = jsonSchemaToZod({ type: "integer" });
    expect(schema.safeParse(5).success).toBe(true);
    expect(schema.safeParse(5.5).success).toBe(false);
  });

  it("handles boolean type", () => {
    const schema = jsonSchemaToZod({ type: "boolean" });
    expect(schema.safeParse(true).success).toBe(true);
    expect(schema.safeParse("yes").success).toBe(false);
  });

  it("handles array type", () => {
    const schema = jsonSchemaToZod({ type: "array", items: { type: "string" } });
    expect(schema.safeParse(["a", "b"]).success).toBe(true);
    expect(schema.safeParse([1, 2]).success).toBe(false);
  });

  it("returns z.unknown() for unrecognized schema", () => {
    const schema = jsonSchemaToZod({ type: "unsupported_type" });
    expect(schema.safeParse("anything").success).toBe(true);
    expect(schema.safeParse(42).success).toBe(true);
  });

  it("returns z.unknown() for null input", () => {
    const schema = jsonSchemaToZod(null);
    expect(schema.safeParse("x").success).toBe(true);
  });
});
