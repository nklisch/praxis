---
id: epic-backend-fills-for-redesign-ui-completion-bundle-create-course-cta
kind: story
stage: done
tags: [ui]
parent: epic-backend-fills-for-redesign-ui-completion-bundle
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Library "+ Create a course" CTA

## Scope

Add a direct create-from-scratch button to the library Workbench so a
new user has a cold-start entry point that isn't "Use this pack."

## Implementation steps

1. Locate the library/Workbench route component
   (`packages/ui/src/routes/library.tsx` or equivalent).
2. Add a "+ Create a course" button styled per the locked discovery
   mock (`.mockups/screens/.../-discovery-surfaces/option-4.html`).
3. On click, invoke the existing course-create entry point — call
   `praxisClient.bootstrap.startExploration` (or whatever the renamed
   equivalent is once `idea-rename-bootstrap-and-explorer` lands) to
   open a new course-create session.
4. Use the `session-tab-open-flow` pattern to open the new session
   in a tab.
5. Tests: `library.test.tsx` covering the CTA + spawn flow with a
   fake client.
6. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] "+ Create a course" button visible in the library.
- [ ] Click opens a course-create session and navigates to its tab.
- [ ] All quality checks green.

## Out of scope

- Renaming the underlying tool / mode id — tracked separately at
  `.work/backlog/idea-rename-bootstrap-and-explorer.md`.

## Implementation notes

- Added `onCreateCourse?: () => void` prop to `CoursesSection`; when set, the
  prop is passed to `LibrarySection` as both a `headerAction` (small mono button
  in the section header right) and an `emptyAction` (EmptyState action button for
  cold-start users with no courses yet).
- Handler in `library.tsx` calls `openSessionInTab` with `modeId: "bootstrap"` —
  same path as "Use this pack" but without the prior `packs.import` step.
- `courses-section.module.css` gets a `.createCta` class matching the existing
  `.cta` typographic style (mono, uppercase, accent underline on hover) but
  slightly smaller (0.58rem) to read as a secondary header affordance.
- Two new tests in `library-route.test.tsx`: renders check + click-spawns check
  (both header-action and empty-action carry the same label, so the click test
  uses `getAllByRole` and clicks index 0).
- All 3794 tests pass; lint clean; pre-existing typecheck failure in
  `@praxis/core` (duplicate `Recommendation` identifier) was present before this
  change.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: First render-test uses `getByRole` (singular) despite two matching buttons potentially existing in the empty state; test passes in practice because `loading` is still true when `waitFor` resolves — no functional issue.

**Notes**: Implementation is clean and minimal. Correctly uses `session-tab-open-flow` via `openSessionInTab`. The `headerAction`/`emptyAction` dual-placement correctly addresses both warm (has courses) and cold-start (no courses) cases. No foundation-doc assertions affected. No breaking changes.
