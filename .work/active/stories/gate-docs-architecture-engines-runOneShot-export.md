---
id: gate-docs-architecture-engines-runOneShot-export
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

# ARCHITECTURE.md `@praxis/engines` description states "Self-contained — no other `@praxis/*` package may import here"

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/ARCHITECTURE.md:52`
- Code: `packages/engines/src/index.ts:6` (exports `runOneShot`),
  `packages/core/src/services/indexers/affective-indexer.ts:16` (imports it)

## Current doc text
> **`@praxis/engines`** | The three engine adapters (Claude Code / Codex /
> Direct). Each implements the engine contract. Self-contained — no other
> `@praxis/*` package may import here.

## Reality
`@praxis/engines` now also exports `runOneShot` (a one-turn convenience
helper) which `@praxis/core/services/indexers/affective-indexer.ts` and
other indexers import at runtime. The "no other `@praxis/*` package may
import here" rule is now violated — `@praxis/core/services` imports
`@praxis/engines` at runtime to drive LLM-based indexers and bootstrap
exploration. CLAUDE.md (line 89-91) already documents the `services/`
carve-out exception; ARCHITECTURE.md does not.

## Required edit
Update ARCHITECTURE.md's `@praxis/engines` description to acknowledge it
also exports `runOneShot` for use by `@praxis/core/services` indexers,
mirroring the dependency-direction exception already documented in
CLAUDE.md (`packages/core/src/services/` may import `@praxis/engines` and
`@praxis/tools` at runtime — the rest of `@praxis/core` may not).

## Implementation notes
Replaced "Self-contained — no other `@praxis/*` package may import here" with language acknowledging `runOneShot` and the `services/` carve-out, matching the exception already documented in CLAUDE.md. The boundary is clarified as `services/` only — not all of `@praxis/core`.
