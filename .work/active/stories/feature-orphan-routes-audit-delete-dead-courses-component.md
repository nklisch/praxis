---
id: feature-orphan-routes-audit-delete-dead-courses-component
kind: story
stage: implementing
tags: [ui, cleanup]
parent: feature-orphan-routes-audit
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Delete dead CoursesRoute component and CoursesSection

## Location
`packages/ui/src/routes/courses.tsx`
`packages/ui/src/components/library/courses-section.tsx`
`packages/ui/src/__tests__/courses-route.test.tsx`

## Evidence

### `routes/courses.tsx` (CoursesRoute)
- Exports `CoursesRoute` — a fully-implemented course-list page component.
- **Never imported into `router.tsx`** — no route registration exists for it.
- Only reference: `packages/ui/src/__tests__/courses-route.test.tsx` (a test that renders the component directly, but since the component has no live route, the test covers unreachable UI).
- Pre-Phase-14 artifact: this was the old `/courses` page before Phase 14 replaced it with `LibraryRoute` at `/`. The redirect `coursesRedirect` in `router.tsx` now sends `/courses` → `/library`.

### `components/library/courses-section.tsx` (CoursesSection)
- Exports `CoursesSection` and `CoursesSectionProps`.
- **Never imported anywhere** in the codebase (confirmed by grep across all `.tsx`/`.ts` under `packages/ui/src`).
- Appears to be a component prepared for a "My Courses" section in Library that was never wired in (see companion story `feature-orphan-routes-audit-connect-course-detail-from-library` which proposes wiring it in properly).

## Note on dependency
If `feature-orphan-routes-audit-connect-course-detail-from-library` is implemented first and adopts `CoursesSection`, then `CoursesSection` should NOT be deleted here — only `courses.tsx` and its test should be removed. Coordinate with that story.

## Suggested fix
1. Delete `packages/ui/src/routes/courses.tsx`.
2. Delete `packages/ui/src/__tests__/courses-route.test.tsx`.
3. Delete `packages/ui/src/components/library/courses-section.tsx` (only if not adopted by the connect-course-detail story).
4. Verify `pnpm typecheck && pnpm lint && pnpm test` are green.

## Acceptance
- `routes/courses.tsx` is removed.
- `__tests__/courses-route.test.tsx` is removed.
- `courses-section.tsx` is removed (or kept if adopted).
- No broken imports.
- `pnpm typecheck && pnpm lint && pnpm test` green.
