---
id: gate-cruft-stale-single-item-adds-comment
kind: story
tags: [cleanup]
parent: feature-release-v0.1.0-cruft-findings
depends_on: []
release_binding: v0.1.0
gate_origin: cruft
created: 2026-05-10
updated: 2026-05-10
---

# Stale navigational comment "single-item adds removed" in start-exploration.ts

## Confidence
Low

## Category
stale comment

## Location
`packages/tools/src/course/start-exploration.ts:115`

## Evidence

```ts
// Concept + edge mutations (batch — single-item adds removed).
draftAddConceptsTool,
draftRemoveConceptTool,
draftAddEdgesTool,
```

References a no-longer-existing API surface (single-item adds were
apparently removed in favor of the batch versions). Future readers don't
know what was removed or why; the comment carries no actionable signal in
the current code.

## Removal

Replace `// Concept + edge mutations (batch — single-item adds removed).`
with `// Concept + edge mutations (batch only).`

Pure comment edit; no code change. Low confidence because it's a
judgment call — the existing wording could be intentional context for
someone reading the explorer's tool list to know that single-item adds
were considered and rejected.
