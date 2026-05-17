import type { Logger } from "@praxis/core/types";
import { serializeErrorRedacted } from "@praxis/core/types";
import { v7 as uuidv7 } from "uuid";
import type { z } from "zod";

/**
 * Wire-level envelope. `wrapEnvelope` resolves the IPC promise with this
 * shape and never rejects — surfacing failure as a discriminated union
 * preserves the structured `code` and `requestId` that Electron's
 * Error serialization would otherwise strip.
 *
 * The client peels the envelope via `unwrapEnvelope` (in
 * `@praxis/client/transport/envelope`), converting failure back into a
 * thrown `IpcError` tagged with `.code` and `.requestId`.
 */
export type IpcEnvelope<T> = { ok: true; value: T } | { ok: false; error: IpcEnvelopeError };

/** Stable enum of user-safe failure categories. Renderer drives UX off `code`. */
export type IpcErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export interface IpcEnvelopeError {
  code: IpcErrorCode;
  /** User-safe text. Never contains a stack trace or filesystem path. */
  message: string;
  /** UUIDv7. Same id appears in the main-side log row, so support can join. */
  requestId: string;
}

const GENERIC_INTERNAL_MESSAGE = "An internal error occurred";

/**
 * Wrap an IPC handler so its return value is a discriminated envelope.
 * Throws inside `fn` become `{ ok: false, error: {...} }`. The wrapped
 * handler never rejects — clients see a resolved Promise whose value is
 * either `{ ok: true, value }` or `{ ok: false, error }`.
 *
 * On failure, the original error is logged at `error` level on `log` with
 * the same `requestId` that appears in the envelope, so a support engineer
 * can join the user-safe envelope to the internal stack trace via
 * `requestId` alone.
 *
 * Use composes with `withSchema` for per-channel input validation:
 *
 *   handle(channel, wrapEnvelope(channel, log,
 *     withSchema(MyInputSchema, async (parsed) => { ... })));
 */
export function wrapEnvelope<TArgs extends unknown[], TResult>(
  channel: string,
  log: Logger,
  fn: (...args: TArgs) => Promise<TResult> | TResult,
): (...args: TArgs) => Promise<IpcEnvelope<TResult>> {
  const channelLog = log.child({ component: "ipc-envelope", channel });
  return async (...args: TArgs): Promise<IpcEnvelope<TResult>> => {
    const requestId = uuidv7();
    try {
      const value = await fn(...args);
      return { ok: true, value };
    } catch (err) {
      const envelopeError = toEnvelopeError(err, requestId);
      channelLog.error("ipc.envelope.error", {
        requestId,
        code: envelopeError.code,
        err: serializeErrorRedacted(err),
      });
      return { ok: false, error: envelopeError };
    }
  };
}

/**
 * Map a thrown value to an envelope error. Exported for unit tests.
 *
 * Mapping rules:
 *   - ZodError                       → VALIDATION_FAILED (joined path, never raw message)
 *   - Error w/ allowlisted .code     → INTERNAL with the code stashed in the user-safe message
 *   - Anything else                  → INTERNAL with a generic message
 *
 * The full original message + stack are logged with the same `requestId`
 * on the main side; only the user-safe envelope crosses the wire.
 */
export function toEnvelopeError(err: unknown, requestId: string): IpcEnvelopeError {
  // ZodError → VALIDATION_FAILED. The `issues` field is duck-typed because
  // importing zod's type into the public envelope module would bind the
  // envelope to a Zod major version; we only need the issues array shape.
  if (isZodError(err)) {
    const first = err.issues[0];
    const path =
      first && Array.isArray(first.path) && first.path.length > 0
        ? first.path.map((p) => String(p)).join(".")
        : "(root)";
    return {
      code: "VALIDATION_FAILED",
      message: `Validation failed at ${path}`,
      requestId,
    };
  }

  // SecretStorage / EngineError style: a stable `.code` string we can map.
  const knownCode = extractAllowlistedCode(err);
  if (knownCode !== null) {
    return {
      code: "INTERNAL",
      message: `An internal error occurred (${knownCode})`,
      requestId,
    };
  }

  return {
    code: "INTERNAL",
    message: GENERIC_INTERNAL_MESSAGE,
    requestId,
  };
}

/**
 * Per-channel request validator. Pairs with `wrapEnvelope`. Throws a
 * `ZodError` on input mismatch so the envelope wrapper maps it to
 * `VALIDATION_FAILED`.
 */
export function withSchema<TIn, TOut>(
  schema: z.ZodType<TIn>,
  fn: (parsed: TIn) => Promise<TOut> | TOut,
): (raw: unknown) => Promise<TOut> {
  return async (raw: unknown): Promise<TOut> => {
    const parsed = schema.parse(raw);
    return fn(parsed);
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface ZodLikeError {
  name: string;
  issues: ReadonlyArray<{ path?: ReadonlyArray<string | number>; message: string }>;
}

function isZodError(err: unknown): err is ZodLikeError {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { name?: unknown; issues?: unknown };
  return candidate.name === "ZodError" && Array.isArray(candidate.issues);
}

/**
 * Codes we recognize and surface in the envelope's user-safe message. Anything
 * outside this list is folded into the generic "An internal error occurred"
 * so untyped error codes never leak across the trust boundary.
 */
const ALLOWLISTED_CODES = new Set<string>([
  "unavailable",
  "decryption_failed",
  "invalid_secret",
  "locked",
  "NOT_FOUND",
  "NOT_AUTHORIZED",
  "CONFIG_INVALID",
]);

function extractAllowlistedCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const candidate = err as { code?: unknown };
  if (typeof candidate.code !== "string") return null;
  return ALLOWLISTED_CODES.has(candidate.code) ? candidate.code : null;
}
