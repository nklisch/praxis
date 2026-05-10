---
id: gate-cruft-unused-import-timestamp-bootstrap-test
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

# Unused import `Timestamp` in bootstrap-service.units.test.ts

## Confidence
High

## Category
unused import

## Location
`packages/core/src/services/__tests__/bootstrap-service.units.test.ts:13`

## Evidence

```ts
import type { AssessmentPlan, Engine, StudentId, Timestamp } from "../../types/index.js";
```

## Removal

Delete `Timestamp` from the import list. The remaining three
(`AssessmentPlan`, `Engine`, `StudentId`) are all used. Tool-detected by
Biome's `noUnusedImports` (FIXABLE).
