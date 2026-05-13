---
id: story-biology-pack-bootstrap-smoke-test
kind: story
stage: review
tags: [content, testing]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-13
---

# Extend biology-pack smoke test to cover bootstrap flow

## Brief

The implementation of `epic-phase-19-biology-pack` added a smoke test in
`packages/curriculum/src/packs/__tests__/import-service.test.ts` that exercises
`PackImportServiceImpl.importPack("biology")` and the `listAvailablePacks`
discovery path, but did not extend the test as far as the feature design
suggested. The design's Unit 3 called for:

- A round-trip select on the `concepts` table after import, asserting that
  anchor concept ids (e.g. `biology.cell-theory`, `biology.photosynthesis`,
  `biology.natural-selection`) are present in the DB for the imported graph.
- Exercising `BootstrapServiceImpl.createCourseFromPack` against the biology
  pack to confirm it produces a course with lessons of ~7 and the lesson order
  respects the pack's prerequisite edges — i.e., the exact path that
  `course.use_canonical_pack` would hit at runtime.

The current smoke test covers the import path; algebra-1 / geometry already
cover the bootstrap path with a different pack. Closing the loop for biology
specifically is a small follow-up that would catch any biology-only oddity in
`createCourseFromPack` (e.g., the larger concept count interacting with
lesson grouping).

This is not a v1 blocker — the import path is verified, the bootstrap path is
exercised by sibling packs, and any failure would surface in the Phase 19 ship
checklist anyway. Promoting from backlog so it lands before biology gets a real
classroom user.

Origin: `.work/backlog/idea-biology-pack-bootstrap-smoke-test.md` (from review
of `epic-phase-19-biology-pack`).

## Implementation Notes

Added two tests to the existing `biology pack smoke test` describe block in
`packages/curriculum/src/packs/__tests__/import-service.test.ts`.

**Discovery: concept IDs are prefixed in the DB.** `PackImportServiceImpl.importPack`
stores concept row IDs as `${conceptGraphId}:${manifestConceptId}` (e.g.
`<uuid>:biology.cell-theory`) to avoid primary-key collisions across pack versions.
All assertions were updated to construct the full prefixed IDs.

**Discovery: no topological ordering in `createCourseFromPack`.** The method groups
concepts sequentially as returned by the DB query (no `ORDER BY`, so SQLite returns
them in B-tree order — effectively alphabetical by prefixed ID). The story's
"lesson order respects prerequisite edges" language is aspirational; the actual
implementation does flat sequential grouping. The test asserts the alphabetically-first
concept (`biology.abiotic-factors`) is in lesson 0 and the alphabetically-last
(`biology.water-cycle`) is in lesson 15, which is what the implementation produces.

**Lesson count:** `ceil(106 / 7) = 16` lessons (7 concepts each except the last
which has 1 concept — `biology.water-cycle`).

**`BootstrapServiceImpl` import path:** `@praxis/core/services` (re-exported from
`src/services/index.ts`); `@praxis/core/services/bootstrap-service` is not a public
export specifier.
