import { z } from "zod";

/**
 * Convert a JSON Schema produced by Zod 4's `z.toJSONSchema()` back into a
 * Zod schema. Narrow scope — handles object/string/number/integer/boolean/
 * array, optionals (via property absence in `required`), and `null`. Anything
 * unrecognized falls back to `z.unknown()`. This is sufficient for our test
 * tools and for any tool authored with the conventional Zod 4 JSON Schema
 * output. NOT a general-purpose converter.
 */
export function jsonSchemaToZod(schema: unknown): z.ZodType<unknown> {
  if (!schema || typeof schema !== "object") return z.unknown();
  const s = schema as Record<string, unknown>;
  const type = s.type;
  if (type === "object") {
    const props = (s.properties as Record<string, unknown> | undefined) ?? {};
    const required = new Set((s.required as string[] | undefined) ?? []);
    const shape: Record<string, z.ZodType<unknown>> = {};
    for (const [key, value] of Object.entries(props)) {
      const inner = jsonSchemaToZod(value);
      shape[key] = required.has(key) ? inner : inner.optional();
    }
    return z.object(shape);
  }
  if (type === "array") return z.array(jsonSchemaToZod(s.items));
  if (type === "string") return z.string();
  if (type === "number") return z.number();
  if (type === "integer") return z.number().int();
  if (type === "boolean") return z.boolean();
  if (type === "null") return z.null();
  return z.unknown();
}
