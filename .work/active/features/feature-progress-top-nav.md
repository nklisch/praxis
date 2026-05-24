---
id: feature-progress-top-nav
kind: feature
stage: review
tags: [ui, content]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Progress top-nav surface

## Brief

Build the `/progress` top-nav route as a first-class student-facing summary,
replacing today's placeholder (`packages/ui/src/routes/progress.tsx` has only
a `RouteHeader`). Single-student v1 per `docs/VISION.md` — do not build the
multi-student shell pre-emptively.

The locked mock is **Course-by-Course Review** — each course is a chapter
with three sections in a three-column body: you-are-here (narrative + next
gate), stuck-on (3-4 concepts with mastery scores), recently (3 events:
sessions / gates / grades). Per-course rollup at the head (mastery percent +
micro-bar). Long single column; scales naturally from 1 course to many.

Split from the original `feature-concept-maps-and-progress-routes` aggregator
on 2026-05-23.

## Mockups

- `/progress` surface: `.mockups/screens/feature-concept-maps-and-progress-routes-progress/index.html`
  - **Selected: Option 1 — Course-by-Course Review** (2026-05-23)
  - Considered: Mastery Heatmap (Option 2), Timeline / Week-in-Review
    (Option 3), Three-Pane Digest (Option 4) — in `.../option-{2,3,4}.html`.

Mock path retained as-is; this feature inherits it from the original
aggregator.

## Design decisions (inherited from aggregator --only-questions, 2026-05-23)

- **Data sourcing**: new `ProgressService` aggregator on the backend. A
  single IPC method returns the full `/progress` payload — per-course
  rollup (mastery percent + bar), per-course "you-are-here" (current
  lesson + next gate), per-course "stuck on" (3-4 concepts with mastery),
  per-course "recently" (3 events: sessions / gates / grades). Server
  performs all joins. Mirrors the `RecommendationService` pattern from the
  Workbench.
- **Canonical-match coverage badge — micro-bar standard.** Same shared
  `<CoverageBar>` component as `feature-concept-maps-top-nav` if any
  per-course mastery bar uses the same shape. Both features benefit from
  one source of truth.

## Open for feature-design

- ProgressService payload shape — Drizzle query strategy (recursive CTE
  vs N+1 vs hybrid). Per-course rollup is hot path; profile early.
- Caching strategy for the payload (per-session? per-turn? always live?).
- Empty-state handling: no courses yet, no progress data yet.
- "Stuck on" concept selection algorithm — bottom-N by mastery? lowest
  movers? mix? Resolve at design time, document in the design body.
- "Recently" event scope and ordering — by recency only, or weighted by
  significance (gate clears vs routine sessions).

## Design decisions (feature-design, 2026-05-23, autopilot)

Resolved open questions:

- **Drizzle query strategy: hybrid (parallel `.all()` per signal, merge in JS).**
  Mirrors the `RecommendationService` pattern at
  `packages/core/src/services/recommendation-service.ts:159-385` — five
  collectors in `Promise.all`, no recursive CTEs (none exist in the
  codebase). Per-course aggregation is bounded (most users will have
  <10 courses), so the N+1 cost is negligible relative to the IPC
  round-trip the call saves. If profiling reveals a hot path, revisit
  with covering indexes or a materialized view.
- **Caching strategy: no caching v1.** Live read per page mount. The
  payload is bounded (~10 courses × small per-course shape) and the
  user explicitly navigated to `/progress` to see fresh state. If the
  query proves expensive, add a 30-second debounce on re-fetch (not
  a true cache — just request coalescing for tab-switch noise).
- **"Stuck on" selection algorithm: bottom-3 by mastery, threshold ≤ 0.7.**
  Direct port of the RecommendationService pattern at lines 261-309
  (read all `studentMastery` rows for student+course, filter below
  threshold, sort by `(threshold - mastery)`, take top 3). Future
  "haven't moved in N days" enhancement is a separate story when the
  user signals the heuristic isn't enough.
- **"Recently" event ordering: pure recency, no weighting.** Top 3
  events by `ts DESC` across sessions, gate-unlocks, and grades for
  the student+course. Mixing event kinds via `UNION ALL` + ORDER BY,
  or three separate `.all(limit=3)` calls merged in JS — pick at
  implementation time based on which reads cleaner with Drizzle's
  builder.
- **CoverageBar reuse — yes, via cross-feature dep.** The per-course
  mastery bar uses the same visual primitive as the concept-maps
  Option-2 micro-bar. Consume the `<CoverageBar>` component from
  `feature-concept-maps-top-nav-coverage-bar` (cross-feature
  `depends_on` on the route story; routine in the substrate).
- **Empty states.** No courses → `<EmptyState>` "Start a course to
  see progress" + `/course-create` CTA. Has courses but no mastery
  data yet → "Your progress will appear as you work" (still render
  the course chapters but with placeholder rollups).
- **VISION alignment — single student.** No "select student" selector
  in v1. The route reads the default student id (same pattern as
  `getStudentId(services)` used by RecommendationService's IPC
  handler).

## Architectural choice

**2 stories**: a backend `ProgressService` aggregator (interface, impl,
IPC, client), and the `/progress` route UI consuming it. Cross-feature
dep on `feature-concept-maps-top-nav-coverage-bar` for the per-course
mastery visualization.

Sequencing:
- Wave 1 (independent): `feature-progress-top-nav-service`.
- Wave 2: `feature-progress-top-nav-route` depends on the service
  story AND on `feature-concept-maps-top-nav-coverage-bar` (for the
  primitive).

## Implementation Units

### Unit 1: ProgressService aggregator

**File**: `packages/core/src/types/progress.ts` (new)
+ `packages/core/src/services/progress-service.ts` (new)
+ `packages/desktop/electron/main/progress-channel.ts` (new)
+ `packages/client/src/services/progress-client.ts` (new)
+ `packages/desktop/electron/main/services.ts` (wire deps)
**Story**: `feature-progress-top-nav-service`

#### Type contract

```typescript
// packages/core/src/types/progress.ts
export interface CourseProgressRollup {
  courseId: CourseId;
  courseTitle: string;
  masteryPercent: number;          // 0..1; mean across all concepts in course
  currentLesson: {
    id: LessonId;
    title: string;
    index: number;                  // 1-based index in lesson sequence
    total: number;                  // total lessons in course
  } | null;
  activeGate: {
    id: GateId;
    title: string;
    lockReason: string;
    progress: number;               // 0..1
  } | null;
  stuckConcepts: Array<{
    conceptId: ConceptId;
    name: string;
    mastery: number;                // 0..1
  }>;
  recentEvents: Array<{
    kind: "session" | "gate" | "grade";
    at: Timestamp;
    label: string;                  // user-visible primary line
    detail: string;                 // user-visible secondary line
  }>;
}

export interface ProgressService {
  rollup(input: { studentId: StudentId }): Promise<CourseProgressRollup[]>;
}
```

Single method; returns all courses. Per-course detail rendered as the
UI's chapter shape. v1 single-student per VISION.md.

#### Implementation

Mirror `RecommendationServiceImpl`:

```typescript
export class ProgressServiceImpl implements ProgressService {
  constructor(private readonly deps: ProgressServiceDeps) {}

  async rollup({ studentId }: { studentId: StudentId }): Promise<CourseProgressRollup[]> {
    // 1. List the student's courses
    const courses = await this.deps.db.select().from(courses).all();

    // 2. For each course, collect in parallel:
    const rollups = await Promise.all(courses.map(async (course) => {
      const [snapshot, mastery, recent] = await Promise.all([
        this.deps.artifacts.read({ studentId, courseId: course.id }),       // CourseStateSnapshot
        this.collectStuck(studentId, course.id),                             // bottom-3 by mastery
        this.collectRecent(studentId, course.id),                            // top-3 by ts
      ]);

      const masteryPercent = this.computeRollupMastery(snapshot.conceptsByLesson);

      return {
        courseId: course.id,
        courseTitle: course.title,
        masteryPercent,
        currentLesson: snapshot.currentLesson
          ? { id: snapshot.currentLesson.id, title: snapshot.currentLesson.title,
              index: snapshot.currentLesson.orderIndex, total: snapshot.lessons.length }
          : null,
        activeGate: snapshot.activeGate
          ? { id: snapshot.activeGate.id, title: snapshot.activeGate.title,
              lockReason: snapshot.activeGate.lockReason, progress: snapshot.activeGate.progress }
          : null,
        stuckConcepts: mastery,
        recentEvents: recent,
      };
    }));

    return rollups;
  }

  // Reuse the pattern from RecommendationServiceImpl lines 261-309
  private async collectStuck(...) { ... }

  // Three .all(limit=3) calls (sessions, gateUnlocks, grades), merge + sort by ts desc, take 3
  private async collectRecent(...) { ... }
}
```

#### IPC channel

```typescript
// packages/desktop/electron/main/progress-channel.ts
export function registerProgressHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);
  handle("praxis.progress.rollup", withSchema(z.object({}), async () => {
    const studentId = getStudentId(services);
    return services.progress.rollup({ studentId });
  }));
}
```

Pattern mirrors `recommendations-channel.ts` exactly. Single channel,
no input (student id resolved server-side).

#### Client

```typescript
// packages/client/src/services/progress-client.ts
export class ProgressClient implements ProgressClient {
  async rollup(): Promise<CourseProgressRollup[]> {
    const result = await this.transport.invoke<IpcEnvelope<CourseProgressRollup[]>>(
      "praxis.progress.rollup",
      {},
    );
    return unwrapEnvelope(result);
  }
}
```

#### Acceptance criteria

- [ ] `ProgressService.rollup({ studentId })` returns one
  `CourseProgressRollup` per course the student has access to.
- [ ] Each rollup includes mastery percent, current lesson, active gate
  (or null), bottom-3 stuck concepts, top-3 recent events.
- [ ] Stuck concept selection uses bottom-3 by `effectivePKnown`,
  threshold ≤ 0.7.
- [ ] Recent events span sessions / gate-unlocks / grades, ordered by
  ts desc, capped at 3.
- [ ] Empty data shapes are handled: no concepts → empty
  `stuckConcepts`; no lesson progress → null `currentLesson`;
  no gates → null `activeGate`; no events → empty `recentEvents`.
- [ ] IPC channel `praxis.progress.rollup` wraps response in envelope.
- [ ] `ProgressClient.rollup()` unwraps cleanly.
- [ ] `ServiceDeps` + `Services` extended; `buildServices` wires
  `ProgressServiceImpl` correctly.
- [ ] Unit tests cover: empty courses, single course with full data,
  multiple courses, stuck-concept selection (threshold + bottom-3),
  recent-events ordering across kinds.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

### Unit 2: /progress top-nav route (Course-by-Course Review)

**File**: `packages/ui/src/routes/progress.tsx` (replace placeholder)
+ `packages/ui/src/routes/progress.module.css` (new)
**Story**: `feature-progress-top-nav-route`
**Depends on**: `feature-progress-top-nav-service`,
`feature-concept-maps-top-nav-coverage-bar` (cross-feature)

#### Layout (Option 1: Course-by-Course Review)

Per the locked mock at
`.mockups/screens/feature-concept-maps-and-progress-routes-progress/index.html`:

- `<RouteHeader title="Progress" />`
- Long single column; each course is a chapter:
  - Course header row: title + mastery percent + `<CoverageBar
    compact percent={masteryPercent} />`
  - Three-column body:
    - **You are here**: "Working on *{lessonTitle}* — lesson
      {index} of {total}" + next gate ("Next gate: *{gateTitle}*
      — {lockReason}")
    - **Stuck on**: list of 3-4 concepts with mastery as decimal
      (`0.41`)
    - **Recently**: 3 events with relative timestamp +
      label + detail

#### Data loading

```typescript
export function ProgressRoute(): JSX.Element {
  const client = usePraxisClient();
  const loader = useCallback(() => client.progress.rollup(), [client]);
  const { data: rollups, loading, error } = useResource(loader);

  if (loading) return <LoadingState />;
  if (error) return <ErrorMessage error={error} />;
  if (!rollups || rollups.length === 0) {
    return <EmptyState message="Start a course to see progress" cta={{ to: "/course-create", label: "Start a course" }} />;
  }

  return (
    <>
      <RouteHeader title="Progress" />
      {rollups.map((rollup) => <CourseChapter key={rollup.courseId} rollup={rollup} />)}
    </>
  );
}
```

#### CourseChapter sub-component

```typescript
function CourseChapter({ rollup }: { rollup: CourseProgressRollup }): JSX.Element {
  return (
    <section className={styles.chapter}>
      <header className={styles.chapterHeader}>
        <h2>{rollup.courseTitle}</h2>
        <div className={styles.masteryRow}>
          <span>{Math.round(100 * rollup.masteryPercent)}%</span>
          <CoverageBar compact percent={rollup.masteryPercent} />
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

#### Acceptance criteria

- [ ] Route mounts at `/progress` and renders one chapter per course.
- [ ] Each chapter shows mastery % + CoverageBar in the header.
- [ ] "You are here" renders current lesson + next gate (or placeholder
  text when null).
- [ ] "Stuck on" renders 0-4 concept rows with mastery decimal.
- [ ] "Recently" renders 0-3 event rows with relative timestamp +
  label + detail.
- [ ] Empty state for no courses renders the CTA.
- [ ] Has-courses-no-data state renders chapters with placeholder
  rollups.
- [ ] UI tests cover: default load, empty state, partial-data state,
  CoverageBar integration.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Order

1. Wave 1 (independent): service
2. Wave 2: route (depends on service + cross-feature coverage-bar)

## Testing

- Backend: `progress-service.test.ts` — empty data, single course,
  multi-course, stuck-concept selection, recent-events ordering.
- UI: `progress-route.test.tsx` — loading, error, empty, chapters
  render, CoverageBar integration.

## Risks

- **Cross-feature dep on coverage-bar.** The orchestrator's
  `depends_on` graph supports cross-feature edges; the dep just needs
  to be at `done` (or `review` per autopilot's contract) before the
  route story runs. If the concept-maps feature stalls, the route
  story can either copy a local CoverageBar (technical debt) or
  block until concept-maps lands. Prefer the latter — the primitive
  is intentional.
- **Per-course rollup performance.** N parallel reads per course on
  every page mount. At expected scale (<10 courses) this is fine.
  Profile if it ever exceeds 500ms; cache only if needed.
- **Stuck-concept selection edge cases.** A student with zero practice
  has no `studentMastery` rows; the route should render an empty
  `stuckConcepts` list cleanly (no error). Validated by the empty-
  data test.

## Children complete (orchestrator, 2026-05-23)

All 2 child stories landed and advanced to `stage: review`:

- `feature-progress-top-nav-service` — `ProgressService.rollup` ships
  the per-course aggregator; new IPC `praxis.progress.rollup`;
  `ProgressClient`; 19 unit tests covering empty / single-course /
  multi-course / stuck-concept selection / recent-events ordering.
  Commit `33861bc`.
- `feature-progress-top-nav-route` — `/progress` Course-by-Course
  Review surface implemented; consumes the cross-feature `<CoverageBar>`
  for per-course mastery; 18 UI tests covering all sub-component
  states and the relative-timestamp formatter. Commit `5caa451`.

Integration verification: `pnpm typecheck` clean; 4750 tests passing.

Cross-feature dep on `feature-concept-maps-top-nav-coverage-bar` (now at
review) resolved cleanly — the progress route imports `<CoverageBar>`
directly from `packages/ui/src/components/coverage-bar.tsx`.

Feature advancing `implementing → review` for final pass.
