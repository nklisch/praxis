---
id: feature-release-v0.1.0-cruft-findings
kind: feature
stage: done
tags: [cleanup]
parent: epic-release-v0.1.0-readiness
depends_on: []
release_binding: v0.1.0
gate_origin: cruft
created: 2026-05-10
updated: 2026-05-10
---

# v0.1.0 — cruft gate drain

## Brief

Container for the 7 findings produced by `/agile-workflow:gate-cruft`
against the v0.1.0 bundle on 2026-05-10. All 6 active findings are
mechanical Biome-detected issues — unused imports, dead variables,
misplaced suppressions — each a 1-3 line edit. The bundle is
otherwise clean across heuristic patterns (no stale "removed" comments,
no compatibility shims, no defensive try/catch around can't-throw code,
no over-abstracted single-impl interfaces).

This is the easiest feature to drain — orchestrator-friendly, no design
judgment required, fast to verify (`pnpm lint && pnpm typecheck`).

## Children (7)

### Active (6) — all High, all mechanical

- **High** — `gate-cruft-unused-import-proposed-assessment`
  (one import line in `bootstrap-service.ts:29`)
- **High** — `gate-cruft-unused-import-timestamp-bootstrap-test`
  (one symbol from an import list in `bootstrap-service.units.test.ts:13`)
- **High** — `gate-cruft-dead-pending-sketch-id-state`
  (dead `useState` + setter in `chat-tab-body.tsx:109,149`; remove
  state hook + setter call site + unused `SketchId` import)
- **High** — `gate-cruft-dead-queries-persist-units-test`
  (two never-asserted-on queries in `bootstrap-service.persist-units.test.ts:178-183`)
- **High** — `gate-cruft-misplaced-noexplicitany-suppression-client-test`
  (one biome-ignore comment misplaced in `client.test.ts:310`; move
  inline before the two `as any` casts to match the sibling test's
  pattern)
- **High** — `gate-cruft-unused-noexplicitany-suppression-pedagogy-pack`
  (one biome-ignore for `noExplicitAny` over an `as unknown as` cast
  with no `any` in `pedagogy-pack-service.ts:125`)

### Backlog (1)

- **Low** — `gate-cruft-stale-single-item-adds-comment`

## Implementation order

Any order — the 6 active items are all in different files and don't
interact. A single sub-agent could drain them in one pass.

## Source

`/agile-workflow:gate-cruft v0.1.0` audit committed at `c59a5b2`.

---

## Children complete (2026-05-10)

All 6 active children advanced to `stage: review` in a single
sub-agent's drain pass:

| Story | Commit |
|---|---|
| `gate-cruft-unused-import-proposed-assessment` | `0afa517` |
| `gate-cruft-unused-import-timestamp-bootstrap-test` | `8ea39e9` |
| `gate-cruft-dead-pending-sketch-id-state` | `f4c48ca` |
| `gate-cruft-dead-queries-persist-units-test` | `8de0e79` |
| `gate-cruft-misplaced-noexplicitany-suppression-client-test` | `a423144` |
| `gate-cruft-unused-noexplicitany-suppression-pedagogy-pack` | `9350ca7` |

One small deviation: the `gate-cruft-dead-pending-sketch-id-state` story
suggested removing the `SketchId` import alongside the dead state hook,
but `SketchId` is still used as the type annotation for the `sketchId`
parameter on `handleSendWithSketch`. The import was correctly retained;
only the dead `useState` declaration and its lone setter call were
deleted.

1 backlog child (Low: `gate-cruft-stale-single-item-adds-comment`)
remains bound to v0.1.0 for traceability but does not block this
feature's advancement.

## Verification

`pnpm typecheck && pnpm lint && pnpm test` clean. Pre-existing 18 lint
errors in `claude-cli-sdk` and end-to-end tests are unchanged (none
introduced by this work).

## Review (2026-05-10)

Approve. All 6 active children reviewed and advanced to `done`. The batch is entirely mechanical Biome-detected fixes — unused imports, dead state variables, misplaced/unused lint suppressions — each a 1-3 line edit in a different file with no cross-cutting risk. Every diff was applied cleanly with no orphan blank lines or broken surroundings.

The one documented deviation (`SketchId` import retention in `gate-cruft-dead-pending-sketch-id-state`) is confirmed correct: `SketchId` is still used at `chat-tab-body.tsx:145` as the parameter type for `handleSendWithSketch`. No findings across the batch.

## Lows drained (2026-05-10)

The 1 backlog Low story was lifted into active and drained by user request via `/agile-workflow:release-deploy v0.1.0` (option "Drain them now").

| Story | Resolution | Commit |
|---|---|---|
| `gate-cruft-stale-single-item-adds-comment` | Replaced `// Concept + edge mutations (batch — single-item adds removed).` with `// Concept + edge mutations (batch only).` in `start-exploration.ts:115` | `e058455` |

Reviewed and approved (2026-05-10); at `stage: done`.
