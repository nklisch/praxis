---
id: gate-docs-pattern-service-deps-injection
kind: story
stage: review
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# Pattern `service-deps-injection.md` cites stale `types.ts:13` and stripped-down `ServiceDeps` example

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/service-deps-injection.md:12`
- Code: `packages/core/src/services/types.ts:36-126`

## Current doc text
> **File**: `packages/core/src/services/types.ts:13`
> ```typescript
> export interface ServiceDeps {
>   db, log, modes, toolDefinitions, toolServices: { sympy, sandbox },
>   engineFactory?
> }
> ```

## Reality
`ServiceDeps` is now at `types.ts:36`. The actual interface has
`lockService` (required), optional `indexerOrchestrator`, optional
`activity`, and `toolServices` is a 22-field struct including
`vectorStore, ftsStore, embeddings, documents, artifacts, bootstrap,
courseState, memory, assignments, packs, pedagogyPack, lock, authoring,
notes, flashcards, fsrsScheduler, sketches, conceptMaps,
courseDocuments, engineResolver, bootstrapConfigResolver, quickCheck,
vision`. The pattern's stripped-down example is misleading for new
contributors looking at it as a guide.

## Required edit
- Update the line citation to `:36`.
- Either replace the example with the actual full interface (long but
  accurate) or shorten the example with explicit "(...other fields
  elided; see types.ts for the full set)" markers and call out
  specifically that `toolServices` is the home for ALL injected services
  (with `vectorStore`, `memory`, `pedagogyPack`, etc. as load-bearing
  entries) and that `activity`, `lockService`, `indexerOrchestrator`,
  `engineFactory` are top-level alongside it.

## Implementation notes
Updated `types.ts:13` → `:36` (verified: `export interface ServiceDeps` is at line 36). Replaced the stripped-down 6-field example with a documented summary form: `toolServices` struct is noted as 22 fields with key examples listed in a JSDoc comment, and the top-level fields `indexerOrchestrator`, `engineFactory`, `lockService`, `activity` are shown with their optionality. Readers are linked to `types.ts:45` for the full 22-field struct definition.
