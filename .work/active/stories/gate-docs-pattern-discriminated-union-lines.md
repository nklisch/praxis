---
id: gate-docs-pattern-discriminated-union-lines
kind: story
stage: done
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# Pattern `discriminated-union-dispatch.md` cites stale `grade-math.ts:160` and `:36`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/discriminated-union-dispatch.md:24` and `:36`
- Code: `packages/tools/src/math/grade-math.ts:60` (Zod schema),
  `packages/tools/src/math/grade-math.ts:205` (switch on `args.kind`)

## Current doc text
> **File**: `packages/tools/src/math/grade-math.ts:160`
> **File**: `packages/tools/src/math/grade-math.ts:36`

## Required edit
Update the two citations to:
- `packages/tools/src/math/grade-math.ts:205` (switch on `args.kind`)
- `packages/tools/src/math/grade-math.ts:60` (Zod schema)

The cited code is otherwise still accurate.

## Implementation notes
Updated `grade-math.ts:160` → `:205` (switch on args.kind) and `grade-math.ts:36` → `:60` (gradeMathInput discriminatedUnion). Verified both in source: `gradeMathInput = z.discriminatedUnion` is at line 60, `switch (args.kind)` is at line 205. New line numbers confirmed correct.

## Review (2026-05-10)

Spot-checked: `grep -n "gradeMathInput\|switch (args.kind)"` confirms line 60 (discriminatedUnion) and line 205 (switch). Both citations accurate. Approve.
