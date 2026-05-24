---
id: feature-orphan-routes-audit-connect-course-detail-from-library
kind: story
stage: review
tags: [ui, navigation]
parent: feature-orphan-routes-audit
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Connect /courses/$courseId to LibraryRoute

## Location
`packages/ui/src/routes/library.tsx`
`packages/ui/src/components/library/courses-section.tsx`

## Evidence
`/courses/$courseId` (CourseDetailRoute) is registered in the router and is the entry point for the course sub-tree (`/courses/$courseId/map`, `/courses/$courseId/concepts`, `/courses/$courseId/concept-maps`). The only working inbound links today come from *within* the sub-tree (back-buttons: `course-map.tsx:331`, `concept-maps-list.tsx:76`, `course-concepts-list.tsx:142`). There is no link *into* the sub-tree from the top-level Library.

Root cause: `CoursesRoute` (`routes/courses.tsx`) is a dead component — it is never imported into `router.tsx` and has no route registration. It was the pre-Phase-14 entry point. When Phase 14 replaced `/courses` with `/library`, the link that drove users from Library → CourseDetail was never ported over.

`CoursesSection` (`components/library/courses-section.tsx`) is also dead — it exports `CoursesSection` and `CoursesSectionProps` but is never imported anywhere in the codebase.

## Suggested fix
In `LibraryRoute` (or a new `CoursesSection` wired in), add a "My Courses" section that lists enrolled courses. Each course card / row should call:

```tsx
navigate({ to: "/courses/$courseId", params: { courseId: course.courseId } })
```

The `CoursesSection` component in `components/library/courses-section.tsx` already implements the list — it just needs to be imported and wired into `LibraryRoute` with an `onOpenInTab` prop that performs the navigation. Rename `onOpenInTab` to `onOpen` if the intent is now navigate-only (no tab concept for course detail), or keep the name and drive a `navigate` from library.

## Acceptance
- At least one affordance in `LibraryRoute` navigates to `/courses/$courseId`.
- The courses list renders when the user has at least one course.
- An empty state is shown when there are no courses (link to create one is fine).
- `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation notes

- Imported `CoursesSection` into `packages/ui/src/routes/library.tsx` and placed it between the greeting block and the two-column workbench.
- Added `handleOpenCourse` callback that calls `navigate({ to: "/courses/$courseId", params: { courseId } })` — `onOpenInTab` prop name kept (rename deferred to sibling story if desired); the handler navigates rather than opening a tab because course detail has no tab concept.
- `onCreateCourse` is wired to the existing `handleCreateCourse` (→ `/course-create`), giving the section both a header CTA and an empty-state CTA.
- Courses data comes from `useLibrary()` which already fetched `data.courses` in parallel with packs/docs/sessions — no new API call needed.
- Fixed a pre-existing `exactOptionalPropertyTypes` violation in `courses-section.tsx`: replaced explicit `undefined` prop assignments for `headerAction`/`emptyAction` with a conditional spread so optional props are simply omitted when `onCreateCourse` is absent.
- All 164 UI test files (1714 tests) pass; `pnpm typecheck` clean across all packages.
