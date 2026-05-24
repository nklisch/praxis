---
id: feature-progress-top-nav-service
kind: story
stage: implementing
tags: [core, content, ipc]
parent: feature-progress-top-nav
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# ProgressService aggregator

## Brief

Per the parent feature's Unit 1, ship `ProgressService.rollup` as a
single-payload aggregator that returns per-course progress data for
the student. Mirrors `RecommendationService` shape (parallel collectors,
no caching). One IPC call powers the `/progress` route.

## Scope

### Type contract

In `packages/core/src/types/progress.ts` (new):

```typescript
export interface CourseProgressRollup {
  courseId: CourseId;
  courseTitle: string;
  masteryPercent: number;          // 0..1; mean across all concepts in course
  currentLesson: {
    id: LessonId;
    title: string;
    index: number;                  // 1-based
    total: number;
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
    label: string;
    detail: string;
  }>;
}

export interface ProgressService {
  rollup(input: { studentId: StudentId }): Promise<CourseProgressRollup[]>;
}
```

### Service implementation

In `packages/core/src/services/progress-service.ts` (new), mirror the
`RecommendationServiceImpl` aggregator shape:

- Read all courses for the student.
- For each course, gather in parallel:
  - `CourseStateSnapshot` via `artifacts.read({ studentId, courseId })`
    — provides currentLesson + activeGate.
  - Bottom-3 stuck concepts (port logic from
    `recommendation-service.ts:261-309`).
  - Top-3 recent events (sessions / gateUnlockEvents / grades),
    ordered by `ts DESC`, capped at 3 total across kinds. Mix via
    `UNION ALL` or three separate `.all(limit=3)` calls merged in JS
    — pick whichever reads cleaner.
- Compute mastery percent from the snapshot's
  `conceptsByLesson` (mean of `effectivePKnown` across all concepts
  in the course).

### IPC channel

In `packages/desktop/electron/main/progress-channel.ts` (new):

```typescript
export function registerProgressHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);
  handle("praxis.progress.rollup", withSchema(z.object({}), async () => {
    const studentId = getStudentId(services);
    return services.progress.rollup({ studentId });
  }));
}
```

Wire into `ipc-server.ts`.

### Client

In `packages/client/src/services/progress-client.ts` (new):

```typescript
export class ProgressClient {
  constructor(private readonly transport: ClientTransport) {}
  async rollup(): Promise<CourseProgressRollup[]> {
    const result = await this.transport.invoke<IpcEnvelope<CourseProgressRollup[]>>(
      "praxis.progress.rollup",
      {},
    );
    return unwrapEnvelope(result);
  }
}
```

Add to `PraxisClient` type as `progress: ProgressClient`.

### ServiceDeps wiring

- Add `progress: ProgressService` to `ServiceDeps` and `Services`.
- Construct `ProgressServiceImpl` in `buildServices` after
  `artifactsService` and `memoryService`.
- Register the IPC channel.

## Acceptance Criteria

- [ ] `ProgressService.rollup({ studentId })` returns one
  `CourseProgressRollup` per course the student has access to.
- [ ] Each rollup includes mastery %, current lesson, active gate
  (or null), bottom-3 stuck concepts, top-3 recent events.
- [ ] Stuck concept selection: bottom-3 by mastery, threshold ≤ 0.7
  (same as RecommendationService).
- [ ] Recent events span sessions / gate-unlocks / grades, sorted by
  ts desc, capped at 3 total.
- [ ] Empty data handled: no concepts → empty `stuckConcepts`;
  no lesson progress → null `currentLesson`; no gates → null
  `activeGate`; no events → empty `recentEvents`.
- [ ] IPC channel `praxis.progress.rollup` wraps response in envelope.
- [ ] `ProgressClient.rollup()` unwraps cleanly.
- [ ] `ServiceDeps` + `Services` extended; `buildServices` wiring
  correct.
- [ ] Unit tests cover: empty courses, single course with full data,
  multiple courses, stuck-concept threshold + bottom-3, recent-events
  ordering across kinds.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Notes

- The patterns to mirror live at
  `packages/core/src/services/recommendation-service.ts:159-385` and
  `packages/desktop/electron/main/recommendations-channel.ts:1-40`.
- Mastery percent computation: read the snapshot's
  `conceptsByLesson` Map, flatten to concept rows, compute mean
  `effectivePKnown`. If empty, return 0.
- For recent events: three separate `.all(limit: 3)` calls + JS merge
  is simpler than `UNION ALL`; Drizzle's `UNION` support is awkward.
  The JS merge approach is well-trodden in `RecommendationServiceImpl`.

## Out of scope

- /progress route UI (separate story).
- Caching (none in v1; see parent feature decision).
- Multi-student support (single-student per VISION.md).
