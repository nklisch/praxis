---
id: feature-progress-top-nav-route
kind: story
stage: done
tags: [ui, content]
parent: feature-progress-top-nav
depends_on: [feature-progress-top-nav-service, feature-concept-maps-top-nav-coverage-bar]
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# /progress top-nav route (Course-by-Course Review)

## Brief

Per the parent feature's Unit 2 and the locked Option 1 mock, implement
the `/progress` top-nav route as a long single-column "chapter per
course" surface with mastery rollup at the head and a three-column body
(you-are-here / stuck-on / recently) underneath. Replaces today's
placeholder at `packages/ui/src/routes/progress.tsx`. Consumes
`CourseProgressRollup[]` from the service story and the
`<CoverageBar>` primitive from the concept-maps feature.

## Scope

### Route component

```typescript
// packages/ui/src/routes/progress.tsx
export function ProgressRoute(): JSX.Element {
  const client = usePraxisClient();
  const loader = useCallback(() => client.progress.rollup(), [client]);
  const { data: rollups, loading, error } = useResource(loader);

  if (loading) return <LoadingState message="Loading progress…" />;
  if (error) return <ErrorMessage error={error} />;
  if (!rollups || rollups.length === 0) {
    return (
      <>
        <RouteHeader title="Progress" />
        <EmptyState message="Start a course to see progress" /* + CTA to /course-create */ />
      </>
    );
  }

  return (
    <>
      <RouteHeader title="Progress" />
      <div className={styles.chapters}>
        {rollups.map((rollup) => <CourseChapter key={rollup.courseId} rollup={rollup} />)}
      </div>
    </>
  );
}
```

### CourseChapter sub-component

```typescript
function CourseChapter({ rollup }: { rollup: CourseProgressRollup }): JSX.Element {
  return (
    <section className={styles.chapter}>
      <header className={styles.chapterHeader}>
        <h2>{rollup.courseTitle}</h2>
        <div className={styles.masteryRow}>
          <span className={styles.masteryPct}>{Math.round(100 * rollup.masteryPercent)}%</span>
          <CoverageBar compact percent={rollup.masteryPercent}
            ariaLabel={`Mastery: ${Math.round(100 * rollup.masteryPercent)}%`} />
        </div>
      </header>
      <div className={styles.body3col}>
        <YouAreHere lesson={rollup.currentLesson} gate={rollup.activeGate} />
        <StuckOn concepts={rollup.stuckConcepts} />
        <Recently events={rollup.recentEvents} />
      </div>
    </section>
  );
}
```

### YouAreHere sub-component

- If `lesson` set: "Working on **{title}** — lesson {index} of {total}"
- If `gate` set: "Next gate: **{title}** — {lockReason}"
- If both null: "No active lesson"
- Mock reference: option-1.html columns 1 of each chapter.

### StuckOn sub-component

- Render 0-4 concept rows: `{name}` + `{mastery as decimal e.g. 0.41}`
- Empty: "No stuck concepts" (positive framing).

### Recently sub-component

- Render 0-3 event rows: relative timestamp + label + detail.
- Format timestamp with `formatDistanceToNow` or similar; e.g.
  "yesterday", "3 days ago".
- Event kinds (label format):
  - `session` → "Session: {label}" / "{detail}" (e.g. "Session: Algebra · 25 min")
  - `gate` → "Gate passed: {label}" / "{detail}"
  - `grade` → "Quiz {label} · {detail}"

## Acceptance Criteria

- [ ] Route mounts at `/progress` and renders one chapter per course.
- [ ] Each chapter shows mastery % + `<CoverageBar>` in the header.
- [ ] "You are here" renders current lesson + next gate (or placeholder
  text when null).
- [ ] "Stuck on" renders 0-4 concept rows with mastery decimal.
- [ ] "Recently" renders 0-3 event rows with relative timestamp +
  label + detail.
- [ ] Empty state (no courses) renders the CTA to `/course-create`.
- [ ] Has-courses-no-data state renders chapters with placeholder
  rollups (e.g. 0% mastery, "No stuck concepts", no recent events).
- [ ] UI tests cover: default load, error, empty, multi-course render,
  CoverageBar integration, all sub-components' empty/full states.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Notes

- Reference the locked Option 1 mock for spacing and visual hierarchy.
- Use editorial primitives (`<RouteHeader>`, `<EmptyState>`,
  `<LoadingState>`, `<ErrorMessage>`).
- `<CoverageBar>` from `feature-concept-maps-top-nav-coverage-bar` is
  the canonical mastery-bar component. Don't duplicate.
- `formatDistanceToNow` exists in the codebase (search for it in date
  helpers); if not, use a simple inline formatter.

## Implementation notes

**Route component**: `packages/ui/src/routes/progress.tsx` — `ProgressRoute` is the top-level component. It uses `useResource` + `client.progress.rollup()` for data loading. Loading, error, and empty (no courses) states all handled with editorial primitives.

**Sub-components** (co-located in the route file):
- `CourseChapter` — per-course `<article>` with chapter header (roman numeral index, title, mastery%) and three-column body
- `YouAreHere` — renders lesson position + next gate; falls back to "No active lesson." when both null
- `StuckOn` — renders 0–N concept rows with name + mastery decimal; falls back to "No stuck concepts."
- `Recently` — renders 0–3 event rows with relative timestamp + formatted label + detail; falls back to "No recent activity."

**CoverageBar integration**: `packages/ui/src/routes/progress.tsx:164–170` — `<CoverageBar compact>` inside `.masteryBar` wrapper div inside the chapter header `masteryRow`.

**CSS module**: `packages/ui/src/routes/progress.module.css` — chapter layout, three-column grid (collapses to 1-col below 640px), all sub-component typography following Option 1 mock conventions.

**Relative-time formatter**: `formatRelativeTime(atMs)` inline helper — today / yesterday / N days ago / N weeks ago; mirrors the pattern from `library.tsx:groupSessionsByAge`.

**Empty-state CTA**: links to `/course-create` via `useNavigate()`.

**fake-client.ts**: Added `progress: { rollup: async () => [] }` default stub.

**Tests**: `packages/ui/src/__tests__/progress-route.test.tsx` — 18 tests covering all states (loading, error, empty, multi-course, roman numerals, mastery%, CoverageBar, YouAreHere full/partial/null, StuckOn full/empty, Recently all three event kinds + empty + timestamp rendering).

**Verification**: `pnpm typecheck && pnpm lint && pnpm test` all green (4750 tests passed, 440 files).

## Out of scope

- Backend service (separate story).
- Concept-level drill-down (post-v1 enhancement).
- Multi-student selector (single-student v1 per VISION.md).
- Time-on-task / engagement metrics (not in the locked Option 1 mock).

## Review (2026-05-23)

**Verdict**: Approve

Faithful Option 1 mock translation. Sub-components (`YouAreHere`,
`StuckOn`, `Recently`) co-located in the route file — appropriate
since they're tightly bound to the chapter shape and unlikely to be
reused. 18 tests cover all sub-component states (full/partial/empty)
and the relative-timestamp formatter. CoverageBar cross-feature dep
resolved cleanly — direct import from
`packages/ui/src/components/coverage-bar.tsx`. Roman numeral indexing
is a small polish touch that matches the editorial typography elsewhere.

**Blockers**: none
**Important**: none
**Nits**: none
