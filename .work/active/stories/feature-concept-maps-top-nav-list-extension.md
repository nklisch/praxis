---
id: feature-concept-maps-top-nav-list-extension
kind: story
stage: implementing
tags: [core, content, ipc]
parent: feature-concept-maps-top-nav
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Extend ConceptMapService.list (cross-course + coverage + sort)

## Brief

Per the parent feature's Unit 1, extend `ConceptMapService.list` to
accept an optional `courseId` (omitting it returns maps across all
courses for the student), add a `sort` parameter (`recent` /
`coverage` / `course`), and enrich each `ConceptMapSummary` with
`linkedNodeCount` + `totalNodeCount` so the UI can render the coverage
micro-bar without an N+1 fetch.

## Scope

### Type change

In `packages/core/src/types/artifacts.ts`, extend `ConceptMapSummary`:

```typescript
export interface ConceptMapSummary {
  // existing fields ...
  /** Count of conceptLinks with linkState === "linked" */
  linkedNodeCount: number;
  /** Count of text nodes in the scene (denominator for coverage %) */
  totalNodeCount: number;
}
```

### Service signature change

In `packages/core/src/services/concept-map-service.ts:148-188`:

```typescript
async list(input: {
  studentId: StudentId;
  courseId?: CourseId;
  sort?: "recent" | "coverage" | "course";
}): Promise<ConceptMapSummary[]>
```

### Implementation

1. Drop the hard `eq(courseId, ...)` from the WHERE when `courseId` is
   undefined; keep `eq(studentId, ...)`.
2. Enrich each row with `linkedNodeCount` (count `conceptLinks` with
   `linkState === "linked"`) and `totalNodeCount` (count text-bearing
   shapes in the scene). Reuse the existing drawing parser.
3. Apply sort post-enrichment:
   - `recent` (default) — `desc(updatedAt)`
   - `coverage` — desc by `(linkedNodeCount / totalNodeCount)`; ties
     break on `desc(updatedAt)`. Maps with `totalNodeCount === 0` sort
     last.
   - `course` — asc by `courseTitle`, then `desc(updatedAt)`. Course
     title comes from a join or a separate lookup.

### IPC channel

In `packages/desktop/electron/main/concept-maps-channel.ts:62-76`,
update the zod schema:

```typescript
const listInputSchema = z.object({
  courseId: z.string().optional(),
  sort: z.enum(["recent", "coverage", "course"]).optional(),
});
```

### Client method

In `packages/client/src/services/concept-map-client.ts:44-49`:

```typescript
async list(input?: {
  courseId?: CourseId;
  sort?: "recent" | "coverage" | "course";
}): Promise<ConceptMapSummary[]>
```

Note the input itself becomes optional (so `client.conceptMaps.list()`
works for "all maps, default sort").

## Acceptance Criteria

- [ ] `ConceptMapService.list({ studentId })` returns all maps across courses.
- [ ] `ConceptMapService.list({ studentId, courseId })` returns only that course's maps (existing behavior preserved).
- [ ] Each summary includes `linkedNodeCount` + `totalNodeCount`.
- [ ] Sort modes work: `recent`, `coverage`, `course`.
- [ ] Existing test "lists maps for a (student, course), ordered by updatedAt descending" still passes (default sort = recent).
- [ ] New tests cover: cross-course list, each sort mode, summary enrichment.
- [ ] IPC + client updated to match.
- [ ] Existing callers (per-course `concept-maps-list.tsx`) still work without code changes.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope

- CoverageBar component (separate story).
- `/concept-maps` route UI (separate story).
- Server-side caching of coverage counts (deferred to performance work
  if needed).
