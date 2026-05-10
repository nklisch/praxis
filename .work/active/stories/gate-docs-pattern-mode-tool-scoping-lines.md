---
id: gate-docs-pattern-mode-tool-scoping-lines
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# Pattern `mode-tool-scoping.md` cites stale lines and shows outdated `teachMode.toolNames`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/mode-tool-scoping.md:12`, `:23`, `:36`
- Code:
  - `packages/curriculum/src/modes/teach.ts:12` (`export const teachMode`)
  - `packages/core/src/services/session-service.ts:680`
    (`enabledNames = new Set`)
  - `packages/desktop/electron/main/services.ts:472`
    (`const toolDefinitions = [`)

## Current doc text
> **File**: `packages/curriculum/src/modes/teach.ts:9`
> **File**: `packages/core/src/services/session-service.ts:247`
> **File**: `packages/desktop/electron/main/services.ts:31`

## Reality
Lines have shifted to 12, 680, and 472 respectively (substantial drift
in session-service and services after Phases 17-19). Additionally,
Example 1 shows `teachMode.toolNames: ["grade_math", "code_sandbox"]` —
the actual list is 24 tools long. Example 1 reads as a Phase 3 stub
that no longer reflects reality.

## Required edit
- Update the three line numbers (12, 680, 472).
- Update Example 1's `toolNames` snippet to either link out to `teach.ts`
  ("see `packages/curriculum/src/modes/teach.ts:31` for the full
  24-entry list") or trim to a representative slice with an ellipsis
  (e.g., `["grade_math", "code_sandbox", "retrieve_from_textbook", ..., "pedagogy.list_metacognitive_prompts"]`
  plus a note to read the file).
