---
id: feature-concept-maps-top-nav-route
kind: story
stage: done
tags: [ui, content]
parent: feature-concept-maps-top-nav
depends_on: [feature-concept-maps-top-nav-list-extension, feature-concept-maps-top-nav-coverage-bar]
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# /concept-maps top-nav route (Swiss Grid Catalog)

## Brief

Per the parent feature's Unit 3 and the locked Option 2 mock, implement
the `/concept-maps` top-nav route as a flat sortable 2-col card grid
with per-card coverage micro-bar, filter pills by course at top, sort
tabs (recent / coverage / course) on right. Replaces today's
placeholder at `packages/ui/src/routes/concept-maps.tsx`.

## Scope

### URL contract

In `packages/ui/src/router.tsx`, the `conceptMapsRoute` gets:

```typescript
validateSearch: z.object({
  course: z.string().optional(),
  sort: z.enum(["recent", "coverage", "course"]).optional(),
})
```

### Route component

In `packages/ui/src/routes/concept-maps.tsx`:

```typescript
export function ConceptMapsRoute(): JSX.Element {
  const { course, sort } = useSearch({ from: conceptMapsRoute.id });
  const navigate = useNavigate();
  const client = usePraxisClient();

  // Load maps + courses in parallel
  const mapsLoader = useCallback(
    () => client.conceptMaps.list({
      ...(course !== undefined && { courseId: course as CourseId }),
      sort: sort ?? "recent",
    }),
    [client, course, sort],
  );
  const { data: maps, loading, error } = useResource(mapsLoader);

  const coursesLoader = useCallback(() => client.courses.list(), [client]);
  const { data: courses } = useResource(coursesLoader);

  // Pills + tabs + grid render ...
}
```

### Layout (Option 2)

- `<RouteHeader title="Concept maps" />`
- Filter row: All pill + per-course pills (left) + sort tabs (right)
- Card grid: 2-column responsive grid. Each card renders title,
  course label, version count, last-updated, `<CoverageBar compact
  percent={linked/total} />` + label.
- Card click → `navigate({ to: "/courses/$courseId/concept-maps/$conceptMapId", params: ... })`.

### Filter / sort interactions

- Pill click sets `?course=<id>` (or clears if "All"). Use
  `navigate({ search: (prev) => ({ ...prev, course: id }) })`.
- Sort tab click sets `?sort=<mode>`. Same pattern.

### Empty states

- No courses at all → `<EmptyState>` "Start a course to build concept
  maps" + CTA to `/course-create`.
- Has courses, no maps → `<EmptyState>` "Open a course to build your
  first map" with course list links.

## Acceptance Criteria

- [ ] Route mounts at `/concept-maps` and lists maps across all courses
  by default (`sort=recent`).
- [ ] Filter pills render: All + one per course; clicking updates
  `?course=<id>` and the list re-filters.
- [ ] Sort tabs render: recent / coverage / course; clicking updates
  `?sort=<mode>` and the list re-orders.
- [ ] Each card renders title, course, version count, coverage
  bar + "X / Y · Z% mapped" label.
- [ ] Card click navigates to per-map detail.
- [ ] Empty state for no-courses renders the CTA.
- [ ] Empty state for has-courses-no-maps renders the course links.
- [ ] Bookmarkable URL `/concept-maps?course=algebra-1&sort=coverage`
  lands in the right state.
- [ ] UI tests cover: default load, filter pill click, sort tab
  click, URL param load, both empty states.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Notes

- Use `useResource` + `useSearch` patterns. Don't re-fetch the courses
  list on every filter/sort change; it's stable.
- `useResource(loader)` re-fetches when `loader` identity changes —
  put the `course` and `sort` values in the loader's `useCallback`
  deps so the re-fetch triggers naturally.
- `<RouteHeader>`, `<EmptyState>`, `<LoadingState>`, `<ErrorMessage>`
  are all in the editorial primitives — use them.

## Out of scope

- Backend service changes (list-extension story).
- CoverageBar primitive (coverage-bar story).
- Per-map editing surfaces (already exist at
  `/courses/$courseId/concept-maps/$conceptMapId`).

## Implementation notes

### Route component
`packages/ui/src/routes/concept-maps.tsx` — `ConceptMapsRoute` (top-level) + `ConceptMapCard`
(inner component). Two parallel `useResource` calls: maps loader (re-fetches on `course`/`sort`
deps) and courses loader (stable). Derived `courseMap` (Map keyed by courseId) powers card course
labels and filter pill generation.

### URL contract
`packages/ui/src/router.tsx` — `conceptMapsSurfaceRoute` gets `validateSearch: z.object({ course:
z.string().optional(), sort: z.enum(["recent","coverage","course"]).optional() })`. Route reads
params via `(useSearch as unknown as (...) => {...})({ strict: false })` matching the `course-create`
pattern; navigate calls use `(navigate as any)({ to: "/concept-maps", search: { ... } })` to stay
within TanStack Router's strict search-type system.

### Filter / sort handlers
- `onPickCourse(id)` — navigates to `/concept-maps` with `{ course: id, sort: activeSort }`.
  Preserves the current sort when switching courses.
- `onPickSort(s)` — navigates with `{ course, sort: s }`. Preserves the current filter.

### Empty states
- No courses → `<EmptyState>` + "Create a course" CTA to `/course-create`.
- Has courses, no maps → `<EmptyState>` + course list links to each course's `/concept-maps` path.

### CSS module
`packages/ui/src/routes/concept-maps.module.css` — Swiss Grid Catalog layout: control bar
(filter row left, sort row right), 2-col `ul.grid`, per-card coverage row with `<CoverageBar compact>`.

### Tests
`packages/ui/src/__tests__/concept-maps-route.test.tsx` — 20 tests covering:
- Default load: cards render, coverage labels, `sort=recent` default, version count, divergence badge
- Filter pills: all-courses + per-course pills render; click updates navigate call with `course` param
- Sort tabs: tabs render; click updates navigate call with `sort` param
- URL param load: `course`, `sort`, and both together forwarded to `client.conceptMaps.list`
- Empty state (no courses): CTA message + navigate to `/course-create`
- Empty state (has courses, no maps): message + course links navigate to per-course route
- Card navigation: click navigates to `/courses/$courseId/concept-maps/$conceptMapId`

### Verification
`pnpm typecheck && pnpm lint && pnpm test` — all green (4750 tests pass, 23 slow tests skipped).

## Review (2026-05-23)

**Verdict**: Approve

Faithful Option 2 mock translation. 20 tests cover the default load,
filter/sort interactions, URL param round-trip, both empty states,
and card navigation. The `(navigate as any)` cast for search-param
typing mirrors the established pattern in `course-create.tsx` — local
inconsistency that's the route system's, not this story's.

**Blockers**: none
**Important**: none
**Nits**:
- TanStack Router's strict search-typing forced the `as any` escape in
  navigate calls — same workaround as the unified-landing source-picker
  story used. Worth a future refactor to use the strongly-typed
  navigate API but out of scope here.
