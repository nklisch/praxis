---
id: gate-cruft-unused-mastery-signal-import
kind: story
stage: review
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: cruft
created: 2026-05-12
updated: 2026-05-12
---

# Unused type import `MasterySignal` in `tests/mastery-end-to-end.test.ts`

## Confidence
High

## Category
unused import

## Location
`tests/mastery-end-to-end.test.ts:28`

## Evidence
```ts
import type {
  // ...
  HealthStatus,
  MasterySignal,   // flagged by Biome as unused
  SymPyService,
} from "@praxis/core/types";
```

## Removal
Drop `MasterySignal` from the import list. `biome check --write` will also do this mechanically.

## Implementation notes
Inline cruft cleanup applied as part of the v0.1.1 autopilot batch.
