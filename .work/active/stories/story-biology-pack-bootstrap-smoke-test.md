---
id: story-biology-pack-bootstrap-smoke-test
kind: story
stage: drafting
tags: [content, testing]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
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

<!-- Implementation Notes accumulate here as work progresses. -->
