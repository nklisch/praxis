---
id: gate-security-engine-baseurl-url-validator-scheme-allowlist
kind: story
stage: drafting
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
Replace `z.string().url()` on both `EngineConfigSchema.baseUrl` and
`EngineConfigStoredSchema.baseUrl` with a `.refine(...)` that delegates to
`isAllowedExternalUrl` (or its equivalent — restrict scheme to `http:`/`https:`
and reject control chars/whitespace). Apply identically to both definitions so
`setEngineConfig` and stored-row reads stay aligned. Add a regression test in
`packages/core/src/config/__tests__/schema.test.ts` covering `file://`,
`javascript:`, `data:`, and an embedded-CR variant.
