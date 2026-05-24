---
id: epic-course-create-readiness-unified-landing-onboarding-slim
kind: story
stage: done
tags: [ui, onboarding, refactor]
parent: epic-course-create-readiness-unified-landing
depends_on: [epic-course-create-readiness-unified-landing-source-picker]
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Onboarding slim-down

## Brief

Per the parent feature's design decision, onboarding's `CourseStep` should
delegate to `/course-create` instead of doing its own `session.start` +
pre-seed + `tabs.open` + `navigate` dance. Removes the `PRESEED_MESSAGES`
constant (the pack-source path inside `/course-create` owns the pre-seed
wording now).

## Scope

In `packages/ui/src/components/onboarding-flow.tsx`:

1. **Replace `CourseStep.handleStart`** (around line 341) — instead of
   inline `session.start` + pre-seed + `tabs.open` + `navigate`, simply
   call `navigate({ to: "/course-create", search: { pack: <selected> } })`
   for the Algebra/Biology cards, or
   `navigate({ to: "/course-create" })` for the Syllabus card.
2. **Remove the `PRESEED_MESSAGES` constant** and any references to it.
3. Update the click handlers on the 3 path cards (Algebra / Biology /
   Syllabus) to navigate per the matrix above.
4. Confirm the rest of `CourseStep` (UI shell, path-card rendering) stays
   intact — only the click-through behavior changes.

## Acceptance Criteria

- [ ] Onboarding's Algebra card navigates to `/course-create?pack=<algebra-id>`.
- [ ] Biology card navigates to `/course-create?pack=<biology-id>`.
- [ ] Syllabus card navigates to `/course-create` (no pre-attach).
- [ ] `PRESEED_MESSAGES` constant removed.
- [ ] No `session.start` / `tabs.open` calls remain in `CourseStep.handleStart`.
- [ ] Existing onboarding UI tests still pass.
- [ ] New onboarding tests cover: the 3 path cards' navigation targets.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Notes

- The canonical pack ids come from the source-picker story's
  implementation — read it to confirm the exact id format (e.g.
  `algebra-1` vs `algebra_1` vs a slug).
- TanStack Router navigate shape:
  `navigate({ to: "/course-create", search: { pack: "algebra-1" } })`.

## Out of scope

- Source-picker UI changes (separate story).
- Bypass-route rerouting outside onboarding (separate story).
- /packs route removal (separate story).
- Redesign of onboarding card shells or step navigation.

## Implementation notes

**Canonical pack ids confirmed** from `packages/curriculum/packs/*.json` top-level `id` fields:
- Algebra: `"algebra-1"` (file: `algebra-1.json`)
- Biology: `"biology"` (file: `biology.json`)

**Navigate calls** (`packages/ui/src/components/onboarding-flow.tsx`):
- Algebra (line ~342): `navigate({ to: "/course-create", search: { pack: "algebra-1" } })`
- Biology (line ~344): `navigate({ to: "/course-create", search: { pack: "biology" } })`
- Syllabus (line ~346): `navigate({ to: "/course-create" })`

**`PRESEED_MESSAGES` removed**: constant and all references deleted. The source-picker's pack pre-attachment (via `?pack=<id>` URL param) replaces the pre-seed message pattern entirely.

**`CourseCard` props simplified**: `busy` and `disabled` props removed (no async work in `handleStart` anymore); card is always clickable.

**`client` / `session` / `tabs` not used in `CourseStep`**: no imports removed from module-level (they remain for `EngineStep`), but `CourseStep` itself no longer calls any client methods.

**`onComplete` order**: called first (to flip the first-run flag and switch to normal layout), then `navigate` — reversing the old "session work first" ordering since there is no session work to protect.

**Tests** (`packages/ui/src/__tests__/onboarding-flow.test.tsx`):
- Removed: pre-seed message tests, session-work-before-onComplete ordering test, startRejects error-display test.
- Added: `course card navigation` describe block with 3 tests covering algebra/biology/syllabus navigate targets and onComplete call order (onComplete fires before navigate).
- All 18 tests green; full suite (436 files, 4672 tests) green.

**Verification**: `pnpm typecheck && pnpm biome check <files> && pnpm test` — all clean.

## Review (2026-05-23)

**Verdict**: Approve

Net code reduction — onboarding-flow.tsx loses PRESEED_MESSAGES, the
busy/error state, and the entire session.start dance, gaining just 3
navigate calls. CourseStep is now a thin pre-step over the canonical
/course-create entry. Canonical pack ids verified from JSON files
(`algebra-1`, `biology`). onComplete ordering reversed cleanly (now
fires before navigate since there's no session work to protect against).
Test set restructured appropriately: removed stale pre-seed assertions,
added card-navigation coverage.

**Blockers**: none
**Important**: none
**Nits**: none
