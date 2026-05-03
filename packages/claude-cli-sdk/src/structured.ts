import { z } from "zod";
import { StructuredOutputError } from "./errors.js";
import type { JsonSchemaOutputFormat, ResultEvent } from "./types/index.js";

/**
 * Convert a Zod schema to a {@link JsonSchemaOutputFormat} for the CLI's `--json-schema` flag.
 *
 * Uses `z.toJSONSchema()` (Zod 4+) internally. The `$schema` key is automatically
 * removed because the CLI rejects structured output when it's present.
 *
 * @param schema - Any Zod schema (e.g. `z.object({ name: z.string() })`).
 * @param name - Schema name shown to the model (default: `'Output'`).
 * @param strict - Enable strict schema enforcement (default: `true`).
 * @returns A {@link JsonSchemaOutputFormat} object to pass as `options.jsonSchema`.
 *
 * @example
 * const schema = z.object({ name: z.string(), age: z.number() });
 * const jsonSchema = zodToOutputFormat(schema, 'Person');
 * const result = await collectResult(query('Extract person info...', { jsonSchema, maxTurns: 3 }));
 * const person = parseStructuredOutput(schema, result);
 * // person.name, person.age are typed
 */
export function zodToOutputFormat(
  schema: z.ZodType,
  name = "Output",
  strict = true,
): JsonSchemaOutputFormat {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  // Remove $schema — the Claude CLI rejects structured output when it's present
  delete jsonSchema["$schema"];
  return {
    type: "json_schema",
    schema: jsonSchema,
    name,
    strict,
  };
}

/**
 * Parse and validate the `structuredOutput` field from a {@link ResultEvent}.
 *
 * @param schema - The Zod schema to validate against (same one used with `zodToOutputFormat`).
 * @param resultEvent - The {@link ResultEvent} containing `structuredOutput`.
 * @returns The validated and typed data.
 * @throws {StructuredOutputError} If the output does not match the schema.
 */
export function parseStructuredOutput<T extends z.ZodType>(
  schema: T,
  resultEvent: ResultEvent,
): z.infer<T> {
  const raw = resultEvent.structuredOutput;

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new StructuredOutputError(issues, raw);
  }

  return parsed.data as z.infer<T>;
}

/**
 * Drain a {@link Query} generator and return the final {@link ResultEvent}.
 *
 * Use this when you don't need to stream events — it iterates the generator
 * to completion and returns the result.
 *
 * @param gen - A {@link Query} or any async generator that returns a `ResultEvent`.
 * @returns The final {@link ResultEvent}.
 *
 * @example
 * const result = await collectResult(query('What is 2+2?', { maxTurns: 1 }));
 * console.log(result.result, result.costUsd);
 */
export async function collectResult(
  gen: AsyncGenerator<unknown, ResultEvent, unknown>,
): Promise<ResultEvent> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await gen.next();
    if (done) return value as ResultEvent;
  }
}
