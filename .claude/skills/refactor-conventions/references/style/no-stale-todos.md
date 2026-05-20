# Style Rule: no-stale-todos

> Every `TODO` / `FIXME` carries either (a) an owner + linked substrate
> id or issue, or (b) a concrete trigger condition that says when it
> becomes actionable. No "TODO eventually", no milestone-tagged TODOs,
> no orphan FIXMEs.

## Motivation

A TODO with no owner and no trigger is a wish, not a task. It rots in
the source tree, gets copy-pasted into adjacent code, and eventually
gets read as "this is intentionally broken." Praxis already tracks work
in `.work/` — TODOs in source should either point at a substrate item
or describe the externally-observable condition that will make them
runnable. Anything else belongs in `.work/backlog/` or `git rm`.

## What Counts

1. **Bare TODO/FIXME with no owner and no trigger.**
   `// TODO: fix this`, `// FIXME: probably wrong`.
2. **Milestone-tagged TODOs.**
   `// TODO Phase 17.5: ...`, `// TODO(sprint-7): ...`, `// TODO v2: ...`.
   These rot the moment the milestone meaning is lost.
3. **TODOs with a person but no link.**
   `// TODO(nathan): fix later` — fine as a checkpoint *while you're
   typing*, not fine landed on `main`.
4. **TODOs that describe a wish, not a trigger.**
   `// TODO: make this faster`, `// TODO: better error handling`.

A TODO is **actionable** (keep it) when it points at:
- a substrate item (`// TODO(story-foo): replace with X`), or
- an external event (`// TODO: re-enable once Gemini 3.5 ships GA`), or
- a code condition (`// TODO: remove when LessonId is migrated to UUID`).

## Before / After

### From this codebase: milestone-tagged TODO

**Before** — `packages/core/src/services/assignment-service.ts:610`
```ts
// TODO Phase 17.5: write misconception evidence via
//   ctx.services.memory.recordMisconception
```

**After** — replace with either a substrate-linked or trigger-linked
form, e.g.:
```ts
// TODO(story-misconception-evidence-write): write evidence via
//   ctx.services.memory.recordMisconception
```
Or, if it's not worth tracking as a story, delete it and add it to
`.work/backlog/` with `/agile-workflow:park`.

### Synthetic example: bare TODO

**Before**
```ts
// TODO: maybe handle the empty case
if (items.length === 0) return [];
```

**After** — delete; the branch already handles the empty case. If
there's a real concern, name it:
```ts
// TODO: confirm zero-item input is unreachable in production paths
// (currently observed only in test fixtures — see story-xyz).
if (items.length === 0) return [];
```

## Exceptions

- **Drafting / in-progress branches.** Bare TODOs are fine in code
  that hasn't merged. This rule applies to landed commits.
- **`@deprecated` JSDoc tags** on still-supported APIs — those *are*
  the link to follow-up work.
- **External-pinned TODOs** with a date or vendor-API name in place of
  a substrate id (`// TODO: remove once @ai-sdk/google fixes
  streaming` is acceptable).

## Scope

- **Applies to**: All TS/TSX in `packages/*/src/` and `apps/*/src/`,
  including JSDoc.
- **Does NOT apply to**:
  - `docs/`, `.work/`, `.mockups/` — these are *meant* to carry TODOs.
  - Test fixtures and demo data — `// TODO mock data` is fine in
    `__tests__/`.
  - The `.claude/` and `.agents/` skill content.

## Detection

```bash
rg -n --type ts -g 'packages/*/src/**' -g 'apps/*/src/**' \
  -g '!**/__tests__/**' -g '!**/dist/**' \
  -e '\bTODO\b' -e '\bFIXME\b' -e '\bXXX\b' -e '\bHACK\b'
```

For each match, classify:
- **High Value**: bare TODO with no owner/trigger, or milestone-tagged
  (e.g. `Phase N`, `sprint N`, `v2`). Acceptance: replace with a
  substrate-linked TODO or delete + park to backlog.
- **Worth Considering**: TODO with an owner but no link.
- **Not Worth It**: TODO with a substrate id or external trigger
  already attached.
