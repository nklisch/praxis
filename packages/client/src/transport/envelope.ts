/**
 * Client-side mirror of the main-process `IpcEnvelope`. Lives here (in the
 * transport layer) so client services can `unwrapEnvelope` without
 * pulling a desktop-side import.
 *
 * The type defined here is structurally identical to the one in
 * `packages/desktop/electron/main/ipc-error-envelope.ts`. We do NOT
 * import the desktop type to keep the client → desktop dependency
 * boundary one-directional (transports don't reach across).
 */

export type IpcErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export interface IpcEnvelopeError {
  code: IpcErrorCode;
  message: string;
  requestId: string;
}

export type IpcEnvelope<T> = { ok: true; value: T } | { ok: false; error: IpcEnvelopeError };

/**
 * Thrown on the renderer side when an envelope reports failure. Caller code
 * keeps using `try / catch` — the error carries `.code` and `.requestId`
 * so structured UX can branch on the failure category and so support
 * engineers can join the renderer surface to the main-process log row.
 */
export class IpcError extends Error {
  readonly code: IpcErrorCode;
  readonly requestId: string;
  constructor(err: IpcEnvelopeError) {
    super(err.message);
    this.name = "IpcError";
    this.code = err.code;
    this.requestId = err.requestId;
  }
}

/**
 * Unwrap an envelope into a value or throw an `IpcError`. Non-envelope
 * results pass through unchanged so legacy (non-migrated) channels keep
 * working while the rollout is partial.
 *
 * Shape check requires both `ok` and a matching payload key (`value` for
 * success, `error` for failure) — the collision surface with an arbitrary
 * `{ ok: ... }` value is vanishingly small.
 */
export function unwrapEnvelope<T>(result: IpcEnvelope<T> | T): T {
  if (isEnvelope(result)) {
    if (result.ok === true) return result.value;
    throw new IpcError(result.error);
  }
  return result;
}

/**
 * Two-key shape check: `ok` must be a strict boolean AND the matching payload
 * key (`value` for success, `error` for failure) must be present. This means
 * a legacy channel that accidentally returns `{ ok: <truthy-non-bool> }` or
 * `{ ok: true }` without a `value` key will pass through unchanged rather
 * than being misidentified as an envelope.
 * Pinned by: packages/client/src/__tests__/envelope.test.ts
 *   "passes through { ok: 'truthy-non-bool' } as a legacy value (shape-check is strict)"
 *   "passes through { ok: true } without a 'value' key as a legacy value"
 */
function isEnvelope<T>(value: unknown): value is IpcEnvelope<T> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { ok?: unknown; value?: unknown; error?: unknown };
  if (candidate.ok === true && "value" in candidate) return true;
  if (
    candidate.ok === false &&
    candidate.error &&
    typeof candidate.error === "object" &&
    "code" in (candidate.error as object) &&
    "message" in (candidate.error as object) &&
    "requestId" in (candidate.error as object)
  ) {
    return true;
  }
  return false;
}
