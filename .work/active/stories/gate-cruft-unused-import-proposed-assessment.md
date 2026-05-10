---
id: gate-cruft-unused-import-proposed-assessment
kind: story
stage: done
tags: [cleanup]
parent: feature-release-v0.1.0-cruft-findings
depends_on: []
release_binding: v0.1.0
gate_origin: cruft
created: 2026-05-10
updated: 2026-05-10
---

# Unused import `ProposedAssessment` in bootstrap-service.ts

## Confidence
High

## Category
unused import

## Location
`packages/core/src/services/bootstrap-service.ts:29`

## Evidence

```ts
import type {
  ...
  Logger,
  ProposedAssessment,   // ← line 29; unused (only ProposedCourse and ProposedUnit are used at lines 364, 725, 806)
  ProposedCourse,
  ProposedUnit,
  ...
} from "../types/index.js";
```

## Removal

Delete line 29 (`ProposedAssessment,`) from the type import block.
Tool-detected by Biome's `noUnusedImports` (FIXABLE).

## Implementation notes

Deleted `ProposedAssessment,` from the `import type` block in `bootstrap-service.ts` line 29. Confirmed `ProposedCourse` and `ProposedUnit` remain; no other reference to `ProposedAssessment` exists in the file.

## Review (2026-05-10)

Approve. Mechanical removal verified clean. Single line deleted from the `import type` block; `ProposedCourse` and `ProposedUnit` remain intact; no orphan blank lines. No findings.
