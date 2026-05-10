---
id: story-cleanup-stale-singular-draft-tool-refs
kind: story
stage: implementing
tags: [cleanup, bootstrap]
parent: epic-bootstrap-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Cleanup: stale references to removed singular draft tools

The bootstrap-drafts-streaming feature replaced five singular draft tools
(`draft-add-concept`, `draft-add-edge`, `draft-add-lesson`,
`draft-add-lesson-assessment`, `draft-finalize`) with batch variants. The
implementations and registrations were removed, but several tool descriptions
and one internal doc comment still reference the deleted singular names.

These descriptions are visible to the explore agent — pointing it at tool
names that no longer exist invites a wasted step plus a recover-from-error
loop.

## Stale references found

- `packages/tools/src/course/draft-add-unit.ts:29` — input field description
  says "Draft lesson ids (from course.draft_add_lesson)". Should read
  `course.draft_add_lessons`.
- `packages/tools/src/course/draft-add-concepts.ts:40` — description has
  "Prefer this over course.draft_add_concept". The singular doesn't exist;
  drop the comparative clause.
- `packages/tools/src/course/draft-add-lessons.ts:56` — same shape:
  "prefer this over course.draft_add_lesson". Drop the clause.
- `packages/tools/src/course/draft-add-edges.ts:44` — same shape:
  "prefer this over course.draft_add_edge". Drop the clause.
- `packages/core/src/types/artifacts.ts:670` — internal jsdoc comment
  references `course.draft_finalize`. Update to `course.start_exploration`
  only (finalize is gone).

## Stale build artefacts

`packages/tools/dist/course/` carries `.js`/`.d.ts` for the removed singular
tools (`draft-add-concept`, `draft-add-edge`, `draft-add-lesson`,
`draft-add-lesson-assessment`, `draft-finalize`). They aren't on any import
path (the source `index.ts` only references the plurals), so they're dead
weight rather than a runtime hazard. A clean `pnpm build` after deletion of
the source files would have purged them; the existing `tsc -b` setup keeps
stale outputs.

Optional: add a `clean` script that runs before `build` if this becomes a
recurring problem; otherwise just rebuild from a clean state during the
cleanup.

## Acceptance

- All five source-level references updated or removed.
- Stale `dist/` files in `packages/tools/dist/course/` removed.
- `pnpm build && pnpm typecheck && pnpm test` green.
- No grep hit for `draft_add_concept\b`, `draft_add_edge\b`,
  `draft_add_lesson\b` (excluding `_assessment`/`s` suffixes), or
  `draft_finalize\b` anywhere under `packages/`.
