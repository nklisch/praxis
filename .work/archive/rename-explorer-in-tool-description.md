---
id: rename-explorer-in-tool-description
kind: story
stage: done
tags: [cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Rename "bootstrap explorer" residual in `use_canonical_pack` tool description

## Brief

The 5-step Explorer → Drafter / bootstrap → course-create rename swept all
code, file names, tool names, mode ids, and foundation docs. The followup
comment sweep (`cleanup-stale-explorer-comments-sweep`, commit `3a85346`)
caught all JSDoc/comment residuals.

One **runtime string** survived both passes:

- `packages/tools/src/course/use-canonical-pack.ts:25` — `description:` string
  literal on a tool definition. Contains "running the bootstrap explorer".
  This string is sent to the LLM at runtime as the tool's description, so
  editing it is a wire-level (model-facing) change rather than a comment edit.

Because the change is model-facing, it warrants its own scoped item with a
proper review — a tool description is part of the prompt surface, and any
phrasing shift may subtly alter how the model selects/uses the tool.

## Implementation plan

1. Rewrite the description to use "drafter" / "course-create" phrasing.
2. Confirm no other tool descriptions retain stale "explorer" / "bootstrap"
   phrasing — full audit grep across `packages/tools/src/*/`.
3. Spot-check one or two drafter/configurator sessions after the rename to
   verify the tool is still selected as expected.

## Implementation notes

### What landed

Four model-facing strings updated across three files in `packages/tools/src/course/`:

1. **`use-canonical-pack.ts:25`** — primary target. "running the bootstrap explorer" → "having the drafter build one from the student's materials"; "building from their own materials" → "authoring concepts and lessons from scratch".

2. **`list-canonical-packs.ts:29`** — audit find. "in bootstrap mode" → "in course-create mode"; "alternative to extracting concepts from documents" → "alternative to having the drafter extract concepts from documents".

3. **`list-library-documents.ts:29`** — audit find. "bootstrap session" → "drafting session"; "In bootstrap mode" → "In course-create mode"; "active bootstrap exploration is reading" → "drafter is reading from".

4. **`start-drafting.ts:59`** — audit find. "user-set bootstrap budget" → "user-set drafter budget" (inside the `maxSteps` `.describe()` string).

### Audit findings

Grep across `packages/tools/src/*/` for "explorer" and "bootstrap":

- `ctx.services.bootstrap` — service property name (runtime identifier, not user-facing). Not changed; the service is named `bootstrap` throughout `ServiceDeps` and it's not a model-facing string.
- `list-library-documents.ts` lines 16–19, `start-drafting.ts` lines 105–147 — code comments (not sent to model). Not changed; left for a separate comment-sweep if desired.
- `list-library-documents.ts:133` test comment "explorer sub-agent mode" — test file comment, not model-facing. Left as-is.
- `start-drafting.ts:162` activity label "exploring" — runtime UI string for the activity rail strip, not a tool description. Left as-is.
- No other model-facing `.describe()` or `description:` strings contained stale "explorer" or "bootstrap" phrasing.

### Verification

- `pnpm --filter @praxis/tools build` — clean
- `pnpm --filter @praxis/tools typecheck` — clean
- `pnpm lint` (workspace) — 529 pre-existing errors in mockups; zero new errors in `packages/tools`
- `pnpm vitest run packages/tools/src` — 567 passed, 22 skipped (slow-test gates), 0 failures

`pnpm --filter @praxis/tools test` errors with "non-existing directory: tests" — pre-existing infra issue (no `tests/` dir in the package); tests run fine via the workspace runner.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `list-library-documents.ts:29` uses "drafting session" rather than "course-create session" — both defensible (agent-perspective vs mode-id-perspective). Current choice (agent-perspective, matching the new "drafter" identity) is fine and consistent with the prior rename's style.

**Notes**: 4 model-facing strings updated across 4 files. Each preserves the substantive meaning; only the phrasing identity ("bootstrap explorer" → "drafter", "bootstrap mode" → "course-create mode") changes. The audit grep correctly turned up 3 additional sites beyond the originally-noted one — scope expansion was on-spec for this story (the story body explicitly asked for the audit). The user-side spot-check of drafter/configurator sessions (story's verification step #3) is deferred to the user, as is appropriate — not a blocker for advancing this story.
