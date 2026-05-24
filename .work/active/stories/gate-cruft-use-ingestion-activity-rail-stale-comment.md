---
id: gate-cruft-use-ingestion-activity-rail-stale-comment
kind: story
stage: review
tags: [cleanup, documentation]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: cruft
created: 2026-05-23
updated: 2026-05-23
---

# Stale comment references `ActivityRail` (unused) instead of `StatusStrip`

## Confidence
High

## Category
stale comment

## Location
`packages/ui/src/hooks/use-ingestion.ts:187`

## Evidence
```ts
// Progress events are reported via the ActivityRail — no local state needed.
```

## Verification
`CLAUDE.md` explicitly says "The standalone `<ActivityRail>` component
is retained in the codebase but unused" and the chrome that surfaces
ingestion progress is `<StatusStrip>`. The same `ActivityRail` token
is referenced nowhere else in this file or the surrounding production
code (besides `activity-rail.tsx` itself and its tests).

## Removal
Change the comment to:
```ts
// Progress events are surfaced through the StatusStrip via ActivityRegistry — no local state needed.
```

## Implementation notes
Found the stale comment at line 187 in `packages/ui/src/hooks/use-ingestion.ts`, exactly matching the story's evidence. Replaced `// Progress events are reported via the ActivityRail — no local state needed.` with `// Progress events are surfaced through the StatusStrip via ActivityRegistry — no local state needed.` — the only change in this story. Typecheck and all 1710 UI tests pass with no issues.
