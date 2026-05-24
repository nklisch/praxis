---
id: feature-concept-maps-top-nav
kind: feature
stage: implementing
tags: [ui, content]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Concept-maps top-nav surface

## Brief

Build the `/concept-maps` top-nav route as a first-class cross-course concept-map
browser, replacing today's placeholder (`packages/ui/src/routes/concept-maps.tsx`
has only a `RouteHeader`). This is the cross-course aggregator — the per-course
list at `/courses/$courseId/concept-maps` already exists via
`concept-maps-list.tsx`.

The locked mock is **Swiss Grid Catalog** — flat sortable 2-col card grid with
per-card coverage micro-bar as the primary signal, filter pills by course at
the top, sort tabs (recent / coverage / course) on the right.

Split from the original `feature-concept-maps-and-progress-routes` aggregator
on 2026-05-23 — the two surfaces had different data sources and different
visual shapes; shipping on independent cadences.

## Mockups

- `/concept-maps` index: `.mockups/screens/feature-concept-maps-and-progress-routes-concept-maps/index.html`
  - **Selected: Option 2 — Swiss Grid Catalog** (2026-05-23)
  - Considered: Editorial TOC (Option 1), Atlas / Visual Index (Option 3),
    Hub + Recent (Option 4) — in `.../option-{1,3,4}.html`.

Mock path retained as-is; this feature inherits it from the original
aggregator.

## Design decisions (inherited from aggregator --only-questions, 2026-05-23)

- **Data model**: extend `client.conceptMaps.list` to accept an optional
  `courseId` plus filter / sort options matching the mock affordances
  (filter by `courseId`, sort by recent / coverage / course). When
  `courseId` is omitted, returns all maps across courses. Server-side
  filtering and ordering — UI does not fan out. The course-scoped variant
  at `/courses/$courseId/concept-maps` continues to work via the same
  method.
- **Canonical-match coverage badge — micro-bar standard.** The locked
  Option 2 mock's per-card micro-bar becomes the canonical coverage
  visualization across all surfaces. Implementation scope includes
  introducing a shared `<CoverageBar>` component in
  `packages/ui/src/components/` and updating `course-detail.tsx` (and any
  other places the legacy affordance appears) to consume it. One source of
  truth.

## Open for feature-design

- Coverage micro-bar component location and exact spec (size, color tokens,
  states).
- Filter/sort URL params on `/concept-maps` for bookmarkability (e.g.
  `?course=algebra&sort=coverage`).
- Empty-state handling: no courses yet, no concept maps yet.
- Whether the cross-course list query is a single DB call with optional
  WHERE or a separate code path; pick what's cleaner in the Drizzle layer.
- IPC channel scope: existing `client.conceptMaps.list` extension vs a
  new method. Recommend extending existing for SSOT.

## Design decisions (feature-design, 2026-05-23, autopilot)

Resolved open questions:

- **Coverage micro-bar — generic primitive, caller-formatted label.**
  `<CoverageBar>` is a thin visual primitive: takes `percent: number`
  (0..1) and `compact?: boolean`. Renders a horizontal bar (height 4px
  in default mode, height 3px in compact) with `--color-accent` fill on
  `--color-bg-tertiary` background. Caller renders any label adjacent.
  Rationale: enables reuse by `feature-progress-top-nav` (per-course
  mastery bar uses identical visual but different semantic data).
- **URL params for filter/sort — yes, both.** Bookmarkable contract is
  `/concept-maps?course=<courseId>&sort=<recent|coverage|course>`.
  TanStack Router's `validateSearch` with zod schema. Default values
  (no `course`, `sort=recent`) match the catalog landing.
- **Empty states.** Two empty cases: no courses (yet) → "Start a course
  to build concept maps" CTA → `/course-create`. Has courses but no
  maps → "Open a course-detail to build your first map" with course
  list links.
- **Cross-course list query.** Extend existing `ConceptMapService.list`
  to accept `courseId?: CourseId`. When omitted, drop the
  `eq(courseId, ...)` from the WHERE clause. Single code path; one
  Drizzle query. The order-by becomes runtime-configurable
  (`recent → desc(updatedAt)`, `course → courseTitle then desc(updatedAt)`,
  `coverage → server computes` — see next).
- **Coverage in summary — server-computed.** Current
  `ConceptMapSummary` doesn't include coverage data; UI would have to
  fetch each map separately (N+1). Extend the summary type to include
  `{ linkedNodeCount: number; totalNodeCount: number }`. The service's
  list query joins or post-processes: for each map row, count
  `linkState === "linked"` entries in `conceptLinks` and total text
  nodes in `scene`. Performance is fine at expected scale (~10s of
  maps per student). If coverage sort is requested, the service sorts
  by `(linkedNodeCount / totalNodeCount)` after enrichment.

## Architectural choice

**3 stories**: a backend extension (list + coverage in summary), a
design-system primitive (CoverageBar + course-detail.tsx adoption), and
the actual route UI (Swiss Grid Catalog implementation).

Sequencing:
- Wave 1 (parallel, disjoint files):
  `feature-concept-maps-top-nav-list-extension` and
  `feature-concept-maps-top-nav-coverage-bar`.
- Wave 2: `feature-concept-maps-top-nav-route` depends on both wave-1
  stories (consumes the extended list API and the CoverageBar primitive).

## Implementation Units

### Unit 1: Extend ConceptMapService.list + IPC + client (cross-course + coverage)

**File**: `packages/core/src/services/concept-map-service.ts:148-188`
+ `packages/core/src/types/artifacts.ts` (ConceptMapSummary type)
+ `packages/desktop/electron/main/concept-maps-channel.ts:62-76`
+ `packages/client/src/services/concept-map-client.ts:44-49`
**Story**: `feature-concept-maps-top-nav-list-extension`

#### Type changes

```typescript
// packages/core/src/types/artifacts.ts
export interface ConceptMapSummary {
  // existing fields ...
  /** Count of conceptLinks with linkState === "linked" */
  linkedNodeCount: number;
  /** Count of text nodes in the scene (denominator for coverage %) */
  totalNodeCount: number;
}
```

#### Service signature

```typescript
async list(input: {
  studentId: StudentId;
  courseId?: CourseId;     // NEW: optional; omit = all courses
  sort?: "recent" | "coverage" | "course";  // NEW: default "recent"
}): Promise<ConceptMapSummary[]>
```

#### Query shape

```typescript
const base = this.deps.db.select().from(conceptMaps);
const filtered = input.courseId
  ? base.where(and(eq(conceptMaps.studentId, input.studentId),
                   eq(conceptMaps.courseId, input.courseId)))
  : base.where(eq(conceptMaps.studentId, input.studentId));

const rows = await filtered.orderBy(desc(conceptMaps.updatedAt)).all();

// Enrich each row with coverage counts
const enriched = rows.map((row) => {
  const drawing = parseConceptMapDrawing(row.drawingJson);
  const totalNodeCount = drawing.scene.shapes.filter(isTextNode).length;
  const linkedNodeCount = drawing.conceptLinks.filter(l => l.linkState === "linked").length;
  return { ...summaryFromRow(row), linkedNodeCount, totalNodeCount };
});

// Apply sort
return applySort(enriched, input.sort ?? "recent");
```

#### IPC schema

```typescript
// concept-maps-channel.ts
const listInputSchema = z.object({
  courseId: z.string().optional(),
  sort: z.enum(["recent", "coverage", "course"]).optional(),
});
```

#### Acceptance criteria

- [ ] `ConceptMapService.list({ studentId })` returns all maps across courses.
- [ ] `ConceptMapService.list({ studentId, courseId })` returns only that course's maps (existing behavior preserved).
- [ ] Each summary includes `linkedNodeCount` + `totalNodeCount`.
- [ ] Sort modes: `recent` (default — desc updatedAt), `coverage` (desc by linkedNodeCount/totalNodeCount), `course` (by courseTitle asc, then desc updatedAt).
- [ ] Existing test "lists maps for a (student, course), ordered by updatedAt descending" still passes.
- [ ] New tests cover cross-course list + each sort mode + summary enrichment shape.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

### Unit 2: CoverageBar primitive + course-detail.tsx adoption

**File**: `packages/ui/src/components/coverage-bar.tsx` (new)
+ `packages/ui/src/components/coverage-bar.module.css` (new)
+ `packages/ui/src/routes/course-detail.tsx:233-277` (replace existing affordance)
**Story**: `feature-concept-maps-top-nav-coverage-bar`

#### Component signature

```typescript
interface CoverageBarProps {
  /** 0..1; values outside this range are clamped */
  percent: number;
  /** compact mode: 3px height (default 4px) */
  compact?: boolean;
  /** optional aria-label; default "Coverage: N%" */
  ariaLabel?: string;
}
export function CoverageBar({ percent, compact, ariaLabel }: CoverageBarProps): JSX.Element;
```

#### CSS contract (matches Option 2 mockup)

```css
.coverageBar {
  flex: 1;
  height: 4px;
  background: var(--color-bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
}
.coverageBar--compact { height: 3px; }
.coverageBarFill {
  height: 100%;
  background: var(--color-accent);
  transition: width var(--dur-2) var(--ease-standard);
}
```

#### course-detail.tsx replacement

The existing concept-maps section (lines 233-277) lists maps with
versions + divergence badge but NO COVERAGE BAR today. Update to render
a `<CoverageBar percent={linkedCount/totalCount} compact />` plus the
"X / Y · Z% mapped" label per the canonical pattern from Option 2 mock.

#### Acceptance criteria

- [ ] `<CoverageBar percent={0.58} />` renders a bar at 58% width.
- [ ] `<CoverageBar percent={0} />` renders an empty bar (no fill).
- [ ] `<CoverageBar percent={1} />` renders a fully-filled bar.
- [ ] Values <0 or >1 are clamped.
- [ ] `compact` prop reduces height to 3px.
- [ ] `course-detail.tsx` concept-maps section renders CoverageBar + label for each map.
- [ ] Unit tests cover all CoverageBar prop shapes.
- [ ] Updated course-detail test (or new test) verifies coverage label format.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

### Unit 3: /concept-maps top-nav route (Swiss Grid Catalog)

**File**: `packages/ui/src/routes/concept-maps.tsx` (replace placeholder)
+ `packages/ui/src/routes/concept-maps.module.css` (new)
+ `packages/ui/src/router.tsx` (validateSearch on /concept-maps route)
**Story**: `feature-concept-maps-top-nav-route`
**Depends on**: `feature-concept-maps-top-nav-list-extension`, `feature-concept-maps-top-nav-coverage-bar`

#### Layout (Option 2: Swiss Grid Catalog)

- Top: filter pills (All / per-course). Right: sort tabs (recent /
  coverage / course).
- Body: flat 2-column card grid. Each card: title, course label, version
  count, last-updated, coverage micro-bar + "X / Y · Z% mapped" label.
- Card click: navigate to
  `/courses/$courseId/concept-maps/$conceptMapId`.

#### URL contract

```typescript
// router.tsx — conceptMapsRoute
validateSearch: z.object({
  course: z.string().optional(),
  sort: z.enum(["recent", "coverage", "course"]).optional(),
})
```

The route reads search params via `useSearch`, threads `courseId` (if
present) + `sort` into `client.conceptMaps.list(...)`. Filter pills /
sort tabs update the search params via `navigate({ search: ... })`.

#### Data loading

```typescript
const { course, sort } = useSearch({ from: conceptMapsRoute.id });
const loader = useCallback(
  () => client.conceptMaps.list({
    ...(course !== undefined && { courseId: course as CourseId }),
    sort: sort ?? "recent",
  }),
  [client, course, sort],
);
const { data, loading, error } = useResource(loader);
```

#### Filter pills

The "All courses" pill is the default. Per-course pills derived from
`client.courses.list()` (separate resource fetched in parallel). Click
sets `?course=<id>`; "All" clears the param.

#### Empty states

- No courses at all → `<EmptyState>` with "Start a course to build
  concept maps" + `/course-create` CTA.
- Has courses, no maps → `<EmptyState>` "Open a course to build your
  first map" with course list.

#### Acceptance criteria

- [ ] Route mounts at `/concept-maps` and lists maps across all courses by default.
- [ ] Filter pills update `?course=<id>` and the list re-filters.
- [ ] Sort tabs update `?sort=<mode>` and the list re-orders.
- [ ] Each card renders title, course, versions, coverage bar + label.
- [ ] Card click navigates to per-map detail.
- [ ] Empty states render appropriately.
- [ ] Bookmarkable URL works: opening `/concept-maps?course=algebra-1&sort=coverage` lands in the right state.
- [ ] UI tests cover: default load, filter pill click, sort tab click, URL param load, empty states.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Order

1. Wave 1 (parallel): list-extension + coverage-bar
2. Wave 2: route (consumes both)

## Testing

- Backend: `concept-map-service.test.ts` — cross-course list, each sort
  mode, summary enrichment.
- UI: `coverage-bar.test.tsx`, `concept-maps-route.test.tsx`,
  updated `course-detail.test.tsx`.

## Risks

- **Coverage computation cost** — parsing `drawingJson` for each map on
  every list call. At expected scale (~10s of maps per student) this is
  fine. If it ever becomes hot, cache the counts in DB columns on map
  write.
- **Cross-course pack-coverage variance** — packs may have very few
  canonical concepts; coverage might trend toward 100% trivially. Not
  a design issue — the bar reflects reality. If users complain, revisit
  what "linked" means for pack-derived maps.
