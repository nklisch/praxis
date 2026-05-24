---
id: feature-refactor-session-service-spawn-extraction
kind: feature
stage: drafting
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Extract spawn-from-* paths + parent-session coordination from `SessionService`

## Brief
`packages/core/src/services/session-service.ts` (~876 lines after the
SessionPromoter extract earlier this session) still bundles:
- (a) Core session lifecycle (start, send, end)
- (b) Active session map + engine swap detection
- (c) Three `spawnFrom*` variants — `spawnFromAssignment`, `spawnFromNote`,
  `spawnFromPassage` — with 60–90 lines each of validation + parent linking
- (d) `notifySession` (live synthetic turns for parent-child session linkage)

The three spawn paths each have isolated validation + DB queries that could
extract into a `SessionSpawner` utility. Combined with `notifySession`, all the
parent-session coordination forms a coherent sub-service.

## Refactor target
Two options to evaluate during design:

**Option A: Single `SessionSpawner` utility** owning validation + parent linking
for all three spawnFrom* methods. Keeps notifySession in the core service.

**Option B: `ParentSessionCoordinator` sub-service** owning both spawnFrom*
+ notifySession (all parent-child concerns). Cleaner conceptual split.

## Constraints
- Public `SessionService` interface unchanged
- Spawn paths' parent-validation (just shipped in this session) and offset
  caps must be preserved
- Lifecycle atomicity preserved (each spawn opens a real session)
- `notifySession` wiring to assignment service stays working

## Discovery evidence
- File length: 876 lines after SessionPromoter extract
- 3 spawnFrom* variants × ~70 lines each = ~210 lines of extractable logic
- Discovered by autopilot refactor cadence

## Next
Per-feature design via `/agile-workflow:refactor-design feature-refactor-session-service-spawn-extraction`
to choose between options A/B and enumerate the extraction.
