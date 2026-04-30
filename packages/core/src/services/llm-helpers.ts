/**
 * Shared LLM output helpers used across services.
 *
 * Consolidated from Phase 6's bootstrap/extractor.ts and Phase 7's
 * misconception-indexer.ts — both had inline copies with slight variations.
 * Single source of truth for fenced-JSON parsing.
 */

/**
 * Extract and parse a JSON block from LLM output.
 *
 * Tries in order:
 *   1. Fenced ```json ... ``` block
 *   2. First `[...]` array in the text
 *   3. First `{...}` object in the text
 *
 * Returns `null` when no JSON block can be found.
 * Returns `unknown` (caller must validate with Zod) when parsing succeeds.
 * Throws a SyntaxError propagated from JSON.parse when the block is found but
 * cannot be parsed — callers should catch and treat as `null`.
 */
export function extractJsonBlock(text: string): unknown | null {
  // 1. Fenced ```json ... ``` block (standard)
  const fence = text.match(/```json\n?([\s\S]*?)\n?```/);
  if (fence?.[1]) {
    return JSON.parse(fence[1].trim());
  }

  // 2. Fenced ``` ... ``` block (without explicit language tag)
  const genericFence = text.match(/```\n?([\s\S]*?)\n?```/);
  if (genericFence?.[1]) {
    const inner = genericFence[1].trim();
    // Only treat as JSON if it starts with { or [
    if (inner.startsWith("{") || inner.startsWith("[")) {
      return JSON.parse(inner);
    }
  }

  // 3. Bare JSON object {...}
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    return JSON.parse(text.slice(objStart, objEnd + 1));
  }

  // 4. Bare JSON array [...]
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    return JSON.parse(text.slice(arrStart, arrEnd + 1));
  }

  return null;
}
