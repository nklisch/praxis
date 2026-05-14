/**
 * Convert an arbitrary thrown value into a structured field for logging.
 * Lives in core/types so domain code can format errors consistently without
 * importing from desktop.
 */
export interface SerializedError {
  message: string;
  stack?: string;
  code?: string;
  name?: string;
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    return {
      message: err.message,
      ...(err.stack !== undefined && { stack: err.stack }),
      ...(err.name !== undefined && { name: err.name }),
      ...("code" in err && typeof err.code === "string" && { code: err.code }),
    };
  }
  if (err && typeof err === "object" && "message" in err) {
    const e = err as { message: unknown; code?: unknown };
    return {
      message: String(e.message),
      ...(typeof e.code === "string" && { code: e.code }),
    };
  }
  return { message: String(err) };
}

// ── Secret redactor ───────────────────────────────────────────────────────────
//
// Pattern-based scrubber applied before error fields cross trust boundaries
// (the renderer ↔ main process IPC, the file-log transport). Each pattern is
// a tuple of `[regex, replacement]`. Patterns are ordered roughly by
// specificity — the more-specific provider-key shapes run first so the
// generic "Bearer …" / query-param regexes don't double-process them.
//
// Listing patterns as a `const` tuple makes review obvious: anyone adding a
// pattern lands a single visible array entry, and the test fixtures
// mirror the array one-to-one.

const REDACTION_PATTERNS = [
  // Provider API keys:
  //   sk-ant-…   (Anthropic)
  //   sk-…       (OpenAI / generic OpenAI-style)
  //   xai-…      (xAI / Grok)
  //   gsk_…      (Groq)
  // Preserve the leading prefix so log triage can still tell what *kind*
  // of secret leaked, but redact the body.
  [/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[REDACTED]"],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-[REDACTED]"],
  [/\bxai-[A-Za-z0-9_-]+/g, "xai-[REDACTED]"],
  [/\bgsk_[A-Za-z0-9_-]+/g, "gsk_[REDACTED]"],
  // Bearer tokens — matches `Authorization: Bearer <token>` and friends.
  [/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]"],
  // JWT-shaped: three non-empty base64url segments joined by dots, with a
  // minimum length to avoid false positives on things like "a.b.c".
  [
    /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    "[REDACTED_JWT]",
  ],
  // URL-embedded `?key=…` / `&authorization=…` style query params. Matches
  // the value up to the next `&` or whitespace. Captures the param-name
  // group so we keep the key visible in the log; only the value redacts.
  [
    /([?&](?:key|api_key|apikey|authorization|token|access_token|password|secret))=([^&\s]+)/gi,
    "$1=[REDACTED]",
  ],
] as const satisfies ReadonlyArray<readonly [RegExp, string]>;

/**
 * Scrub common secret-shaped substrings from a string. Applied to error
 * messages and serialized error fields before they reach the file
 * transport or cross the IPC trust boundary. Cheap regex pass — runs in
 * O(n × patterns) and never throws.
 *
 * Recognized shapes:
 *  - Provider keys: `sk-ant-…`, `sk-…`, `xai-…`, `gsk_…`
 *  - Bearer tokens: `Bearer <token>`
 *  - JWT-shaped: three base64url segments joined by `.`
 *  - URL-embedded `?key=…` / `&authorization=…` query params
 */
export function redactSecrets(input: string): string {
  if (typeof input !== "string" || input.length === 0) return input;
  let out = input;
  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Convert `unknown` to a `SerializedError`, then redact secret-shaped
 * substrings from `.message` and `.stack`. This is what the logger's
 * `err` field should be set to on every IPC error path so the file
 * transport never sees a literal provider key.
 *
 * Mirrors `serializeError` exactly; only the post-processing differs.
 */
export function serializeErrorRedacted(err: unknown): SerializedError {
  const base = serializeError(err);
  return {
    ...base,
    message: redactSecrets(base.message),
    ...(base.stack !== undefined && { stack: redactSecrets(base.stack) }),
  };
}
