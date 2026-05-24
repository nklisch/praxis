---
id: gate-cruft-library-handle-use-pack-orientation-comment
kind: story
stage: backlog
tags: [cleanup, documentation]
parent: null
depends_on: []
release_binding: null
gate_origin: cruft
created: 2026-05-23
updated: 2026-05-23
---

# Redundant orientation comment that just restates JSX usage

## Confidence
Low — from gate-cruft on release v0.1.4.

## Category
stale comment

## Location
`packages/ui/src/routes/library.tsx:85`

## Evidence
```ts
// handleUsePack and importing are used by PacksSection below.
```

## Verification
Adds no information not already visible from the props passed to
`<PacksSection ... onUsePack={handleUsePack} importing={importing}>`
at line 346-347.

## Removal
Delete the line.
