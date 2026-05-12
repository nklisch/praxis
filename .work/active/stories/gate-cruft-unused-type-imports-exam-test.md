---
id: gate-cruft-unused-type-imports-exam-test
kind: story
stage: implementing
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: cruft
created: 2026-05-12
updated: 2026-05-12
---

# Unused type imports in `tests/exam-end-to-end.test.ts`

## Confidence
High

## Category
unused import

## Location
`tests/exam-end-to-end.test.ts:18-25`

## Evidence
```ts
import type {
  AssignmentItem,
  CodeSandbox,
  CourseId,            // unused
  Engine,              // unused
  EngineEvent,         // unused
  EngineOpenOptions,   // unused
  EngineSession,       // unused
  HealthStatus,
  Rubric,              // unused
  StudentId,           // unused
  SymPyService,
} from "@praxis/core/types";
```
Biome `lint/correctness/noUnusedImports` flags 7 of these names.

## Removal
Run `npx biome check --write tests/exam-end-to-end.test.ts` or delete the unused names manually.
