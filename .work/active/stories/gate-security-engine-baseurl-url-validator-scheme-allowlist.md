---
id: gate-security-engine-baseurl-url-validator-scheme-allowlist
kind: story
stage: done
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: security
created: 2026-05-18
updated: 2026-05-18
---

# `EngineConfig.baseUrl` validator accepts `file://`, `javascript:`, and `data:` URIs

## Severity
Medium

## Domain
Input Validation & Injection (also touches Data Protection / Secrets)

## Location
`packages/core/src/config/schema.ts:55` (and the parallel persistence schema
at `packages/core/src/config/schema.ts:79`)

## Evidence
```ts
export const EngineConfigSchema = z
  .object({
    engineId: EngineIdSchema,
    model: z.string().optional(),
    apiKey: z.string().optional(),
    baseUrl: z.string().url().optional(),
    effort: z.enum(...).optional(),
  })
  .strict()
  .superRefine(visionModelRefine);
```

`z.string().url().safeParse("file:///etc/passwd").success === true` — same for
`javascript:alert(1)` and `data:text/html,foo`. `baseUrl` is the host the AI
SDKs route requests to alongside the user's API key (`engines/codex/adapter.ts`,
`engines/direct/providers.ts`). The validator is the gate.

The project already has a hardened helper at
`packages/core/src/types/url-allowlist.ts:28` (`isAllowedExternalUrl`) that
pre-checks for C0/whitespace and rejects everything except `http:`/`https:`.
That helper is used for `praxis.shell.openExternal` and
`UpdateFeedSchema.downloadUrl` but is NOT applied to `baseUrl`.

## Remediation direction

**Design decision (2026-05-18)**: sanitize-at-load for the stored-side path,
fail-fast for the renderer-facing input.

- `EngineConfigSchema.baseUrl` (renderer-facing input via `setEngineConfig`):
  add `.refine(v => isAllowedExternalUrl(v), ...)` so invalid baseUrls
  are rejected at the IPC boundary with `VALIDATION_FAILED`.
- `EngineConfigStoredSchema.baseUrl`: leave the schema permissive on read
  to avoid locking users out, but the read path
  (`ConfigServiceImpl.engineConfig()` or wherever stored rows are
  materialized) calls `isAllowedExternalUrl` on the parsed `baseUrl` and,
  if it rejects, drops the field and logs `config.engine_baseurl_dropped`
  with `{ engineId, reason: "scheme_not_allowed" }`. The engine then falls
  back to the provider default.

Add regression tests in
`packages/core/src/config/__tests__/schema.test.ts` and the equivalent
service file covering: `file://`, `javascript:`, `data:`, embedded-CR,
plain `https://api.example.com`. Verify the renderer-side rejects and the
load-side sanitizes-and-logs.

## Implementation notes (2026-05-18)

### Changes made

**`packages/core/src/config/schema.ts`**
- Added import for `isAllowedExternalUrl` from `../types/url-allowlist.js`.
- `EngineConfigSchema.baseUrl`: replaced `z.string().url().optional()` with
  `z.string().optional().refine(v => v === undefined || isAllowedExternalUrl(v), { message: "baseUrl must be a plain http(s) URL" })`.
  Rejects `file://`, `javascript:`, `data:`, and any URL with embedded C0/whitespace.
- `EngineConfigStoredSchema.baseUrl`: left as `z.string().url().optional()` (permissive — stays safe for legacy rows).

**`packages/core/src/config/engine-config.ts`**
- Added import for `isAllowedExternalUrl`.
- In `readEngineConfig`, where `inMemoryStored.baseUrl` is assigned from the stored row,
  added a guard: if `isAllowedExternalUrl(stored.baseUrl)` returns false, the field is
  omitted (drops to `undefined`) and `log?.warn("config.engine_baseurl_dropped", { engineId, reason: "scheme_not_allowed" })` is emitted.

**`packages/core/src/config/__tests__/schema.test.ts`** (new file)
- 7 tests covering `EngineConfigSchema.baseUrl`:
  - Accepts `https://` and `http://` URLs and `undefined`.
  - Rejects `file:///etc/passwd`, `javascript:alert(1)`, `data:text/html,foo`, and `https://...` with embedded `\r\n`.

**`packages/core/src/services/__tests__/config-service.baseurl-sanitize.test.ts`** (new file)
- 3 tests for the sanitize-on-load path:
  - Stored `file:///etc/passwd` → `engineConfig()` returns `baseUrl: undefined`.
  - Warning `config.engine_baseurl_dropped` fires with `{ engineId, reason: "scheme_not_allowed" }` (verified via `recordingLogger`).
  - Stored `https://api.example.com` passes through unchanged; no warning.

### Verification

All 89 `@praxis/core` test files pass (1077 tests). Typecheck and lint clean.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Renderer-facing EngineConfigSchema.baseUrl now refines with isAllowedExternalUrl — rejects file://, javascript:, data:, embedded-CR at IPC boundary. Load-path sanitizes with drop+warn. 7 schema tests and 3 service tests exercise real ConfigServiceImpl with tempDb. Tests are not tautological — seedRawEngineConfig bypasses write-side validation to correctly test the read path. All 4 attack vectors covered. Stored schema remains permissive as designed to avoid locking out legacy installs.
