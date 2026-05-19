---
id: gate-security-engine-baseurl-url-validator-scheme-allowlist
kind: story
stage: implementing
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
