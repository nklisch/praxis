---
id: refactor-useresource-adoption-sweep-step-2-course-tab
kind: story
stage: implementing
tags: [refactor, ui]
parent: refactor-useresource-adoption-sweep
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 2: course-tab — convert Promise.all loader to useResource

## Brief

`packages/ui/src/routes/configure/course-tab.tsx` has one inline
`loadCourse` block (lines ~229-267) that does `Promise.all([units, lessons])`
and stores each result in a separate state. Convert to useResource with a
tuple result.

## Files

- `packages/ui/src/routes/configure/course-tab.tsx` only

## Current state (lines ~229-267)

```ts
const [units, setUnits] = useState<Unit[]>([]);
const [lessons, setLessons] = useState<Lesson[]>([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const loadCourse = useCallback(async () => {
  if (!selectedCourseId) {
    setUnits([]);
    setLessons([]);
    setSelectedLessonId(null);
    setSelectedLesson(null);  // <-- parent-state side effect
    return;
  }
  setLoading(true);
  setError(null);
  try {
    const [fetchedUnits, fetchedLessons] = await Promise.all([
      client.artifacts.units(selectedCourseId),
      client.artifacts.lessons(selectedCourseId),
    ]);
    setUnits(fetchedUnits);
    setLessons(fetchedLessons);
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    setLoading(false);
  }
}, [client, selectedCourseId, setSelectedLesson]);

useEffect(() => { loadCourse(); }, [loadCourse]);
```

## Target state

```ts
const loadCourse = useCallback(async (): Promise<[Unit[], Lesson[]]> => {
  if (!selectedCourseId) return [[], []];
  return Promise.all([
    client.artifacts.units(selectedCourseId),
    client.artifacts.lessons(selectedCourseId),
  ]);
}, [client, selectedCourseId]);

const { data, loading, error, refresh } = useResource(loadCourse);
const [units = [], lessons = []] = data ?? [];

// Parent-state side effect: clear selected lesson when course changes
useEffect(() => {
  setSelectedLessonId(null);
  setSelectedLesson(null);
}, [selectedCourseId, setSelectedLesson]);
```

The parent-state side effect (`setSelectedLesson(null)`) moves into a separate
`useEffect` keyed on `selectedCourseId` — it's a side effect of *changing*
the course, not a side effect of the load itself, so this is structurally
correct.

## Implementation notes

- The early-return branch (`if (!selectedCourseId)`) returns empty arrays
  from the loader instead of mutating state. The destructure default
  (`= []`) handles the pre-load `undefined` data.
- The `setSelectedLessonId(null)` clear ALSO needs to move — it was in the
  same branch. Combine with `setSelectedLesson(null)` in the new effect.
- Verify by reading the file fully: is `loadCourse` called from anywhere
  else besides the mount `useEffect`? If yes, those callers need
  `refresh()` instead.
- Verify there's not a duplicate `useCourses()` hook nearby that already
  wraps useResource — line ~225 shows `const { courses, loading: coursesLoading, error: coursesError } = useCourses();`. That's the COURSES list, separate from this PER-COURSE units+lessons load. They're complementary, not duplicates.

## Tests to verify

- `pnpm --filter @praxis/ui typecheck`
- `pnpm --filter @praxis/ui test` (any course-tab test — grep `__tests__/` for `course-tab`)
- `pnpm biome check packages/ui/src/routes/configure/course-tab.tsx`

Pre-existing baseline: 3 typecheck errors in UI files, ~524 lint errors in `.mockups/**.html`, one flaky test. Treat as baseline.

## Acceptance criteria

- [ ] Typecheck/lint/test green (baseline preserved)
- [ ] Inline `loadCourse` block replaced with `useResource(loadCourse)` + tuple destructure
- [ ] `setSelectedLesson(null)` clear-on-course-change preserved via separate effect
- [ ] No-course-selected state still shows empty units + lessons + no selection
- [ ] File LoC drops by ~15-20

## Risk

**Low-medium** — the parent-state side effect is the only subtle bit. Visual smoke-check that selecting a new course clears the prior selection.

## Rollback

`git revert <commit>` — clean.
