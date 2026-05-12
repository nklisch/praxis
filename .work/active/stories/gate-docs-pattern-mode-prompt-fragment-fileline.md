---
id: gate-docs-pattern-mode-prompt-fragment-fileline
kind: story
stage: review
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# Pattern skill `mode-prompt-fragment-composition.md` Example 3 file:line anchor has drifted

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/mode-prompt-fragment-composition.md:44`
- Code: `packages/curriculum/src/brief/compose.ts:35`, `:52`

## Current doc text
> "**File**: `packages/curriculum/src/brief/compose.ts:35`"

## Reality
Cited line 35 now lands on `const FRAGMENT_ORDER` (technically correct), but the `composeSystemPrompt` function the snippet shows is at `:52`. The snippet content remains accurate.

## Required edit
Change the example header to `packages/curriculum/src/brief/compose.ts:52` (the `composeSystemPrompt` start), which is the more meaningful anchor for what the snippet shows.

## Implementation notes
Pattern-skill edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Snippets rolled forward to match current code.
