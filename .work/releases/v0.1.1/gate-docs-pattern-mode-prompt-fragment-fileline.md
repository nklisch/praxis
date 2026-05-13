---
id: gate-docs-pattern-mode-prompt-fragment-fileline
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

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
