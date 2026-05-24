---
id: epic-course-create-readiness-unified-landing-onboarding-slim
kind: story
stage: implementing
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
