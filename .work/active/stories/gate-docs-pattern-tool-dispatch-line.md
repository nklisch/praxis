---
id: gate-docs-pattern-tool-dispatch-line
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

# Pattern `tool-dispatch-pipeline.md` cites stale `registry.ts:52`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/tool-dispatch-pipeline.md:12`
- Code: `packages/tools/src/registry.ts:70` (`async dispatch`)

## Current doc text
> **File**: `packages/tools/src/registry.ts:52`

## Required edit
Update citation to `packages/tools/src/registry.ts:70`.

## Implementation notes
Updated `registry.ts:52` → `:70` in tool-dispatch-pipeline.md Example 1. Verified: `async dispatch(name: string, args: unknown)` is at line 70 in the current source. New line number confirmed correct.

## Review (2026-05-10)

Spot-checked: `grep -n "async dispatch"` on registry.ts confirms line 70. Citation accurate. Approve.
