---
id: gate-docs-pattern-session-tab-open-flow-lines
kind: story
stage: implementing
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# Pattern `session-tab-open-flow.md` cites stale lines for course-detail / library / new-tab-picker

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/session-tab-open-flow.md:48`, `:64`, `:80`
- Code:
  - `packages/ui/src/routes/course-detail.tsx:102-118`
    (handleStartSession + openSessionInTab)
  - `packages/ui/src/routes/library.tsx:48-55` (first call site);
    `:67-74` (second call site)
  - `packages/ui/src/components/new-tab-picker.tsx:50-69` (handleSubmit)

## Current doc text
> **File**: `packages/ui/src/routes/course-detail.tsx:34-39`
> **File**: `packages/ui/src/routes/library.tsx:48-53`
> **File**: `packages/ui/src/components/new-tab-picker.tsx:56-69`

## Required edit
Update citations to:
- `packages/ui/src/routes/course-detail.tsx:102-118`
- `packages/ui/src/routes/library.tsx:48-55` (and note the second site
  at `:67-74`)
- `packages/ui/src/components/new-tab-picker.tsx:50-69`

The described behavior is unchanged; only line ranges shifted.
