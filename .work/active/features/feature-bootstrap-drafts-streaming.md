---
id: feature-bootstrap-drafts-streaming
kind: feature
stage: review
tags: [content, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-09
updated: 2026-05-10
---

# Bootstrap drafts: live stream from explorer to renderer

## Context

Captured retroactively on 2026-05-09 when `/agile-workflow:convert` bootstrapped
the substrate. The work was already substantially in the working tree (typecheck
clean, all 2000 tests passing, lint improved by 38 errors over baseline) — this
item formalises it so it can be reviewed and shipped.

## What this feature adds

A live stream of bootstrap-mode draft state from `BootstrapServiceImpl` to the
renderer, plus the supporting tool / hook / config surface that makes the stream
useful:

- **Server side.** `bootstrap-service.ts` now emits `DraftStreamEvent`s
  (`snapshot` / `started` / `updated` / `finalized` / `discarded`) on every
  state-changing operation. New `bootstrap-config.ts` centralises TTL + budget
  knobs; new `bootstrap-drafts-channel.ts` IPC handler funnels events through
  the same `praxis.bootstrap.drafts.events` channel pattern the activity rail
  uses.

- **Client transport.** `DraftsClient` (mirrors `ActivityClient`) opens a
  persistent stream with `snapshot` first so a fresh subscriber sees current
  state immediately.

- **Tool refactor (singular → batch).** The explorer's per-call draft tools
  (`draft-add-concept`, `draft-add-edge`, `draft-add-lesson`,
  `draft-add-lesson-assessment`, `draft-finalize`) are replaced with batch-mode
  variants (`draft-add-concepts`, `draft-add-edges`, `draft-add-lessons`,
  `draft-add-lesson-assessments`). One model turn can now apply many edits as a
  single transaction-coherent batch — fewer round-trips, cleaner stream events.

- **Renderer hooks.** `use-drafts` subscribes to the stream and exposes the
  current draft set; `use-bootstrap-budget` exposes the live token-budget
  signal so the explorer's progress is legible to the student;
  `episodic-to-messages` is a new hook that derives the chat message log from
  the episodic stream (rather than maintaining a parallel local message
  array). `bootstrap-tab-body.tsx` consumes all three.

- **Explorer prompt + role updates.** `explorer-prompt.ts` and the
  `bootstrap-role` mode fragment teach the model about the new batch tool
  shape and the budget signal it should respect.

## Why this is one feature

The five clusters above cohere around a single user-visible behaviour: when the
bootstrap-mode tutor maps a course, the student sees the draft assemble live
instead of waiting for a single big drop at the end of the agentic loop. The
batch tool refactor is load-bearing because per-call streaming events were too
noisy at single-edit granularity; the budget hook is load-bearing because
without a visible signal the student has no sense of how far along the explorer
is.

## Status

`stage: implementing` at substrate-bootstrap. All code exists in the working
tree; `pnpm typecheck` and the relevant test suites pass. The closing commit
lands the lot in one transaction so the substrate sees implementation as
complete, then advances to `review` for the user.

## Files in scope

**New (untracked):**
- `packages/core/src/types/draft-stream.ts`
- `packages/core/src/config/bootstrap-config.ts` (+ test)
- `packages/core/src/services/__tests__/bootstrap-service.draft-stream.test.ts`
- `packages/client/src/services/drafts-client.ts`
- `packages/desktop/electron/main/bootstrap-drafts-channel.ts`
- `packages/tools/src/course/draft-add-concepts.ts` (+ test)
- `packages/tools/src/course/draft-add-edges.ts` (+ test)
- `packages/tools/src/course/draft-add-lessons.ts` (+ test)
- `packages/tools/src/course/draft-add-lesson-assessments.ts` (+ test)
- `packages/ui/src/hooks/use-drafts.ts` (+ test)
- `packages/ui/src/hooks/use-bootstrap-budget.ts` (+ test)
- `packages/ui/src/hooks/episodic-to-messages.ts` (+ test)

**Removed:**
- `packages/tools/src/course/draft-add-concept.ts` (singular)
- `packages/tools/src/course/draft-add-edge.ts` (singular)
- `packages/tools/src/course/draft-add-lesson.ts` (singular)
- `packages/tools/src/course/draft-add-lesson-assessment.ts` (singular)
- `packages/tools/src/course/draft-finalize.ts` (subsumed by the batch tools)

**Modified (representative):**
- `packages/core/src/services/bootstrap-service.ts` (emits events, uses new config)
- `packages/curriculum/src/bootstrap/explorer.ts` + `explorer-prompt.ts` + tests
- `packages/curriculum/src/modes/fragments/bootstrap-role.ts`
- `packages/tools/src/course/{confirm-draft, index, start-exploration}.ts`
- `packages/ui/src/components/bootstrap-tab-body.{tsx,module.css}`

## Acceptance criteria

- `pnpm typecheck && pnpm lint && pnpm test` green at the closing commit (last
  two already verified pre-commit; lint count must not regress).
- A bootstrap-mode session in dev shows the draft populating live as the
  explorer maps concepts/edges/lessons.
- The explorer can no longer call any singular `draft-add-*` tool — the
  registry is batch-only.
- `useDrafts()` and `useBootstrapBudget()` re-render correctly when the stream
  emits, with no React strict-mode double-subscribe issues.

## Next step

Land the closing commit, advance `stage: review`. User runs
`/agile-workflow:review feature-bootstrap-drafts-streaming` to evaluate.
