---
id: epic-bootstrap-readiness-durable-drafts
kind: feature
stage: drafting
tags: [bootstrap, persistence]
parent: epic-bootstrap-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Durable bootstrap drafts

## Brief

Today `BootstrapServiceImpl` holds the in-progress draft in
`private readonly drafts = new Map<string, DraftCourseState>()`
(`packages/core/src/services/bootstrap-service.ts:68`). The Map dies with the
process — close the app mid-bootstrap, crash the explorer agent, or hit a
timeout during a `course.start_exploration` re-run, and the student loses
every concept, edge, and lesson they've accumulated. With drafts often
30-90s of explorer work plus several rounds of human-driven refinement,
losing them in v0.1.0 is the difference between bootstrap feeling like
"authoring" and "Russian roulette."

This feature moves the draft store from in-memory to SQLite-backed durable
storage so partial courses survive restarts, crashes, and explorer
timeouts. The student can close the app, reopen, and resume the same draft
they were editing. The schema mirrors the existing `DraftCourseState`
contract (units, lessons, concepts, edges, assessment shells, plus draft
metadata: `draftId`, `createdAt`, `updatedAt`, `confirmedAt | null`,
`discardedAt | null`) and lives in `packages/core/src/schema.ts`. `persistDraft`
keeps its role at confirm time — flipping `confirmedAt` from null and
materialising the artifact tables in the same transaction — and adds a
discard path that flips `discardedAt`.

The feature does NOT add new draft-mutation ops (that's
`epic-bootstrap-readiness-expressive-draft-api`), does not change the
ergonomics of `course.show_draft` / `course.edit_draft` from the agent's
point of view (same shape, same calls), and does not touch the explorer
agent itself.

## Epic context
- Parent epic: `epic-bootstrap-readiness`
- Position in epic: foundation feature — the expressive-draft-api feature
  builds on top of this. Shipping durable drafts first means the new ops
  land on the persistent store directly, avoiding a Map→SQLite migration
  for ops that don't exist yet.

## Foundation references
- `docs/ARCHITECTURE.md:331-335` — bootstrap mode is agentic;
  `persistDraft` currently materialises units + lessons + assessment
  shells in one transaction on confirmation. After this feature,
  `persistDraft` continues to do that — but the source-of-truth draft
  store is the database, not a process-local Map.
- `packages/core/src/services/bootstrap-service.ts:68` — the Map to
  replace.
- `packages/core/src/services/bootstrap-service.ts:915-924` —
  `persistDraft` signature; preserve.
- Prior shipped feature: `feature-bootstrap-drafts-streaming` in
  `.work/releases/v0.1.0/` — established the streaming-events shape and
  the `DraftCourseState` contract that this feature persists.

## Originating backlog
- `idea-persist-partial-courses` — consumed by this feature; will be
  removed from `.work/backlog/` as part of epic-design.

<!-- Design pass (`/agile-workflow:feature-design`) will fill in:
       - The drafts-table schema (columns, indices, FK behavior)
       - Drizzle schema entry + migration file
       - Read/write API (load by id, list active, update, delete)
       - Cleanup strategy for confirmed/discarded drafts
       - Test approach (round-trip, restart-survives, concurrent edits) -->
