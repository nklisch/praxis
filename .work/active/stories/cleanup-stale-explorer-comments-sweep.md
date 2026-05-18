---
id: cleanup-stale-explorer-comments-sweep
kind: story
stage: review
tags: [cleanup, docs]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Story: sweep stale "explorer" references in code comments and JSDoc

## Brief

The 5-step refactor-rename feature successfully renamed Explorer → Drafter
in code, file names, tool names, mode ids, and foundation docs (see
`refactor-rename-bootstrap-and-explorer` for the full audit). However,
discovery picked up residual "explorer" / "bootstrap explorer" references
in **code comments and JSDoc** that the rename sweep didn't catch —
because comments are invisible to grep when filtering out renamed entities.

These are pure documentation debt: the surrounding code is correct;
only the comments describe the old conceptual model.

## Sites flagged

(Verify line numbers during edit — discovery scan output:)

- `packages/artifacts/src/schema.ts:18` — `"Written by persistDraft when the explorer produces a"` → s/explorer/drafter/
- `packages/core/src/schema.ts:56` — `"Durable per-student draft course state for the bootstrap explorer."` → s/the bootstrap explorer/the drafter/
- `packages/core/src/config/logging-config.ts:45` — `"way to diagnose engine adapter / explorer / IPC issues"` → s/explorer/drafter/
- `packages/core/src/services/course-create-service.ts:164-165` — `"Phase 16: create a new draft up-front (before the explorer has any concepts to add). Used by the explorer's draft_init tool."` → s/explorer/drafter/ (twice)
- `packages/core/src/types/tool.ts` — search for `"explorer"` in comments (multiple)
- `packages/core/src/types/artifacts.ts:602, 661, 666, 667, 670, 686, 702, 743, 762` — JSDoc using stale "explorer" terminology to describe draft/assessment structures

Sweep grep that should drive the work:

```
grep -rn 'explorer' packages/ --include='*.ts' --include='*.tsx' \
  | grep -v dist | grep -v node_modules | grep -v __tests__ \
  | grep -v 'release\|archive\|mockup'
```

Filter the results to comment lines (lines starting with `*` or `//`)
and JSDoc blocks. Skip:

- The historical migration SQL files under `drizzle/`
- `.work/archive/`, `.work/releases/` (substrate history)
- `docs/designs/phase-16-bootstrap-explorer.md` (phase design doc — kept
  as history per the rolling-forward rule)
- Generic CS uses of "explore" / "exploration" in prose where the meaning
  is the verb, not the named agent

## Current State

Comments and JSDoc reference "the explorer" / "the bootstrap explorer" /
"explorer's tool" — describing the renamed agent by its pre-Phase-16
internal name.

## Target State

Comments and JSDoc reference "the drafter" / "drafter's tool" — matching
the renamed code and user-facing language.

## Implementation Notes

- Per the rolling-forward principle (see `.claude/rules/agile-workflow.md`),
  **do NOT add** "previously called …" prose. Just update.
- Multi-file but mechanical — one commit covers it.
- Preserve generic verbs ("explore the catalogue", "exploring this idea")
  where they don't reference the named agent.
- Run `pnpm typecheck` after — comments don't affect compilation, but a
  stray edit might shift a multi-line string.

### Sweep results

**Files touched (13):**
- `packages/artifacts/src/schema.ts` (1 comment)
- `packages/core/src/schema.ts` (1 comment)
- `packages/core/src/config/logging-config.ts` (1 comment)
- `packages/core/src/services/course-create-service.ts` (3 comments)
- `packages/core/src/types/artifacts.ts` (8 JSDoc comments)
- `packages/core/src/types/tool.ts` (2 JSDoc lines)
- `packages/curriculum/src/modes/course-create.ts` (1 comment)
- `packages/engines/src/claude-code/adapter.ts` (1 comment)
- `packages/tools/src/registry.ts` (1 comment)
- `packages/tools/src/course/list-library-documents.ts` (2 comments)
- `packages/ui/src/components/sub-agent-block.tsx` (1 comment — mockup filename ref updated to `03-drafter-running.html`)
- `packages/ui/src/components/course-create-tab-body.tsx` (4 comments)
- `packages/ui/src/hooks/use-drafts.ts` (1 comment)

**Total comments rewritten:** 27

**Non-comment residuals flagged (out of scope, separate cleanup):**
- `packages/tools/src/course/use-canonical-pack.ts:25` — `description:` string literal in tool definition ("running the bootstrap explorer") — flows to the LLM at runtime. Intentionally left alone per comment-only scope.

**Final sweep verification:**
```
grep -rn 'the explorer\|bootstrap explorer\|explorer agent\|explorer.s ' packages/ --include='*.ts' --include='*.tsx' | grep -v dist | grep -v node_modules | grep -v __tests__ | grep -v release | grep -v archive
```
Result: 1 match — only the runtime string in `use-canonical-pack.ts:25` (flagged above). Zero comment/JSDoc residuals.

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] Sweep grep above returns only:
  - Generic verb uses of "explore" / "exploration"
  - Files explicitly out of scope (substrate history, design history)
  - Zero references to "the explorer" / "bootstrap explorer" / "explorer agent" / "explorer's …" in code comments or JSDoc

## Risk

**Very low** — comment-only edits.

## Rollback

`git revert <commit>` — clean.
