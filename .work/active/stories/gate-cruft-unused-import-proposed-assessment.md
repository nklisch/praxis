---
id: gate-cruft-unused-import-proposed-assessment
kind: story
stage: implementing
tags: [cleanup]
parent: null
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
