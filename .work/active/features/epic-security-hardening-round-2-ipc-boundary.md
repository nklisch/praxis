---
id: epic-security-hardening-round-2-ipc-boundary
kind: feature
stage: review
tags: [security]
parent: epic-security-hardening-round-2
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# IPC trust-boundary hardening

## Brief

The Electron IPC boundary between the main process (full Node + DB +
secrets) and the renderer (untrusted UI) is the single most security-
relevant surface in Praxis. Five of the seven `gate-security-*` findings
land directly on this boundary. This feature bundles them into one design
pass because they share three substrates — the IPC handler scaffold in
`ipc-helpers.ts`, the error-envelope shape that crosses the boundary, and
the secret-redaction helper in `core/types/errors.ts` — and designing them
together avoids five overlapping per-finding designs.

The five items each correspond to a different category of boundary leak:
**input shapes** that aren't validated before hitting service code
(`setEngineConfig`), **output shapes** that include secret material the
renderer doesn't need (`engineConfig` returns plaintext apiKey), **error
envelopes** that leak internal stack/message strings, **log payloads** that
drain unredacted secret material on the error path, and **URL allowlists**
that use prefix regex instead of WHATWG URL parsing for shell handoffs.
Together they harden every direction data crosses the boundary.

This feature does NOT cover the tool-bridge Unix socket (separate feature
— different transport, different threat model) or the image-store path
guard (separate feature — different subsystem, no IPC overlap).

## Epic context

- Parent epic: `epic-security-hardening-round-2`
- Position in epic: largest feature, contains the IPC-boundary cluster.
  Independent of the other two features in this epic — runs in parallel.

## Scope absorbed from backlog

Five items in `.work/backlog/`:

- `gate-security-set-engine-config-strict-schema` — `setEngineConfig`
  IPC accepts `unknown`; the encrypted-blob field leaks into the public
  schema shape.
- `gate-security-engine-config-plaintext-api-key` —
  `praxis.config.engineConfig` returns the decrypted apiKey plaintext to
  the renderer; renderer needs presence/shape, not the secret value.
- `gate-security-ipc-handler-error-leak` — IPC handlers re-throw raw
  `Error` objects so internal stack/message strings cross the trust
  boundary.
- `gate-security-logger-pattern-secret-scrubber` — logger drains the raw
  `err` field that has not been pattern-redacted; the redactor exists
  but isn't applied on the error path.
- `gate-security-open-external-url-parse` —
  `praxis.shell.openExternal` URL allowlist uses a prefix regex instead
  of WHATWG `new URL(...)` parsing.

## Foundation references

- `docs/ARCHITECTURE.md` — IPC trust boundary, main/renderer split,
  channel naming conventions
- `docs/SPEC.md` — IPC contract shape, error envelope expectations
- `CLAUDE.md` — pattern `ipc-channel-convention`

## Anchors (current implementation)

- IPC handler scaffold — `packages/desktop/electron/main/ipc-helpers.ts`
  (the `handle(channel, fn)` wrapper that all IPC handlers use)
- IPC server — `packages/desktop/electron/main/ipc-server.ts` (the
  ~60-channel surface; four of five findings live here)
- Config service — `packages/core/src/services/config-service.ts`
  (engineConfig getter; apiKey decryption path)
- Config schema — `packages/core/src/config/schema.ts` (the Zod schema
  exposed in the public engineConfig response)
- Engine config encryption — `packages/core/src/config/engine-config.ts`
- Secret redactor — `packages/core/src/types/errors.ts` (the pattern-based
  scrubber that isn't currently applied to the err field)
- Client-side IPC consumer — `packages/client/src/services/` (will need
  matching changes if response shapes tighten)

## Pre-design decisions (2026-05-14)

- **`engineConfig` response shape**: presence boolean only.
  `praxis.config.engineConfig` returns `{ hasApiKey: boolean, engineId,
  ... }` after this feature. Renderer never sees the secret. The
  decrypted value stays main-process-only. Implementation must audit
  existing renderer code that reads `apiKey` and migrate to
  `hasApiKey` semantics.
- **Sanitized error envelope**: `{ code: 'VALIDATION_FAILED' |
  'INTERNAL' | ..., message: 'user-safe text', requestId: '...' }`.
  Categories are an enum we own; the IPC-helpers wrapper maps thrown
  errors to envelopes. Renderer drives structured UX off `code`; logs
  cross-reference via `requestId`. Internal stacks/messages are
  scrubbed by the logger redactor on the main side and never cross.
- **Roll-out**: per-channel migration, not a sweeping wrapper change.
  Each handler tightens its request schema and adopts the envelope
  shape one at a time; paired client-side changes ship together.

## Design decisions (2026-05-14)

Resolved during feature-design while running under autopilot — judgment
calls noted for review.

- **Where the error-envelope mapping lives**: a new
  `ipc-error-envelope.ts` module exposed from
  `packages/desktop/electron/main/`, *not* baked into
  `createIpcHelpers` itself. The mapping is opt-in per handler via a
  thin `wrapEnvelope(handler)` adapter. Rationale: the pre-design lock
  said "per-channel migration"; a global wrapper would flip every
  channel at once. Channels migrate by switching from
  `handle(channel, fn)` to `handle(channel, wrapEnvelope(channel, fn))`.
  Until a channel migrates, behavior is unchanged.
- **Envelope return shape on the wire**: `{ ok: true, value }` /
  `{ ok: false, error: { code, message, requestId } }` (i.e. always
  resolve the IPC Promise; surface failure as a discriminated union
  in the resolved value). Rationale: throwing across IPC loses the
  envelope's structured `code` once Electron serializes the Error.
  Wrapping the result lets the client peel the union back into a
  resolve/reject in `ConfigClient` without losing the `code`.
- **Where the apiKey edit/reveal lives**: a separate channel
  `praxis.config.engineConfig.reveal` for fetching the decrypted
  value into the settings form (per the gate item's remediation
  suggestion). The main `engineConfig` response strictly carries
  `hasApiKey: boolean` only. Rationale: keeps the steady-state read
  (consumed on every settings/onboarding mount) free of the secret,
  while the explicit reveal action retains a way to *edit* the key.
- **Pattern-redactor lives in `@praxis/core/types/errors.ts`** next to
  `serializeError`, not in desktop. Rationale: the redactor is
  domain-agnostic (regex patterns over strings), so any package that
  builds a log payload can use it. The logger transport in
  `packages/desktop/electron/main/logger.ts` keeps the path-allowlist
  in addition; the two layers compose.
- **`apiKeyEncrypted` field removed from public `EngineConfigSchema`**.
  A separate `EngineConfigStoredSchema` carries the encrypted blob for
  persistence-layer use only. Rationale: makes the "renderer never
  writes ciphertext" invariant a property of the type, not a
  defensive destructure in `writeEngineConfig`.
- **URL parser is hoisted to a shared helper**
  `packages/core/src/types/url-allowlist.ts` (`isAllowedExternalUrl`).
  Rationale: `UpdateFeedSchema` already enforces the same predicate
  via regex (`update-service.ts:14,17`); the gate item explicitly
  calls out keeping the two in sync. One helper, two call-sites.

## Architectural choice

Three approaches considered.

1. **Sweeping wrapper rewrite** — change `createIpcHelpers` so every
   `handle()` call gets envelope mapping + input schema validation for
   free. Optimizes for terseness: every channel hardens at once. Costs
   the entire IPC surface in one stride and risks regressions across
   ~60 channels whose request shapes vary. Rejected by the pre-design
   lock ("per-channel migration").
2. **Two parallel helpers** — keep `createIpcHelpers` as-is, add
   `createSecureIpcHelpers` alongside it that returns the envelope
   shape. Each channel chooses which helper to use. Optimizes for
   no-touch-when-unmigrated. Costs: doubles the helper surface, and
   the difference between `handle` and `secureHandle` is invisible at
   the call-site (just an import swap).
3. **Adapter at the call-site** — keep `createIpcHelpers` as the
   shared error/timing scaffold; introduce `wrapEnvelope(channel, fn)`
   and `withSchema(schema, fn)` as composable adapters applied per
   handler (`handle(channel, wrapEnvelope(channel, withSchema(s, fn)))`).
   Optimizes for explicit per-channel migration with visible intent
   at the call-site. Costs: each migrated channel grows by one
   wrapper.

**Chosen: option 3.** The pre-design lock is explicit about per-channel
migration; visible per-channel intent at the call-site beats an invisible
helper-swap, and the wrapper composition keeps the existing `handle()`
scaffold (timing, channel logging, slow-call detection) untouched.

## Trickiest unit first

**`wrapEnvelope` + the client-side unwrap path** is the riskiest unit.
The envelope must:
- preserve `EngineError.code` / `SecretStorageError.code` when present
- map unknown thrown errors to `code: 'INTERNAL'` with a generic
  message
- map `ZodError` (from the per-channel input schema) to
  `code: 'VALIDATION_FAILED'` with a user-safe message (the first
  issue's `path`, not its raw message)
- generate a `requestId` (UUIDv7) that the main-process logger uses
  to correlate the verbose log line with the renderer's user-safe
  envelope
- *not* break existing non-migrated handlers (they still throw raw)

The client-side unwrap converts envelope failures into thrown errors
so existing renderer try/catch keeps working — but tagged with
`error.code` and `error.requestId` for structured UX.

Designed in Unit 1 below.

## Implementation Units

### Unit 1: IPC error envelope + per-channel wrapper

**File**: `packages/desktop/electron/main/ipc-error-envelope.ts` (new)
**Story**: `epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor`

```typescript
import { z } from "zod";
import type { Logger } from "@praxis/core/types";
import { uuidv7 } from "uuidv7";

/** Wire-level envelope. Always resolves (never rejects). */
export type IpcEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: IpcEnvelopeError };

export type IpcErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export interface IpcEnvelopeError {
  code: IpcErrorCode;
  message: string;     // user-safe; never contains stack or path text
  requestId: string;   // UUIDv7; correlate with main-side log
}

/**
 * Wrap an IPC handler so its return value is a discriminated envelope.
 * Throws inside `fn` become `{ ok: false, error: {...} }`.
 *
 * The internal stack/message is logged at error level on `log` with
 * the same `requestId`; only the user-safe envelope crosses the wire.
 *
 * The wrapped handler never rejects — IPC always resolves with the
 * envelope. Clients use `unwrapEnvelope` to convert back into throws.
 */
export function wrapEnvelope<TArgs extends unknown[], TResult>(
  channel: string,
  log: Logger,
  fn: (...args: TArgs) => Promise<TResult> | TResult,
): (...args: TArgs) => Promise<IpcEnvelope<TResult>>;

/** Maps a thrown value to an envelope error. Exported for unit tests. */
export function toEnvelopeError(
  err: unknown,
  requestId: string,
): IpcEnvelopeError;

/** Optional per-channel request validator. Pairs with `wrapEnvelope`. */
export function withSchema<TIn, TOut>(
  schema: z.ZodType<TIn>,
  fn: (parsed: TIn) => Promise<TOut> | TOut,
): (raw: unknown) => Promise<TOut>;
```

**File**: `packages/client/src/transport/envelope.ts` (new)

```typescript
import type { IpcEnvelope, IpcEnvelopeError } from
  "../../../desktop/electron/main/ipc-error-envelope.js";

/** Thrown on the renderer side when an envelope reports failure. */
export class IpcError extends Error {
  readonly code: IpcEnvelopeError["code"];
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
 * results pass through unchanged (lets non-migrated channels keep
 * working while the migration is in flight).
 */
export function unwrapEnvelope<T>(result: IpcEnvelope<T> | T): T;
```

**Implementation Notes**:
- `toEnvelopeError` maps known error types: `ZodError → VALIDATION_FAILED`
  (use `issue.path.join('.')` as message, never `issue.message`);
  any object with stable `code` matching the SecretStorageError /
  EngineError shape passes its `code` through as `code: 'INTERNAL'`
  with the original code stashed in the message *only if* it's an
  allowlisted code (`unavailable`, `decryption_failed`, etc.);
  anything else → `code: 'INTERNAL'`, message `"An internal error
  occurred"`.
- `requestId` generation uses `uuidv7` (already a workspace dep via
  the client-side stream id generation).
- `unwrapEnvelope` shape-checks for `{ ok: true|false }` to remain a
  no-op on non-migrated channels — critical so the rollout can be
  partial.

**Acceptance Criteria**:
- [ ] `wrapEnvelope` catches all throws and returns
      `{ ok: false, error: {...} }`; the IPC promise never rejects.
- [ ] `ZodError` → `code: 'VALIDATION_FAILED'`; message is the joined
      `path`, never the raw Zod text.
- [ ] Unknown error → `code: 'INTERNAL'`, message `"An internal error
      occurred"`; internal `message`/`stack` is logged with the same
      `requestId` on the main side and never crosses the wire.
- [ ] `unwrapEnvelope` returns the value on `{ ok: true }`, throws
      an `IpcError` with `.code`/`.requestId` on `{ ok: false }`, and
      passes through non-envelope results unchanged.
- [ ] `withSchema` validates with the given Zod schema and throws
      a `ZodError` (which `wrapEnvelope` then maps).

---

### Unit 2: Pattern-based secret redactor in core/types/errors

**File**: `packages/core/src/types/errors.ts` (extend existing)
**Story**: `epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor`

```typescript
/**
 * Scrub common secret-shaped substrings from a string. Applied to
 * error messages and serialized error fields before they reach the
 * file transport. Cheap regex pass.
 *
 * Recognized shapes:
 *  - Provider keys: `sk-…` (Anthropic, OpenAI), `xai-…`, `gsk_…`
 *  - Bearer tokens: `Bearer <token>`
 *  - JWT-shaped: three base64url segments joined by `.`
 *  - URL-embedded `?key=…` / `&authorization=…` query params
 */
export function redactSecrets(input: string): string;

/**
 * Convert `unknown` to SerializedError, then redact secret-shaped
 * substrings from `.message` and `.stack`. This is what the logger's
 * `err` field SHOULD be set to on every error path.
 */
export function serializeErrorRedacted(err: unknown): SerializedError;
```

**Implementation Notes**:
- Keep `serializeError` exporting the raw shape; introduce
  `serializeErrorRedacted` as a sibling so callers can opt in.
  All IPC error paths switch to `serializeErrorRedacted`.
- Patterns are an `as const` array of `[regex, replacement]` tuples
  so additions are obvious in code review and so we can list them
  in the test fixtures.
- The redactor is pure — no logger import — so it can be used from
  core, engines, tools, and desktop without dependency-direction
  violations.

**Acceptance Criteria**:
- [ ] `redactSecrets("apiKey=sk-ant-abc123")` returns
      `"apiKey=sk-ant-[REDACTED]"` (preserves the leading `sk-` /
      provider prefix so log triage still tells you the shape).
- [ ] `redactSecrets("Authorization: Bearer eyJ.aaa.bbb")` redacts
      the bearer token.
- [ ] `redactSecrets("plain text")` is a no-op.
- [ ] `serializeErrorRedacted` redacts both `message` and `stack`.

---

### Unit 3: Shared URL allowlist helper

**File**: `packages/core/src/types/url-allowlist.ts` (new)
**Story**: `epic-security-hardening-round-2-ipc-boundary-url-and-redactor-rollout`

```typescript
/**
 * True if `input` is a syntactically valid URL whose protocol is
 * `http:` or `https:`. Uses WHATWG `new URL(...)` (not a prefix
 * regex), so embedded control characters, whitespace, and other
 * anomalies are rejected by the parser.
 *
 * Returns false on any parse error; never throws.
 */
export function isAllowedExternalUrl(input: string): boolean;
```

**Implementation Notes**:
- Two call-sites flip to this helper:
  1. `praxis.shell.openExternal` in `ipc-server.ts:1237`
  2. `UpdateFeedSchema` in `update-service.ts:14,17` —
     `.refine(isAllowedExternalUrl, ...)` replaces the regex.
- Export from `@praxis/core/types` so the desktop main process and
  the core service can both import without a desktop → core helper
  diving into a non-types subpath.

**Acceptance Criteria**:
- [ ] `isAllowedExternalUrl("https://example.com")` → `true`.
- [ ] `isAllowedExternalUrl("http://example.com")` → `true`.
- [ ] `isAllowedExternalUrl("file:///etc/passwd")` → `false`.
- [ ] `isAllowedExternalUrl("https://example.com\nfile:///etc")` →
      `false` (WHATWG URL rejects embedded control chars).
- [ ] `isAllowedExternalUrl("javascript:alert(1)")` → `false`.
- [ ] `isAllowedExternalUrl("not a url")` → `false`.
- [ ] `ipc-server.ts` `praxis.shell.openExternal` uses
      `isAllowedExternalUrl` instead of the regex.
- [ ] `UpdateFeedSchema` `downloadUrl`/`releaseNotesUrl` refines use
      `isAllowedExternalUrl` instead of the regex.

---

### Unit 4: EngineConfig split — public vs stored, `hasApiKey` snapshot, reveal channel

**File**: `packages/core/src/config/schema.ts` (refactor)
**File**: `packages/core/src/types/client.ts` (update `EngineConfigSnapshot`)
**File**: `packages/core/src/services/config-service.ts` (return-shape change)
**File**: `packages/core/src/config/engine-config.ts` (write-path uses stored schema)
**File**: `packages/desktop/electron/main/ipc-server.ts` (add reveal channel)
**File**: `packages/client/src/services/config-client.ts` (add `revealApiKey`)
**Story**: `epic-security-hardening-round-2-ipc-boundary-engine-config-shape`

```typescript
// packages/core/src/config/schema.ts

/** Public-API engine config — what the renderer / clients hand over.
 *  No `apiKeyEncrypted` field. `.strict()` so unknown keys are rejected. */
export const EngineConfigSchema = z.object({
  engineId: EngineIdSchema,
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  effort: z.enum([...]).optional(),
}).strict().superRefine(/* vision-model check */);

/** Persistence-layer schema — same fields plus the encrypted blob. */
export const EngineConfigStoredSchema = EngineConfigSchema.extend({
  apiKeyEncrypted: z.string().optional(),
});

export type EngineConfig = z.infer<typeof EngineConfigSchema>;
export type EngineConfigStored = z.infer<typeof EngineConfigStoredSchema>;
```

```typescript
// packages/core/src/types/client.ts — EngineConfigSnapshot

export interface EngineConfigSnapshot {
  engineId: string;
  model?: string;
  /** True iff a non-empty apiKey is stored or set via env. Renderer
   *  uses this to render "configured" / "not configured" UI without
   *  ever seeing the secret. */
  hasApiKey: boolean;
  baseUrl?: string;
  effort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  // NOTE: `apiKey?: string` field REMOVED. Use `revealApiKey()` to
  // fetch the value into an edit form.
}

export interface ConfigService {
  // ...
  engineConfig(): Promise<EngineConfigSnapshot>;
  /** Fetch the decrypted apiKey once for editing. Requires unlock. */
  revealApiKey(): Promise<{ apiKey: string | null }>;
  setEngineConfig(config: EngineConfigSnapshot &
    { apiKey?: string }): Promise<void>;
  // ...
}
```

```typescript
// packages/desktop/electron/main/ipc-server.ts

handle("praxis.config.engineConfig", wrapEnvelope("...", log, async () => {
  await requireUnlocked();
  return services.config.engineConfig();   // returns hasApiKey shape
}));

handle("praxis.config.engineConfig.reveal",
  wrapEnvelope("...", log, async () => {
    await requireUnlocked();
    return services.config.revealApiKey();
  }));

handle("praxis.config.setEngineConfig",
  wrapEnvelope("...", log,
    withSchema(EngineConfigSchema, async (cfg) => {   // strict, public
      await requireUnlocked();
      await services.config.setEngineConfig(cfg);
    })));
```

**Implementation Notes**:
- `setEngineConfig` argument carries an optional `apiKey` so the
  settings form can submit a new value. When `apiKey === undefined`
  the persisted value is preserved; the form must explicitly pass
  `apiKey: ""` to clear.
- Renderer settings/onboarding flow becomes two-step: read
  `engineConfig()` for display (no secret); call `revealApiKey()`
  only when the user clicks "edit api key" on the settings form.
  The onboarding flow can call `revealApiKey()` once on mount if
  needed for the password-input prefill — accept that as a deliberate
  decision (the secret is exposed during the brief edit, which is
  the same surface as a user typing it in).
- `writeEngineConfig` is unchanged structurally — still parses with
  the stored schema before persisting — but the input type narrows.

**Acceptance Criteria**:
- [ ] `praxis.config.engineConfig` response has no `apiKey` field.
- [ ] `praxis.config.engineConfig` response has `hasApiKey: boolean`
      that reflects whether the resolved config has a non-empty
      `apiKey` (decrypted from storage OR set via `PRAXIS_API_KEY`).
- [ ] `praxis.config.engineConfig.reveal` returns
      `{ apiKey: string | null }` and requires unlock.
- [ ] `praxis.config.setEngineConfig` rejects (envelope
      `VALIDATION_FAILED`) when `apiKeyEncrypted` is present in the
      input — `.strict()` on the public schema enforces it.
- [ ] Settings UI renders "configured" / "not configured" without
      reading `apiKey`; the apiKey input is populated only when the
      user clicks "edit".
- [ ] Onboarding flow continues to function (use `revealApiKey()`
      on mount to prefill if/when reuse of an existing key is shown).
- [ ] DB-layer migration NOT required — the stored row shape is
      unchanged; only the parse boundary changes.

---

### Unit 5: Per-channel migration — config, shell, lock, update

**File**: `packages/desktop/electron/main/ipc-server.ts` (handler rewrites)
**Story**: `epic-security-hardening-round-2-ipc-boundary-url-and-redactor-rollout`

Channels to migrate in this story:
- `praxis.config.engineConfig` (already touched in Unit 4 — confirm wrap)
- `praxis.config.engineConfig.reveal` (new, Unit 4)
- `praxis.config.setEngineConfig` (Unit 4 — withSchema applied)
- `praxis.config.setSelectedEngine` (validate engineId)
- `praxis.config.setBootstrapConfig` (validate maxSteps)
- `praxis.config.setLockCode`, `praxis.lock.setLockCode`,
  `praxis.lock.unlock`, `praxis.lock.clearLock` (validate code is non-empty string)
- `praxis.shell.openExternal` (use `isAllowedExternalUrl`, envelope)
- `praxis.update.checkLatest` (envelope only; schema is internal)

Each migration:
1. Define a per-channel input Zod schema co-located in
   `ipc-server.ts` or a sibling `ipc-schemas.ts` (judgment: stick
   with `ipc-server.ts` until it gets large enough to justify a
   split — currently ~1270 lines).
2. Wrap the existing handler in `wrapEnvelope(channel, log, ...)`.
3. For handlers with non-trivial input shape, wrap the inner fn
   in `withSchema(s, ...)`.

**Implementation Notes**:
- Non-migrated handlers continue to throw raw — they unwrap as
  no-ops on the client side because `unwrapEnvelope` shape-checks
  for `{ ok }`. This is the seam that makes the rollout incremental.
- The `ipc.handle.error` log line on the wrapped path keeps writing
  the full serialized error (via `serializeErrorRedacted`) with the
  `requestId` field present so the main-side log row joins to the
  renderer-visible envelope. Nothing user-secret reaches that
  payload thanks to the redactor in Unit 2.
- The `praxis.session.send.start` / `praxis.ingest.start` streaming
  channels are explicitly OUT OF SCOPE for this feature. They push
  `{ kind: "error", error: string }` over the events channel, a
  different shape. Migrating those to envelope semantics is a
  follow-up if value emerges.

**Acceptance Criteria**:
- [ ] All listed channels return envelope-shaped responses.
- [ ] `praxis.shell.openExternal` calls `isAllowedExternalUrl` (no
      regex anywhere in the handler).
- [ ] `setEngineConfig` with `{ apiKeyEncrypted: "x" }` is rejected
      with `code: 'VALIDATION_FAILED'`.
- [ ] `setLockCode` with `{ code: "" }` is rejected with
      `code: 'VALIDATION_FAILED'`.
- [ ] `setLockCode` with a non-string is rejected with
      `code: 'VALIDATION_FAILED'`.
- [ ] Throwing a synthetic `Error("/Users/x/.praxis/dev.db not found")`
      inside any migrated handler results in renderer-visible
      `{ code: 'INTERNAL', message: 'An internal error occurred', requestId }`
      with no filesystem path leakage.
- [ ] Client-side `IpcError` is thrown from the migrated client
      methods and carries `.code` + `.requestId`.

---

### Unit 6: Logger error-path scrubbing

**File**: `packages/desktop/electron/main/ipc-helpers.ts` (one-line change)
**File**: `packages/desktop/electron/main/ipc-server.ts` (sweep of
serializeError call-sites for streaming channels)
**File**: `packages/desktop/electron/main/*-channel.ts` (sweep)
**Story**: `epic-security-hardening-round-2-ipc-boundary-url-and-redactor-rollout`

Replace every `err: serializeError(err)` in main-process IPC error
paths with `err: serializeErrorRedacted(err)`. Specifically:
- `ipc-helpers.ts` `handle()` and `on()` catch blocks
- `ipc-server.ts` `praxis.session.send.start`, `praxis.memory.episodic.start`,
  `praxis.auth.claude.login.start`
- `activity-channel.ts`, `bootstrap-drafts-channel.ts`,
  `ingest-channel.ts`, `quick-check-channel.ts`,
  `subagent-channel.ts` (any catch with `serializeError(err)`)

**Acceptance Criteria**:
- [ ] No `serializeError(err)` call survives in any IPC error log
      path on the main side; all use `serializeErrorRedacted`.
- [ ] A test that throws an `Error` carrying
      `"sk-ant-fake-…"` confirms the logged record's `err.message`
      contains `[REDACTED]` and not the literal key.

## Implementation Order

The three child stories are largely independent but share Unit 1
+ Unit 2 as a foundation. Story B and Story C can run in parallel
after Story A lands; they touch different files (engine config /
URL + redactor rollout) with no overlap.

1. **Story A — envelope + redactor**
   (`epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor`)
   Lands Units 1 + 2. No depends_on. After this story, the
   `wrapEnvelope` / `withSchema` adapters and `redactSecrets` /
   `serializeErrorRedacted` helpers exist with full unit tests, but
   no channel uses them yet. Pure addition; no behavior change.
2. **Story B — engineConfig shape change**
   (`epic-security-hardening-round-2-ipc-boundary-engine-config-shape`)
   Lands Unit 4. depends_on: [Story A]. This is the renderer-
   contract-changing story — splits the schema, narrows the
   snapshot, adds the reveal channel, migrates settings + onboarding
   to `hasApiKey`. Uses envelope+schema from Story A.
3. **Story C — URL helper + per-channel rollout + redactor wiring**
   (`epic-security-hardening-round-2-ipc-boundary-url-and-redactor-rollout`)
   Lands Units 3 + 5 + 6. depends_on: [Story A]. Runs in parallel
   with Story B once Story A lands. No file overlap with Story B —
   touches shell channel, lock channels, update service, and the
   serializeError call-site sweep.

Orchestrator wave plan: Story A alone in wave 1; Stories B + C
together in wave 2.

## Testing

### Unit 1 — `packages/desktop/electron/main/__tests__/ipc-error-envelope.test.ts`
- envelope success path returns `{ ok: true, value }`
- thrown `ZodError` → `{ ok: false, error: { code: 'VALIDATION_FAILED', message: <joined-path>, requestId } }`
- thrown `Error("/Users/x/.praxis/dev.db not found")` →
  `{ ok: false, error: { code: 'INTERNAL', message: 'An internal error occurred', requestId } }`
- thrown `SecretStorageError` with `code: 'unavailable'` → envelope
  preserves the code (mapped to envelope `code: 'INTERNAL'`, but the
  log line carries the original `unavailable` code)
- IPC promise never rejects — wrapped handler always resolves
- log line on failure carries `requestId` that equals the envelope's `requestId`
- log line uses `serializeErrorRedacted` (test by throwing `Error("apiKey=sk-ant-fake")` and asserting `[REDACTED]` in the captured log)
- `unwrapEnvelope({ ok: true, value: 42 })` → `42`
- `unwrapEnvelope({ ok: false, error })` → throws `IpcError` with `.code` + `.requestId`
- `unwrapEnvelope(42)` (legacy non-envelope value) → `42` (passthrough)
- `withSchema(schema, fn)` validates input and throws `ZodError` on mismatch

### Unit 2 — `packages/core/src/types/__tests__/errors.test.ts`
- `redactSecrets("apiKey=sk-ant-abc")` returns `"apiKey=sk-ant-[REDACTED]"`
- `redactSecrets("Bearer eyJabc.def.ghi")` redacts bearer
- `redactSecrets("?key=secret&other=ok")` redacts query param value
- `redactSecrets("nothing sensitive")` is identity
- `serializeErrorRedacted(new Error("API key sk-ant-x failed"))`.message
  has `[REDACTED]`
- `serializeErrorRedacted` preserves `name` / `code` / stack shape

### Unit 3 — `packages/core/src/types/__tests__/url-allowlist.test.ts`
- `http://`, `https://` → true (with and without paths/queries)
- `file://`, `mailto:`, `javascript:`, `data:` → false
- embedded `\n`, `\r`, `\t`, raw space → false
- malformed string → false
- empty string → false

### Unit 4 — `packages/core/src/services/__tests__/config-service.engine-shape.test.ts`
- `engineConfig()` returns `hasApiKey: true` when stored encrypted blob decrypts
- `engineConfig()` returns `hasApiKey: true` when `PRAXIS_API_KEY` env is set
- `engineConfig()` returns `hasApiKey: false` when nothing is set
- response object has no `apiKey` field (`expect(snap).not.toHaveProperty("apiKey")`)
- `revealApiKey()` returns the decrypted key when stored; `null` when not
- `setEngineConfig` parses with the *public* (strict) schema — rejects `{ apiKeyEncrypted: "..." }` with a Zod error
- `setEngineConfig` with `{ apiKey: undefined }` preserves the existing stored key
- `setEngineConfig` with `{ apiKey: "" }` clears the stored key

### Unit 5 — `packages/desktop/electron/main/__tests__/ipc-server.envelope-migration.test.ts`
- migrated channel returns envelope shape on success
- migrated channel returns envelope error on validation failure
- migrated channel returns envelope error on internal throw (no path leak in message)
- non-migrated channel (use one untouched handler as control) still throws raw — confirms incremental rollout doesn't break the un-migrated surface
- client-side `ConfigClient.engineConfig()` returns the unwrapped snapshot
- client-side `ConfigClient.setEngineConfig({apiKeyEncrypted: "x"})` throws `IpcError` with `code: 'VALIDATION_FAILED'`

### Unit 6 — covered by Unit 1 redaction test and by adding an
existing serializeError test-coverage check in
`packages/desktop/electron/main/__tests__/ipc-helpers.test.ts`
(replace the `serializeError` import with `serializeErrorRedacted`
where applicable, then assert no full-message text leak when a fake
key is thrown).

### Settings / Onboarding UI tests
- `packages/ui/src/__tests__/settings-route.test.tsx` — update
  `defaultConfig` to drop `apiKey` and add `hasApiKey`; assert
  "configured / not configured" rendering; assert the "edit" flow
  calls `revealApiKey()` before populating the input.
- `packages/ui/src/__tests__/onboarding-flow.test.tsx` — same
  shape update; assert the form still saves with a fresh apiKey
  via `setEngineConfig({ ..., apiKey: "sk-test" })`.

## Risks

- **Renderer-contract breakage if a UI surface still reads `apiKey`
  off the snapshot post-migration.** Mitigation: type change is
  load-bearing — `apiKey` removal from `EngineConfigSnapshot` makes
  `pnpm typecheck` fail anywhere it's read. Story B includes the
  full UI sweep; the typechecker enforces completeness.
- **Onboarding regression — if `revealApiKey` requires unlock and
  onboarding runs pre-lock, the reveal call rejects.** Mitigation:
  audit shows lock is opt-in (Phase 11 author-surface); the lock
  state is "no lock set" on first-run. If the lock is set later,
  it won't apply retroactively to onboarding — onboarding is
  one-time. Confirm by reading `services.lock.isSet()` in the
  feature spike at the start of Story B.
- **Per-channel migration leaves a long tail of un-migrated channels
  that still throw raw.** Mitigation: in scope here is only the
  five gate-finding channels; the rest are intentionally left for
  later passes (defense-in-depth, not a blocker). Document the
  partial state in the post-implementation review note.
- **`unwrapEnvelope`'s passthrough behavior on non-envelope values
  is a footgun if a future migration accidentally returns a value
  that looks like an envelope (`{ ok: ... }`).** Mitigation: the
  shape check requires both `ok` AND either `value` or `error` keys
  to be present and the right type — vanishingly small collision
  surface, but worth a comment in the source.
