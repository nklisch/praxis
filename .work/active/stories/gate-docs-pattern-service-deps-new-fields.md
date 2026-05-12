---
id: gate-docs-pattern-service-deps-new-fields
kind: story
stage: implementing
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
