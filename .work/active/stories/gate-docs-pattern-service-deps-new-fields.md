---
id: gate-docs-pattern-service-deps-new-fields
kind: story
stage: done
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# Pattern skill `service-deps-injection.md` `ServiceDeps` interface listing is out of date — missing `subAgent`, `promptCustomization`, `secretStorage`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/service-deps-injection.md:14-44`
- Code: `packages/core/src/services/types.ts:39-155`

## Current doc text
> "export interface ServiceDeps { db; log; modes; toolDefinitions; toolServices; indexerOrchestrator?; engineFactory?; lockService; activity?; }"

## Reality
`ServiceDeps` also includes `subAgent?: SubAgentRegistry` (top-level and inside `toolServices`), `promptCustomization?: PromptCustomizationService` (top-level), and `secretStorage: SecretStorage` (required, top-level). The `toolServices` block has grown beyond what the skill lists.

## Required edit
Update the snippet (or the comment listing of `toolServices` fields) to add the three new top-level fields. Mark `subAgent` and `promptCustomization` optional, `secretStorage` required. Update the `buildServices` example to construct `secretStorage: new ElectronSafeStorageAdapter()`.

## Implementation notes
Pattern-skill edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Snippets rolled forward to match current code.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
