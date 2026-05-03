# Design: Phase 16 — Modalities Per Mode + Tutor-Driven Assessment Loop

> Naming note: an earlier design also used the `phase-16-` prefix
> (`phase-16-bootstrap-explorer.md`) for the explorer rewrite that already
> shipped. That work is logically a Phase 15-tier infrastructure piece; the
> roadmap's actual Phase 16 ("Modalities per mode") is the subject of this
> document. The two files coexist; readers should treat
> `phase-16-bootstrap-explorer.md` as the historical record of the explorer
> ship and **this** doc as the canonical Phase 16.

## Overview

This design wraps three intertwined chunks of work into one phase:

1. **Modalities per mode** (the roadmap's Phase 16) — give quiz, homework, and
   exam their own embodied UI shape inside a tab. The assignment becomes the
   primary surface; the tutor agent slides in from the side as a clarifier,
   never as the main column. Teach mode keeps today's chat-as-primary shape.
2. **Tutor-driven assessment loop** — let the teach-mode tutor author quizzes,
   homework, and exams *during a session*, automatically spawn a tab in the
   right modality, and have submissions flow back into the tutor's
   conversation as a synthetic turn so the tutor narrates feedback and
   continues the lesson without the user having to re-bridge anything.
3. **Course-level assessment scaffold** — extend the bootstrap explorer to
   plan units, midterms, finals, per-lesson homework, and quiz placements as
   part of the proposed course, so a course is no longer a flat list of
   lessons. Course size becomes adaptive to material density: short
   monographs produce modest courses, dense textbooks produce substantive
   ones.

These ship together because they share a single mental model: **assessments
are first-class course structure**, authored either at bootstrap time
(scaffold) or mid-session (live tutor authoring), surfaced in dedicated
modal UIs, and round-tripped to the tutor when the student completes them.

### Why now

- Phase 8 already shipped the assignment data model, per-criterion 0-10
  rubric grading, `assignment.create` / `assignment.show` /
  `assignment.read_grade` tools, and an inline `<AssignmentCard>` component.
  But the teach-mode tutor never actually exercises this surface during real
  sessions — the prompt nudges nothing about authoring, the UI inlines the
  card so it competes with chat for primary attention, and there is no
  back-channel from a student's quiz tab to the tutor's session.
- Phase 14 shipped multi-mode parallel tabs, but each tab is an island. The
  `sessions` table has no `parentSessionId`; `tabs.open()` has no parent
  parameter. A submission in a quiz tab grades to the DB and dies there.
- The Phase 16 bootstrap explorer (already shipped) produces a
  `ProposedCourse` with concepts, edges, and lessons — but **no**
  assessments, **no** units, and a hard cap of ~50 concepts that produces
  notably small courses (a 12-chapter algebra book yields a 10-lesson plan
  with no exams).
- The roadmap's Phase 16 already specifies the per-mode UI shapes; this
  design treats that spec as load-bearing and wires the assessment loop
  through the same scaffolding so we ship one coherent slice rather than
  two half-features.

### What's in scope

1. **Schema**: `sessions.parent_session_id`, `sessions.parent_call_id`,
   `assignments.parent_session_id`, `course_units` table,
   `lesson_assessments` join table, `assessment_plan_json` on the course
   row.
2. **Domain types**: `ProposedUnit`, `ProposedAssessment`, `AssessmentPlan`,
   `Unit`. `ProposedCourse.proposedUnits`, `ProposedCourse.assessmentPlan`.
3. **Engine event variant**: add `system_note` to the `EngineEvent` union so
   submission notifications can append to a session's conversation without
   colliding with user messages or tool results.
4. **SessionService**: `spawnFromAssignment(parentSessionId, assignmentId,
   parentCallId)` → opens child session in correct mode + opens tab + posts
   activity rail entry. Used by the `assignment.create` tool's UI-side
   wrapper.
5. **AssignmentService.submit()** extension: on submission, if the
   assignment carries a `parentSessionId`, append a `system_note` event to
   the parent's episodic stream summarising the submission and the grade.
   If the parent session is currently active in memory (i.e. the user has
   it open and there's a live `EngineSession`), drive a synthetic turn so
   the tutor narrates feedback live; otherwise the note sits in the
   transcript and the next real turn picks it up via
   `loadConversationHistory`.
6. **assignment.create tool**: extended to capture the calling
   `sessionId` and `callId` into the new `assignments.parent_session_id` /
   `parent_call_id` columns. Emits an activity rail entry (`assignment
   issued`).
7. **Client-side spawn**: the renderer subscribes to assignment-issued
   activity events and auto-opens a tab in the assignment's modality (quiz
   / homework / exam) as a child of the tutor tab.
8. **Per-mode tab body components**: `QuizTabBody`, `HomeworkTabBody`,
   `ExamTabBody`, `BootstrapTabBody` (canvas+outline), plus dispatch in
   `<ChatTabBody>` so each tab renders the right modality based on
   `session.modeId`. Teach is unchanged.
9. **`SidekickPanel`**: a slide-in chat panel anchored to the right edge of
   quiz/homework tabs. Default state: closed. The student summons it via
   the `?` keybind or a corner pill button. Persistent per-tab so it
   remembers expanded state across navigation.
10. **`clarification` tool**: new exam-mode-only tool. Returns a normalized
    rephrasing of the item prompt; never reveals method or partial answer.
11. **Mode-aware composer chips**: quiz gets `I'm stuck` / `next`; homework
    gets `clarify` / `flag for review`; exam gets `ask for clarification` /
    `next problem`. Phase 13 chips infrastructure already exists.
12. **Bootstrap explorer prompt updates**: explicit assessment-placement
    rules + adaptive course-sizing rules. Cap ranges become functions of
    material density rather than a fixed `50`.
13. **Bootstrap explorer tools**: `course.draft_add_unit`,
    `course.draft_set_assessment_plan`,
    `course.draft_add_lesson_assessment`. The explorer's
    `course.draft_add_lesson` extends to optionally bind assessments per
    lesson at add-time.
14. **`persistDraft`** extension: materialise units, the assessment plan,
    and shell `Assignment` rows for each scheduled assessment. Shells are
    rows with `items: []` and `submittedAt: null` — the tutor or
    configurator authors items before each assessment goes live.
15. **Teach-mode prompt**: explicit principles about *when* to author an
    assignment ("after a worked example sequence, before introducing a new
    concept", "at unit boundaries"), and explicit framing that authoring is
    a teaching tool, not a test.
16. **Activity rail integration**: two new activity item kinds —
    `assignment.issued` and `assignment.submitted`. The submitted entry
    pulses softly when the parent tutor tab is in the background.

### What's out of scope

- Migrating already-shipped courses (which have no units / no assessment
  plan). Existing courses keep their flat lesson list; new courses get the
  full structure. No backfill SQL.
- Auto-grading of free-response items at scale. Phase 8's rubric agent
  stays as-is (one item at a time, on demand).
- Cross-course assessments (a final that draws from two courses). The
  scope here is per-course.
- Pacing across the calendar (due dates, weekly study schedules). The
  design carries enough metadata to add pacing later but does not surface
  it in the UI.
- Exam proctoring features beyond restricting the agent's tool surface
  (no webcam, no fullscreen lock, no copy/paste blocking).
- Configure-mode parity for the new modality UIs. Configure mode keeps its
  current split-pane shape (Phase 11).

---

## Architectural overview

### Authoring → spawn → submit → notify

```
┌──────────────────────────────── teach session (parent) ─────────────────────┐
│                                                                              │
│   user: "I think I'm ready to try a quiz on linear equations"               │
│                                                                              │
│   tutor calls assignment.create({ kind: "quiz", items: [...], ... })        │
│       │                                                                      │
│       │  ── tool execution ──                                                │
│       │  - validates items                                                  │
│       │  - inserts assignment row with parent_session_id = <teach sid>      │
│       │    and parent_call_id = <tool call id>                              │
│       │  - posts activity-rail entry: { kind: "assignment.issued", ... }    │
│       └──→ returns { assignmentId, itemCount } to the tutor                 │
│                                                                              │
│   tutor: "I just put a 5-item quiz in your tabs — open it when ready."      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │  renderer subscribes to activity rail.
                                     │  on `assignment.issued`, calls
                                     │  praxis.session.spawn_from_assignment
                                     │  ({ parentSessionId, assignmentId,
                                     │     parentCallId })
                                     ▼
                       ┌─────────────────────────────────┐
                       │  SessionService.spawnFromAssign │
                       │  - opens child session in modeId│
                       │    matching assignment.kind     │
                       │  - assignment.parent_session_id │
                       │    already set; child session   │
                       │    sets sessions.parent_session │
                       │    _id = teach sid              │
                       │  - tabs.open(...) with new sid  │
                       └─────────────────────────────────┘
                                     │
                                     ▼
┌────────────────── quiz session (child, primary surface = assignment) ───────┐
│                                                                              │
│   <QuizTabBody>:                                                             │
│   - large item display, one at a time                                       │
│   - sidekick chat slides in from right when summoned                        │
│                                                                              │
│   student answers, hits Submit                                              │
│       │                                                                      │
│       │  client.assignments.submit(assignmentId)                            │
│       │   → grades all items                                                 │
│       │   → if assignment.parent_session_id non-null:                       │
│       │       1. composes a `system_note` with the grade summary            │
│       │       2. appends it to the parent's episodic events                 │
│       │       3. posts activity-rail entry                                  │
│       │          { kind: "assignment.submitted", parentSessionId, ... }     │
│       │       4. if parent session is active in memory (live engine):       │
│       │          synthesises a turn that injects the system_note as the    │
│       │          conversation prompt → tutor narrates feedback live.        │
│       │       else: lazy delivery — next time the user types in the        │
│       │             tutor tab, loadConversationHistory replays the         │
│       │             system_note before the new user turn.                   │
│       │                                                                      │
│       └──→ feedback card renders inline; student returns to tutor tab       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────── teach session (parent) ─────────────────────┐
│                                                                              │
│   tutor (replying to system_note): "Nice — 4/5. The mistake on item 3 was   │
│   forgetting to flip the inequality when dividing by a negative. Want to    │
│   work that one through together?"                                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Course shape with units + assessment plan

```
Course
├── units[]               (NEW; ordered list of units; each unit is a band)
│   ├── lessons[]         (lessons that belong to this unit, in study order)
│   └── summativeAssessment  (e.g. "midterm", "unit exam", "final")
└── assessmentPlan        (NEW; aggregate description of the scaffold)
    ├── perLesson         ("homework after every lesson")
    ├── interleaved       ("quiz at lessons 3, 7, 10")
    └── summatives        ("midterm at lesson 6; final at lesson 12")

Each scheduled assessment is materialised as an Assignment row with
items: [] until a tutor or configurator authors items into it. The
mere existence of the row is the schedule.
```

---

## Implementation Units

### Unit 1: Schema additions

**File**: `packages/memory/src/schema.ts` (sessions table extension)

```typescript
// Add to sessions table:
parentSessionId: text("parent_session_id"),  // FK to sessions.id, nullable
parentCallId: text("parent_call_id"),        // engine call_id of the
                                             // assignment.create tool call
                                             // that spawned this session.
                                             // Used to thread submissions
                                             // back to the right tool ctx.
```

**File**: `packages/artifacts/src/schema.ts` (assignments + new tables)

```typescript
// Add to assignments table:
parentSessionId: text("parent_session_id"),  // FK to sessions.id; nullable.
                                             // Set by assignment.create tool
                                             // from ToolContext.sessionId.
parentCallId: text("parent_call_id"),        // Engine call_id of the
                                             // creating assignment.create
                                             // call. Nullable for
                                             // bootstrap-time scheduled
                                             // assessments (no parent
                                             // session).

// New table: course_units
export const courseUnits = sqliteTable(
  "course_units",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull().references(() => courses.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    summary: text("summary"),                // optional editorial blurb
    orderIndex: integer("order_index").notNull(),
    summativeAssignmentId: text("summative_assignment_id").references(
      () => assignments.id,
    ),  // null if no summative; e.g. unit-without-exam
  },
  (t) => ({
    byCourseOrder: uniqueIndex("course_units_order_uk").on(
      t.courseId,
      t.orderIndex,
    ),
  }),
);

// New table: lesson_unit join (lesson belongs to exactly one unit)
export const lessonUnits = sqliteTable("lesson_units", {
  lessonId: text("lesson_id")
    .primaryKey()
    .references(() => lessons.id, { onDelete: "cascade" }),
  unitId: text("unit_id").notNull().references(() => courseUnits.id, {
    onDelete: "cascade",
  }),
});

// New table: lesson_assessments — scheduled assessments per lesson
export const lessonAssessments = sqliteTable(
  "lesson_assessments",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id").notNull().references(() => lessons.id, {
      onDelete: "cascade",
    }),
    assignmentId: text("assignment_id").notNull().references(
      () => assignments.id,
      { onDelete: "cascade" },
    ),
    timing: text("timing", {
      enum: ["before", "after", "interleaved"],
    }).notNull(),  // "before lesson" / "after lesson" / "during lesson"
    purpose: text("purpose", {
      enum: ["readiness", "practice", "checkpoint"],
    }).notNull(),
    // assignment.kind already says quiz/homework/exam; this is the role.
  },
);

// Add to courses table:
assessmentPlanJson: text("assessment_plan_json", { mode: "json" }),
// Stores the AssessmentPlan domain type. Read-only after persistDraft;
// mutation goes through configure-mode tooling (out of scope here).
```

**Migration**: drizzle-kit generates `drizzle/00XX_phase16_modalities.sql`.
Existing rows have all new columns null; existing courses will have a null
`assessment_plan_json` and zero rows in `course_units`,
`lesson_units`, `lesson_assessments` — that's fine, the UI defaults to the
flat-lesson view when a course has no units.

**Implementation Notes**:
- The `lessonUnits` join is technically 1:1 because each lesson belongs to
  exactly one unit. We use a join table rather than a `unitId` column on
  lessons so we don't have to pollute the lessons schema for courses that
  predate units. The existence of a row says the lesson is in a unit; its
  absence says "unit-less" (legacy course).
- `parentCallId` may be null for bootstrap-scheduled assessments
  (configurator scheduled them, not a tutor session). For tutor-authored
  assessments mid-session, it's always populated.
- The `summativeAssignmentId` FK on `course_units` lets a unit point at its
  exam without requiring a separate `unit_assessments` table — there's at
  most one per unit by convention.

**Acceptance Criteria**:
- [ ] Migration generates cleanly; `pnpm db:migrate` applies it.
- [ ] Inserting a session with a `parentSessionId` succeeds; FK enforced.
- [ ] `course_units.orderIndex` is unique per course.
- [ ] All new columns are nullable so older course rows continue to load.

---

### Unit 2: Domain types

**File**: `packages/core/src/types/artifacts.ts` (extensions)

```typescript
// New: Unit (the persisted shape)
export interface Unit {
  id: UnitId;
  courseId: CourseId;
  name: string;
  summary?: string;
  orderIndex: number;
  lessonIds: LessonId[];                 // resolved from lessonUnits join
  summativeAssignmentId?: AssignmentId;  // exam at unit boundary
}

// New: LessonAssessment (the persisted scheduling shape)
export interface LessonAssessment {
  id: LessonAssessmentId;
  lessonId: LessonId;
  assignmentId: AssignmentId;
  timing: "before" | "after" | "interleaved";
  purpose: "readiness" | "practice" | "checkpoint";
}

// New: AssessmentPlan (lives on Course as a serialized field)
export interface AssessmentPlan {
  // Coverage over the course as a whole. The persistDraft step materialises
  // each entry as an Assignment shell + lessonAssessments / unit FK row.
  perLesson: {
    homework: boolean;            // homework after every lesson?
    quizFrequency?: number;       // 0 = none; N = quiz every Nth lesson
  };
  summatives: Array<{
    kind: "midterm" | "unit_exam" | "final";
    afterUnitOrderIndex: number;  // place exam after unit at this index
    title: string;
  }>;
  // Pace metadata; used by future Phase that adds calendar pacing.
  // Carried through bootstrap → DB so the data is durable now even if
  // unused.
  pacing?: { sessionsPerWeek?: number; weeksTotal?: number };
}

// Extend Course
export interface Course {
  // ... existing fields ...
  assessmentPlan?: AssessmentPlan;  // optional for legacy courses
}

// New brand types
export type UnitId = Brand<string, "UnitId">;
export type LessonAssessmentId = Brand<string, "LessonAssessmentId">;
```

**File**: `packages/core/src/types/artifacts.ts` (ProposedCourse extensions)

```typescript
export interface ProposedUnit {
  draftUnitId: string;          // local id; resolved to UnitId at persist
  name: string;
  summary?: string;
  draftLessonIds: string[];     // refs into proposedLessons[].draftLessonId
  summative?: ProposedAssessment;  // exam at unit boundary; optional
}

export interface ProposedAssessment {
  draftAssessmentId: string;
  kind: "quiz" | "homework" | "exam";
  title: string;
  conceptNames: string[];       // resolved to ConceptId at persist
  // Items deferred — explorer doesn't author items, just schedules. Items
  // are filled by tutor or configurator before the student takes the
  // assessment. This keeps explorer cost / latency bounded.
  expectedItemCount?: number;   // editorial hint for the configurator
  rationale: string;            // why is this here? what does it test?
}

export interface ProposedCourse {
  // ... existing fields ...
  proposedUnits: ProposedUnit[];
  assessmentPlan: AssessmentPlan;
  // proposedLessons stays the same shape; lesson↔unit binding is via
  // ProposedUnit.draftLessonIds.
}
```

**File**: `packages/core/src/types/engine.ts` (event union extension)

```typescript
// Extend EngineEvent
export type EngineEvent =
  | { type: "user_message"; content: string }
  | { type: "model_message"; content: string; partial?: boolean }
  | { type: "tool_call"; toolName: string; args: unknown; callId: string }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "thinking"; content: string }
  | { type: "error"; error: EngineError }
  | { type: "final"; usage: TokenUsage }
  | {
      // NEW. A non-user, non-tool, non-model message appended to a
      // session's conversation by the runtime itself. Used today for
      // assignment-submission notifications. Engines render these as
      // bracketed system notes prepended to the next user turn (or as
      // their own user-role turn for engines that don't support arbitrary
      // role injection).
      type: "system_note";
      content: string;
      origin:
        | { kind: "assignment_submission"; assignmentId: string;
            childSessionId: string; gradeTotal: number; submittedAt: number }
        | { kind: "system"; topic: string };
    };
```

**Implementation Notes**:
- `system_note` is **persisted** to episodic events via the existing
  `appendEpisodic` path. `loadConversationHistory` is updated to surface it
  as a synthetic user turn prefixed `[Praxis] ` so the model sees the
  signal regardless of engine. Engines that natively support arbitrary
  role injection (Anthropic Messages API supports system mid-conversation
  by stitching system blocks; OpenAI does not — falls back to user role)
  can override at the adapter level later.
- Existing tool_result behaviour is **untouched**. We don't try to spoof a
  tool_result for the original `assignment.create` call; that call was
  already resolved with `{ assignmentId, itemCount }` synchronously. The
  submission notification is a *new* turn-boundary event, not a delayed
  resolution.
- `loadConversationHistory` (in `packages/core/src/session/history.ts`)
  must add `system_note` to the events it preserves on resume. Current
  filter keeps only `user_message` and `model_message` — extend to
  include `system_note`, mapping each one to a synthetic user turn:
  `{ role: "user", content: "[Praxis] " + event.content }`.

**Acceptance Criteria**:
- [ ] All new types compile under strict mode.
- [ ] `EngineEvent` discriminated union remains exhaustive (`switch`
      compile-checks must surface unhandled branches).
- [ ] `loadConversationHistory` surfaces `system_note` events on resume in
      the order they were appended.
- [ ] `appendEpisodic` accepts `system_note` and writes it to the
      `episodic_events` table without losing the `origin` payload (use
      `payloadJson`).

---

### Unit 3: SessionService.appendSystemNote + spawnFromAssignment

**File**: `packages/core/src/services/session-service.ts`

```typescript
class SessionServiceImpl implements SessionService {
  // ... existing methods ...

  /**
   * Append a system_note to a session's episodic stream. If the session is
   * currently active in memory (an EngineSession is alive in
   * activeSessions), drive a synthetic turn with the note as the prompt;
   * the tutor model narrates feedback in real time. If idle, the note
   * sits in the transcript and gets replayed on the next user turn via
   * loadConversationHistory.
   *
   * Append-only by design: never mutates past events. Cache prefix up to
   * the prior turn's tail stays warm; only the new note + new model
   * response cost fresh tokens.
   */
  async notifySession(input: {
    sessionId: SessionId;
    note: string;
    origin: SystemNoteOrigin;
  }): Promise<void>;

  /**
   * Open a new session bound to an assignment, declaring the session that
   * caused it. Used by the renderer when it sees an assignment.issued
   * activity rail event. The child session's modeId is derived from the
   * assignment's kind (quiz → "quiz", homework → "homework", exam →
   * "exam"). The assignment row already carries parent_session_id /
   * parent_call_id (set by assignment.create); this method ensures the
   * child sessions row mirrors that linkage.
   */
  async spawnFromAssignment(input: {
    assignmentId: AssignmentId;
    parentSessionId: SessionId;
    parentCallId: string;
  }): Promise<SessionHandle>;
}
```

**File**: `packages/core/src/services/session-service.ts` (continued; private helpers)

```typescript
// Internal: drive a synthetic turn against an active engine session. Used
// by notifySession when the session is in activeSessions.
private async runSyntheticTurn(input: {
  sessionId: SessionId;
  systemNote: string;
}): Promise<void> {
  const entry = this.activeSessions.get(input.sessionId);
  if (!entry) return;  // not active; lazy delivery handles it

  const turnIndex = nextTurnIndex(this.deps.db, input.sessionId);

  // Append the system_note to episodic FIRST so resume sees it even if the
  // synthetic turn fails midstream.
  appendEpisodic({
    db: this.deps.db,
    sessionId: input.sessionId,
    studentId: brandId<"StudentId">(/* loaded from session row */),
    engineId: entry.engineId,
    modeId: entry.mode.id,
    turnIndex,
    event: { type: "system_note", content: input.systemNote, origin: ... },
  });

  // Drive the engine. Pass the system_note as the prompt; engines map this
  // to a system-role message (Anthropic) or prefix-on-user (OpenAI fallback).
  for await (const event of entry.handle.send(input.systemNote, {
    role: "system",
  })) {
    appendEpisodic({ /* ... */ event });
    // Forward to the active stream subscriber (the open tab) so the user
    // sees the tutor narrating live.
    this.broadcastToActiveStream(input.sessionId, event);
  }
}
```

**Implementation Notes**:
- `EngineSession.send` currently takes only `(message: string)`. To
  support a system role we extend the signature to
  `send(message: string, options?: { role?: "user" | "system" })`. Each
  engine adapter maps:
  - **Claude Code SDK**: pass via the `system` parameter as an extra
    system block appended to the running conversation.
  - **Codex SDK**: prepend `[Praxis system] ` and send as a user turn
    (Codex doesn't support mid-conversation system blocks).
  - **Direct AI SDK**: append as a system-role message to the messages
    array.
- The `broadcastToActiveStream` helper is needed because the live UI
  observer subscribed via `client.session.send(...)` won't see events
  emitted by a synthetic turn fired internally. We'll wire a simple
  EventEmitter in `SessionServiceImpl` keyed by `sessionId` and have the
  IPC handler subscribe + multiplex events to active renderer channels.
  This is small and self-contained.
- `spawnFromAssignment` reuses the existing `start()` logic with one
  addition: writes `parent_session_id` and `parent_call_id` to the new
  session row.

**Acceptance Criteria**:
- [ ] `notifySession` is idempotent on the episodic write but the
      synthetic turn runs only once.
- [ ] When `notifySession` is called for a session not in
      `activeSessions`, no synthetic turn runs; the next call to `send`
      from the renderer sees the system_note in `priorTurns`.
- [ ] `spawnFromAssignment` opens a session whose `modeId` matches the
      assignment kind (asserted at runtime; an `exam` kind opens an exam
      mode session and not a quiz session even if the caller passes a
      bogus mode hint).
- [ ] `EngineSession.send`'s new `options.role` parameter is honoured by
      all three engines; system-role injection is verified in adapter
      tests.

---

### Unit 4: AssignmentService.submit() — submission notification

**File**: `packages/core/src/services/assignment-service.ts`

```typescript
class AssignmentServiceImpl implements AssignmentService {
  // ... existing ...

  async submit(input: {
    assignmentId: AssignmentId;
    responses?: AssignmentResponse[];
  }): Promise<AssignmentSubmissionResult> {
    // ... existing grading flow ...

    const assignmentRow = /* loaded above */;

    if (assignmentRow.parentSessionId) {
      const note = composeSubmissionNote({
        assignment: assignmentRow,
        grade: result.grade,
        submittedAt: result.submittedAt,
      });

      // Fire-and-await; we want the tutor's live narration to begin
      // before submit() returns so the renderer can show the tutor tab
      // already populated when the student switches back.
      await this.deps.sessions.notifySession({
        sessionId: brandId<"SessionId">(assignmentRow.parentSessionId),
        note,
        origin: {
          kind: "assignment_submission",
          assignmentId: assignmentRow.id,
          childSessionId: this.deps.currentSessionId,  // the child taking the quiz
          gradeTotal: result.grade.total,
          submittedAt: result.submittedAt,
        },
      });

      // Activity rail entry — already fires from notifySession's path? No,
      // notifySession is silent on the rail. Post the entry here.
      this.deps.activity?.start({
        kind: "assignment.submitted",
        label: lowercaseEditorial(`${assignmentRow.title} submitted`),
        detail: `${Math.round(result.grade.total * 100)}% · ${assignmentRow.kind}`,
        // ... timing fields ...
      }).done();  // mark immediately as done — this is a notification not a job
    }

    return result;
  }
}

// Composes the human-readable note the tutor sees as a system message.
// Editorial lowercase, no emojis, structured so the model can parse it
// without fragile regex.
function composeSubmissionNote(input: {
  assignment: Assignment;
  grade: Grade;
  submittedAt: Timestamp;
}): string {
  const total = Math.round(input.grade.total * 100);
  const lines: string[] = [];
  lines.push(`The student just submitted ${input.assignment.kind}: ${input.assignment.title}.`);
  lines.push(`Aggregate score: ${total}% (${input.grade.reviewedBy}).`);
  lines.push("");
  lines.push("Per-item breakdown:");
  for (const item of input.grade.perItem) {
    const score = item.score === null
      ? "needs review"
      : `${Math.round(item.score * 100)}%`;
    lines.push(`- item ${item.itemId} (${item.gradedBy}): ${score} — ${item.feedback}`);
  }
  lines.push("");
  lines.push("Narrate per-item feedback warmly. Celebrate wins; on misses, name the misconception and offer to work it through together. Then return to the lesson.");
  return lines.join("\n");
}
```

**File**: `packages/core/src/services/types.ts` (ServiceDeps extension)

```typescript
interface ServiceDeps {
  // ... existing ...
  sessions: SessionService;          // already there
  // No new fields; AssignmentService already gets this through deps.
  currentSessionId: SessionId;       // ALREADY EXISTS for ToolContext threading.
}
```

**Implementation Notes**:
- The note text is treated as a system prompt to the tutor, not as user
  text the student typed. The closing "Narrate per-item feedback warmly"
  sentence is a directive to the model, leveraging the
  already-instilled tutor persona.
- The composer keeps the structure parseable: line-prefixed item entries
  let the model quote specific items naturally.
- Activity rail entry uses `.done()` immediately because submission is
  not an ongoing process — the entry is purely a notification.
- We do NOT wait for the synthetic turn to finish before returning from
  `submit()`. The renderer can begin receiving the live narration via the
  `broadcastToActiveStream` channel as it streams, but `submit()` returns
  the grade synchronously to the child tab so feedback renders without
  dependency on the parent.

**Acceptance Criteria**:
- [ ] Submitting an assignment with a `parentSessionId` results in exactly
      one `system_note` appended to the parent's episodic stream.
- [ ] Submitting an assignment with `parentSessionId === null` (e.g.
      configure-mode test grading) skips the notification path entirely.
- [ ] The submission note includes per-item feedback text and aggregate
      score; format is stable enough for snapshot testing.
- [ ] Activity rail fires `assignment.submitted` with `parentSessionId` in
      its payload so the rail UI can highlight the relevant tutor tab.

---

### Unit 5: assignment.create tool — capture parent session

**File**: `packages/tools/src/assignment/create.ts`

```typescript
export const assignmentCreateTool: ToolDefinition = {
  name: "assignment.create",
  description: /* existing */,
  inputSchema: /* existing */,
  outputSchema: /* existing */,
  effects: ["artifact.mutate"],
  tier: "model-derived",
  handler: async (input, ctx) => {
    // ... existing validation + lock check ...

    const { assignmentId } = await ctx.services.assignments.create({
      ...input,
      // NEW: capture the calling session as the parent
      parentSessionId: ctx.sessionId,
      parentCallId: ctx.toolCallId,
    });

    // NEW: post activity-rail entry so the renderer can react.
    ctx.activity?.start({
      kind: "assignment.issued",
      label: lowercaseEditorial(`${input.kind} issued: ${input.title}`),
      detail: `${input.items.length} items`,
      // assignment-issued items linger only briefly; the tab opening is
      // the real signal.
      lingerMs: 2_500,
    }).done();

    return { ok: true, assignmentId, itemCount: input.items.length };
  },
};
```

**File**: `packages/core/src/services/assignment-service.ts`

```typescript
// Extend create() signature
async create(input: {
  courseId: CourseId;
  studentId: StudentId;
  kind: "quiz" | "homework" | "exam";
  title: string;
  items: AssignmentItem[];
  conceptIds: ConceptId[];
  authoredBy?: "tutor" | "configurator";
  // NEW
  parentSessionId?: SessionId;
  parentCallId?: string;
}): Promise<{ assignmentId: AssignmentId }>;
```

**Implementation Notes**:
- `ctx.toolCallId` must be exposed on `ToolContext`. Today it lives only
  inside the engine adapters. We propagate it: `ToolContext.toolCallId:
  string` is set per-dispatch by the registry when invoking a handler.
  The dispatch loop in `InProcessToolRegistry.dispatch` passes the
  call_id from the engine event into `handler(parsed.data, { ...ctx,
  toolCallId })`.
- `ctx.sessionId` already exists.
- `lowercaseEditorial` is a tiny helper in `@praxis/ui` (or core): wraps
  `s.toLocaleLowerCase()` and trims trailing punctuation. Used to enforce
  the editorial voice.

**Acceptance Criteria**:
- [ ] After `assignment.create` runs, the resulting assignment row's
      `parentSessionId` matches the calling session.
- [ ] Activity rail receives an `assignment.issued` entry with the right
      kind / title / item count.
- [ ] Configure-mode `assignment.create` calls (no session, e.g.
      programmatic creation) leave `parentSessionId` null without error.

---

### Unit 6: Renderer-side spawn — wire activity events to tab open

**File**: `packages/ui/src/hooks/use-assignment-issued-spawn.ts`

```typescript
/**
 * Subscribe to activity events; when an assignment.issued entry fires,
 * spawn a tab in the assignment's modality. Mounted once at app shell
 * level (e.g. inside the ChatTabs root).
 *
 * Skipping is safe: if the user has another tab focused, the new tab
 * appears in the strip without stealing focus. Editorial: no toast, no
 * sound; the tab strip update IS the affordance.
 */
export function useAssignmentIssuedSpawn(): void {
  const client = usePraxisClient();
  const { openTab } = useTabs();

  useEffect(() => {
    return client.activity.subscribe(async (event) => {
      if (event.kind !== "added") return;
      if (event.item.kind !== "assignment.issued") return;
      if (!event.item.assignmentId) return;
      if (!event.item.parentSessionId) return;
      if (!event.item.parentCallId) return;

      const handle = await client.session.spawnFromAssignment({
        assignmentId: event.item.assignmentId,
        parentSessionId: event.item.parentSessionId,
        parentCallId: event.item.parentCallId,
      });

      await openTab({ sessionId: handle.sessionId });
      // navigate happens inside openTab. We deliberately DO NOT focus the
      // new tab — the student keeps their place; the tab is there when
      // they're ready.
    });
  }, [client, openTab]);
}
```

**File**: `packages/core/src/types/activity.ts` (extension)

```typescript
// Extend ActivityItem.kind
export type ActivityItemKind =
  // ... existing kinds ...
  | "assignment.issued"
  | "assignment.submitted";

// Add optional fields used only by these kinds
export interface ActivityItem {
  // ... existing ...
  assignmentId?: string;
  parentSessionId?: string;
  parentCallId?: string;
}
```

**Implementation Notes**:
- `openTab` does NOT navigate to the new tab; it only inserts it in the
  strip. The user clicks the strip when ready. This honours the
  "presence without intrusion" editorial constraint.
- For the `assignment.submitted` event, a separate hook
  `useAssignmentSubmittedHighlight` watches and applies a soft pulse class
  to the parent tab in the strip — see Unit 11 (Activity rail integration).

**Acceptance Criteria**:
- [ ] On `assignment.create`, a new tab appears in the strip in the
      correct modality within 200ms.
- [ ] The active tab does not lose focus when the new tab is added.
- [ ] If the user closes the new tab and another `assignment.issued`
      event for the same assignment id fires, no duplicate tab is
      created (idempotency keyed by `assignmentId`).

---

### Unit 7: Per-mode tab body components

**File**: `packages/ui/src/components/quiz-tab-body.tsx`

```typescript
/**
 * Quiz modality. Flashcard rhythm: one item at a time, large display
 * typography, keyboard-driven. The tutor agent appears via a slide-in
 * SidekickPanel, summoned by the student.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  kicker: "quiz · linear equations · 2 of 5"         │
 *   ├─────────────────────────────────────────────────────┤
 *   │                                                     │
 *   │            [ large item prompt ]                    │
 *   │                                                     │
 *   │            [ input control ]                        │
 *   │                                                     │
 *   │  [ prev ]                          [ next / submit ]│
 *   └─────────────────────────────────────────────────────┘
 *
 *   On submit: feedback overlays each item card in sequence.
 *
 *   Side-pane: `<SidekickPanel>` slides in from the right when the
 *   student presses `?` or clicks the corner pill.
 */
export function QuizTabBody(props: { sessionId: SessionId }): JSX.Element;
```

**File**: `packages/ui/src/components/homework-tab-body.tsx`

```typescript
/**
 * Homework modality. Paginated problem set; per-problem workspace
 * combining sketch (Phase 15a primitive) + typed input + sidekick chat.
 * Auto-saves on each navigation (already implemented via debounced
 * recordResponse).
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  kicker: "homework · §3.2 — page 1 of 4"            │
 *   ├─────────────────────────────────────────────────────┤
 *   │                                                     │
 *   │  [ item prompt + input + sketch canvas if math ]    │
 *   │                                                     │
 *   ├─────────────────────────────────────────────────────┤
 *   │  pagination:  · · • · ·   [ flag ] [ next ]         │
 *   └─────────────────────────────────────────────────────┘
 *
 *   Side-pane: same SidekickPanel, summonable.
 */
export function HomeworkTabBody(props: { sessionId: SessionId }): JSX.Element;
```

**File**: `packages/ui/src/components/exam-tab-body.tsx`

```typescript
/**
 * Exam modality. Full-tab proctored layout. Timer in the kicker (if
 * configured). Problem-by-problem nav (no pagination dots — explicit
 * "next problem" button only). Sidekick is REPLACED by a clarification
 * affordance — pressing the button opens a one-shot prompt that returns
 * a normalized rephrasing only. No general chat.
 *
 * Layout: same skeleton as homework, but:
 *   - timer in kicker
 *   - sidekick pill says "ask for clarification" instead of "ask"
 *   - no chat history; clarifications appear as ephemeral overlays
 *   - submit button confirms with a modal ("submit and end exam? you
 *     cannot return.")
 */
export function ExamTabBody(props: { sessionId: SessionId }): JSX.Element;
```

**File**: `packages/ui/src/components/bootstrap-tab-body.tsx`

```typescript
/**
 * Bootstrap modality. Two-pane: chat on the left building a course; the
 * outline of the course-being-built on the right, growing as the
 * explorer or configurator tutor adds units / lessons / assessments.
 *
 * Layout:
 *   ┌──────────────────────────┬──────────────────────────────┐
 *   │  chat (left, ~60%)       │  outline (right, ~40%)       │
 *   │                          │                              │
 *   │  [ tutor turns ]         │  unit 1: foundations         │
 *   │                          │    lesson 1.1 …              │
 *   │                          │    lesson 1.2 …              │
 *   │  [ composer ]            │  unit 2: …                   │
 *   └──────────────────────────┴──────────────────────────────┘
 */
export function BootstrapTabBody(props: { sessionId: SessionId }): JSX.Element;
```

**File**: `packages/ui/src/components/chat-tab-body.tsx` (dispatch update)

```typescript
// Existing ChatTabBody dispatches by mode at render time. Update so
// non-teach modes route to their own body. Teach mode keeps current chat.
function dispatchByMode(modeId: string, sessionId: SessionId) {
  switch (modeId) {
    case "teach":      return <TeachChatTabBody sessionId={sessionId} />;
    case "quiz":       return <QuizTabBody sessionId={sessionId} />;
    case "homework":   return <HomeworkTabBody sessionId={sessionId} />;
    case "exam":       return <ExamTabBody sessionId={sessionId} />;
    case "bootstrap":  return <BootstrapTabBody sessionId={sessionId} />;
    case "configure":  return <ConfigureTabBody sessionId={sessionId} />;
    default:           return <TeachChatTabBody sessionId={sessionId} />;
  }
}
```

**Implementation Notes**:
- All four new bodies share a layout primitive `<ModalitySurface>` that
  provides the kicker + body + footer slots and the `tab-body-isolation`
  CSS contract (display:none when inactive, never unmount). This is just
  a thin wrapper; the dispatch lives in `chat-tab-body.tsx`.
- `<SidekickPanel>` is its own component (Unit 8) used by quiz +
  homework. Exam uses a different component (`<ClarificationPill>`)
  because its tool surface is restricted.
- The existing `<AssignmentCard>` is **not deleted**; it stays as the
  inline-in-chat representation. Teach mode still surfaces it inline
  when the tutor calls `assignment.show` (e.g. "show me the quiz again
  in this thread"). Quiz/homework/exam tabs use the new full-surface
  components instead.

**Acceptance Criteria**:
- [ ] Opening a quiz tab renders `<QuizTabBody>` with no chat visible by
      default.
- [ ] Pressing `?` in a quiz/homework tab opens the sidekick panel; the
      first message focuses the composer.
- [ ] Exam tabs do not render a chat thread; the only conversational
      affordance is the clarification pill.
- [ ] Bootstrap tabs show the outline updating in response to draft
      mutation tools (already-shipped tools fire the existing
      `course.draft_*` IPC events; the outline subscribes to those).

---

### Unit 8: SidekickPanel + ClarificationPill

**File**: `packages/ui/src/components/sidekick-panel.tsx`

```typescript
/**
 * Slide-in chat panel anchored to the right edge of a quiz/homework tab.
 * Default closed; persistent open state per tab (stored in tab metadata
 * or session storage).
 *
 * Behaviour:
 *  - Pressing `?` toggles. Pressing `Esc` while focused closes.
 *  - When open, the panel is ~400px wide. Body content shrinks
 *    proportionally (CSS grid, no overlay/pointer-blocking).
 *  - Threads the same session; messages flow through the same
 *    AsyncIterable<EngineEvent> stream as the modality tools.
 */
export function SidekickPanel(props: {
  sessionId: SessionId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element;
```

**File**: `packages/ui/src/components/clarification-pill.tsx`

```typescript
/**
 * Exam-only affordance. A single pill in the tab corner labeled "ask for
 * clarification". Clicking opens a one-shot prompt input.
 * On submit, fires `clarification` tool with the current item's prompt
 * and the student's question; renders the response inline as an
 * ephemeral overlay (auto-dismisses after 30s or on next-item).
 *
 * The agent is restricted server-side to the `clarification` tool only
 * via mode.toolNames in exam mode; the UI affordance enforces the same
 * mental model client-side.
 */
export function ClarificationPill(props: { sessionId: SessionId; itemId: string }): JSX.Element;
```

**Implementation Notes**:
- Both panels reuse the existing message-streaming hooks; nothing
  fundamentally new in transport.
- `SidekickPanel` deliberately uses CSS grid resizing rather than
  position:absolute overlay so the underlying assignment doesn't get
  hidden behind a panel — they coexist.

**Acceptance Criteria**:
- [ ] Opening the sidekick in a quiz tab does not collapse or hide the
      assignment view.
- [ ] Clarification pill in exam mode triggers only the `clarification`
      tool; attempting to call any other tool from that surface returns a
      "tool not available in exam mode" error.

---

### Unit 9: clarification tool

**File**: `packages/tools/src/exam/clarification.ts`

```typescript
/**
 * Exam-mode-only tool. Returns a normalized rephrasing of an item
 * prompt. Never reveals method, partial answer, or strategy. The model
 * is constrained by both the tool description and the exam-role prompt
 * fragment.
 */
export const clarificationTool: ToolDefinition = {
  name: "clarification",
  description:
    "Restate an exam item prompt in plainer wording. ONLY rephrase; never explain method, never hint at the answer, never reveal which step comes first. If the question asks for an approach, refuse politely and tell the student you can only restate.",
  inputSchema: z.object({
    itemId: z.string(),
    studentQuestion: z.string().describe(
      "What the student asked you to clarify, e.g. 'I don't get what \"isolate the variable\" means here'"
    ),
  }),
  outputSchema: z.object({
    kind: z.enum(["rephrased", "refused"]),
    text: z.string(),
  }),
  effects: [],
  tier: "model-derived",
  handler: async (input, ctx) => {
    // The model's output is the result; this tool is a thin contract
    // wrapper. The real enforcement is in the tool description (visible
    // to the model) and the exam-role prompt fragment that says "method
    // help would corrupt the measurement; refuse politely". This is the
    // same pattern as `course.start_lesson` and other thin wrappers.
    return { kind: "rephrased", text: input.studentQuestion };
    // ↑ trivial pass-through; the model's wrapper turn around this tool
    // generates the actual rephrasing. The tool exists to:
    //   (a) show in the audit trail that a clarification was requested
    //   (b) be the only tool in exam-mode toolNames
  },
};
```

**File**: `packages/curriculum/src/modes/exam.ts` (toolNames update)

```typescript
toolNames: [
  "assignment.show",
  "assignment.read_grade",
  "sketch.read",
  "clarification",  // NEW
],
```

**Implementation Notes**:
- The handler is trivial because the *prompt* is the enforcement
  mechanism. Make the tool thin so it's auditable: every clarification
  request shows up in the episodic events as a tool_call, and a
  configurator can review them post-exam.
- The exam-role prompt fragment already says "Do NOT clarify item
  meaning beyond reading the prompt back verbatim" — soften this to
  "Use the `clarification` tool to provide a normalized rephrasing
  ONLY when asked. Never reveal method, never hint at the answer."

**Acceptance Criteria**:
- [ ] In an exam session, calling `grade_math` or `code_sandbox` returns
      a "tool not available in this mode" error from the dispatcher.
- [ ] `clarification` tool calls appear in episodic events with the
      student's question and the model's rephrasing.

---

### Unit 10: Mode-aware composer chips

**File**: `packages/ui/src/components/composer-chips.tsx`

```typescript
// Phase 13's chips already support mode dispatch via a registry.
// Extend the registry:
const COMPOSER_CHIPS_BY_MODE: Record<string, ChipSpec[]> = {
  // ... existing teach / configure / bootstrap chips ...
  quiz: [
    { id: "stuck",    label: "I'm stuck",  prompt: "I'm stuck on this item — can you give me a nudge?" },
    { id: "next",     label: "Next item",  prompt: null /* triggers nav, not message */ },
  ],
  homework: [
    { id: "clarify", label: "Clarify wording", prompt: "Can you restate this question in plainer terms?" },
    { id: "flag",    label: "Flag for review", prompt: null },
  ],
  exam: [
    { id: "clarify-q", label: "Ask for clarification", prompt: "Please restate item {{currentItemId}} in plainer wording." },
    { id: "next-q",    label: "Next problem",          prompt: null },
  ],
};
```

**Acceptance Criteria**:
- [ ] Each mode's chips render in its tab's composer surface.
- [ ] Chips that are pure-nav (next, flag) call the appropriate handler
      and do not send a chat message.

---

### Unit 11: Activity rail entry kinds

**File**: `packages/core/src/types/activity.ts`

```typescript
// Add typed payloads
export interface ActivityItemAssignmentIssued extends ActivityItemBase {
  kind: "assignment.issued";
  assignmentId: string;
  parentSessionId: string;
  parentCallId: string;
}

export interface ActivityItemAssignmentSubmitted extends ActivityItemBase {
  kind: "assignment.submitted";
  assignmentId: string;
  parentSessionId: string;
  childSessionId: string;
  gradeTotal: number;
}

// Existing union extended
```

**File**: `packages/ui/src/components/activity-rail.tsx`

```typescript
// Extend rendering to handle the two new kinds with editorial labels:
//   "homework issued: derivative practice"
//   "quiz submitted: 80% — linear equations"
// On click of an `assignment.submitted` entry, navigate to the parent
// tutor session's tab so the user sees the tutor's narration.
```

**Acceptance Criteria**:
- [ ] Both new kinds render in the rail with editorial-cased labels.
- [ ] Clicking a submitted entry navigates to the parent tutor tab.
- [ ] The submitted entry's linger respects the editorial constraint
      (no permanent badge — fades after `lingerMs`, default 30s).

---

### Unit 12: Bootstrap explorer prompt — assessment placement + adaptive sizing

**File**: `packages/curriculum/src/bootstrap/explorer-prompt.ts`

Append to the existing system prompt:

```text
==== Course structure rules ====

A course is NOT a flat list of lessons. It is structured as units, each
containing 3-5 lessons that share a coherent theme. Course size scales
with the material:

- Light material (one short monograph, < 100 pages or < 8 chapters):
  10-12 lessons across 2-3 units. Concept cap 50.
- Medium material (a standard textbook chapter set, ~12-20 chapters):
  15-20 lessons across 4-5 units. Concept cap 100.
- Dense material (a full reference textbook, > 20 chapters):
  20-30 lessons across 5-6 units. Concept cap 150.

Use `course.list_sections` and `document.outline` to assess density
before committing. State your sizing rationale in your reasoning before
calling `course.draft_set_metadata`.

==== Assessment placement rules ====

After you have proposed concepts and lessons, plan the assessment
scaffold. Use:
- `course.draft_set_assessment_plan(plan)` once, declaring the overall
  scaffold shape (homework cadence, quiz frequency, summative kinds).
- `course.draft_add_unit({ name, draftLessonIds, summative? })` to group
  lessons into units. Every lesson must end up in exactly one unit.
- For each summative (midterm / unit exam / final), include it as the
  unit's `summative` field. Concept names listed in the summative MUST
  appear in the unit's lessons.
- `course.draft_add_lesson_assessment({ draftLessonId, kind, timing,
  purpose, conceptNames, expectedItemCount, rationale })` to schedule
  homework / quiz / readiness checks per lesson.

Default scaffold (apply unless the materials suggest otherwise):
- Homework AFTER every lesson (kind: "homework", timing: "after",
  purpose: "practice", expectedItemCount: 5-8).
- Quiz at every Nth lesson where N = 2 or 3 (kind: "quiz", timing:
  "after", purpose: "checkpoint", expectedItemCount: 4-6).
- Unit exam at every unit boundary EXCEPT the final unit (kind: "exam",
  timing: "after-unit", purpose: "checkpoint", expectedItemCount: 8-12).
- Final exam after the final unit (kind: "exam", timing: "after-course",
  purpose: "checkpoint", expectedItemCount: 12-20).

You are NOT authoring items at this stage. Items are filled in later by
the tutor or a configurator. Schedule the slot; describe what it should
test in `rationale`.
```

**Implementation Notes**:
- The prompt change alone is roughly 60 new lines but it's the
  highest-leverage part of the design — it's what produces a real
  course rather than a flat list.
- The numeric ranges are deliberately loose. The explorer is allowed to
  deviate when the material is unusual; `rationale` captures why.
- We update the explorer's tool registry to expose the new draft-mutation
  tools (Unit 13).

**Acceptance Criteria**:
- [ ] Running the explorer on a 12-chapter algebra textbook produces a
      `ProposedCourse` with at least 3 units, at least 1 midterm-like
      summative, and homework slots after every lesson.
- [ ] Running on a 4-chapter primer produces a smaller course with
      proportionally fewer assessments — never zero summatives, but at
      least a final.
- [ ] All scheduled `ProposedAssessment.conceptNames` resolve to
      concepts proposed in the same draft (validation step in the
      explorer-side tools).

---

### Unit 13: Explorer draft-mutation tools

**File**: `packages/tools/src/bootstrap/draft-add-unit.ts`

```typescript
export const draftAddUnitTool: ToolDefinition = {
  name: "course.draft_add_unit",
  description:
    "Group draft lessons into a unit. Optionally attach a summative assessment. Lessons referenced must already exist in the draft.",
  inputSchema: z.object({
    draftId: z.string(),
    name: z.string().min(1),
    summary: z.string().optional(),
    draftLessonIds: z.array(z.string()).min(1),
    summative: z
      .object({
        kind: z.enum(["quiz", "homework", "exam"]),
        title: z.string(),
        conceptNames: z.array(z.string()).min(1),
        expectedItemCount: z.number().int().min(1).max(50).optional(),
        rationale: z.string(),
      })
      .optional(),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    draftUnitId: z.string(),
  }),
  effects: ["artifact.mutate"],
  tier: "model-derived",
  handler: async (input, ctx) => {
    return ctx.services.bootstrap.draftAddUnit(input);
  },
};

export const draftSetAssessmentPlanTool: ToolDefinition = {
  name: "course.draft_set_assessment_plan",
  description: "Declare the overall assessment scaffold shape for the course.",
  inputSchema: z.object({
    draftId: z.string(),
    plan: AssessmentPlanSchema,
  }),
  outputSchema: z.object({ ok: z.literal(true) }),
  effects: ["artifact.mutate"],
  tier: "model-derived",
  handler: async (input, ctx) => {
    return ctx.services.bootstrap.draftSetAssessmentPlan(input);
  },
};

export const draftAddLessonAssessmentTool: ToolDefinition = {
  name: "course.draft_add_lesson_assessment",
  description: "Schedule a per-lesson assessment.",
  inputSchema: z.object({
    draftId: z.string(),
    draftLessonId: z.string(),
    kind: z.enum(["quiz", "homework", "exam"]),
    timing: z.enum(["before", "after", "interleaved"]),
    purpose: z.enum(["readiness", "practice", "checkpoint"]),
    conceptNames: z.array(z.string()).min(1),
    expectedItemCount: z.number().int().min(1).max(50).optional(),
    rationale: z.string(),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    draftAssessmentId: z.string(),
  }),
  effects: ["artifact.mutate"],
  tier: "model-derived",
  handler: async (input, ctx) => {
    return ctx.services.bootstrap.draftAddLessonAssessment(input);
  },
};
```

**File**: `packages/core/src/services/bootstrap-service.ts` (additions)

```typescript
class BootstrapServiceImpl implements BootstrapService {
  // ... existing ...

  draftAddUnit(input: { /* see schema */ }): { draftUnitId: string };
  draftSetAssessmentPlan(input: { draftId: string; plan: AssessmentPlan }): void;
  draftAddLessonAssessment(input: { /* see schema */ }): { draftAssessmentId: string };

  // Validation: each method asserts referenced draftLessonIds /
  // conceptNames exist in the in-memory draft. Fail fast with a clear
  // error — this is data the model has already proposed; we don't
  // tolerate references to non-existent draft entities.
}
```

**Acceptance Criteria**:
- [ ] All three tools are registered in the explorer's scoped tool
      registry; bootstrap mode does NOT see them (those are explorer-only).
- [ ] Calling `draft_add_unit` with an unknown `draftLessonId` returns a
      clear validation error.
- [ ] After all three tools have been called, `draft_finalize` produces
      a `ProposedCourse` with non-empty `proposedUnits` and a populated
      `assessmentPlan`.

---

### Unit 14: persistDraft — materialise units + assessment shells

**File**: `packages/core/src/services/bootstrap-service.ts` (persistDraft extension)

```typescript
async function persistDraft(input: {
  db: PraxisDb;
  draft: DraftCourseState;
  log: Logger;
}): Promise<{ courseId: CourseId; lessonIds: LessonId[]; conceptGraphId: ConceptGraphId }> {
  // ... existing concept / edge / course / lesson / gate creation ...

  // NEW: materialise units + assessments inside the same transaction.
  const draftUnitIdToUnitId = new Map<string, UnitId>();
  for (const [i, proposedUnit] of input.draft.proposed.proposedUnits.entries()) {
    const unitId = brandId<"UnitId">(uuidv7());
    draftUnitIdToUnitId.set(proposedUnit.draftUnitId, unitId);

    db.insert(courseUnits).values({
      id: unitId,
      courseId,
      name: proposedUnit.name,
      summary: proposedUnit.summary ?? null,
      orderIndex: i,
      summativeAssignmentId: null,  // filled below if present
    }).run();

    // Bind lessons to unit
    for (const draftLessonId of proposedUnit.draftLessonIds) {
      const lessonId = draftLessonIdToLessonId.get(draftLessonId);
      if (!lessonId) throw new Error(`unit refs unknown lesson: ${draftLessonId}`);
      db.insert(lessonUnits).values({ lessonId, unitId }).run();
    }

    // Materialise summative as an Assignment shell
    if (proposedUnit.summative) {
      const summativeId = await materializeAssessmentShell({
        db,
        courseId,
        kind: proposedUnit.summative.kind,
        title: proposedUnit.summative.title,
        conceptNames: proposedUnit.summative.conceptNames,
        nameToConceptId,
      });
      db.update(courseUnits)
        .set({ summativeAssignmentId: summativeId })
        .where(eq(courseUnits.id, unitId))
        .run();
    }
  }

  // NEW: per-lesson assessments
  for (const proposedAssessment of input.draft.proposed.lessonAssessments ?? []) {
    const assignmentId = await materializeAssessmentShell({
      db,
      courseId,
      kind: proposedAssessment.kind,
      title: proposedAssessment.title,
      conceptNames: proposedAssessment.conceptNames,
      nameToConceptId,
    });
    const lessonId = draftLessonIdToLessonId.get(proposedAssessment.draftLessonId);
    if (!lessonId) throw new Error(`assessment refs unknown lesson`);
    db.insert(lessonAssessments).values({
      id: brandId<"LessonAssessmentId">(uuidv7()),
      lessonId,
      assignmentId,
      timing: proposedAssessment.timing,
      purpose: proposedAssessment.purpose,
    }).run();
  }

  // NEW: serialize the assessment plan onto the course row
  if (input.draft.proposed.assessmentPlan) {
    db.update(courses)
      .set({ assessmentPlanJson: input.draft.proposed.assessmentPlan })
      .where(eq(courses.id, courseId))
      .run();
  }

  return { courseId, lessonIds, conceptGraphId };
}

async function materializeAssessmentShell(input: {
  db: PraxisDb;
  courseId: CourseId;
  kind: "quiz" | "homework" | "exam";
  title: string;
  conceptNames: string[];
  nameToConceptId: Map<string, ConceptId>;
}): Promise<AssignmentId> {
  const conceptIds = input.conceptNames.map((n) => {
    const id = input.nameToConceptId.get(n);
    if (!id) throw new Error(`assessment refs unknown concept: ${n}`);
    return id;
  });
  const assignmentId = brandId<"AssignmentId">(uuidv7());
  input.db.insert(assignments).values({
    id: assignmentId,
    courseId: input.courseId,
    kind: input.kind,
    title: input.title,
    itemsJson: [],                  // shell — items added later
    conceptIdsJson: conceptIds,
    assignedAt: new Date(),
    submittedAt: null,
    gradeJson: null,
    parentSessionId: null,
    parentCallId: null,
  }).run();
  return assignmentId;
}
```

**Implementation Notes**:
- "Shell" assignments have empty items. The UI must handle this state:
  in the course detail view, render shells with a "draft — not yet
  authored" badge; in a tab, render a placeholder ("the tutor or
  configurator hasn't added items to this assignment yet — come back
  later"). The flow assumes a tutor will pick up the shells and author
  items as the student progresses.
- Why shells instead of just metadata? Because the lesson can already
  reference the assignment by ID (via `lesson_assessments.assignmentId`),
  the configurator can fill items via the existing `assignment.create`
  retake-style flow, and the data shape matches submitted assignments
  exactly — no special-case "scheduled assessment" type.
- Wrap the entire persistDraft block in a single transaction so partial
  failures don't leave half-built courses behind.

**Acceptance Criteria**:
- [ ] After `confirmDraft`, the course has populated `course_units`,
      `lesson_units`, and `lesson_assessments` rows matching the
      proposal.
- [ ] Every `proposedUnit.summative` produces an Assignment shell row
      with `items: []` and `submittedAt: null`.
- [ ] `courses.assessmentPlanJson` is non-null.
- [ ] If any concept name in any assessment fails to resolve, the entire
      `confirmDraft` rolls back (transaction integrity).

---

### Unit 15: Teach mode prompt — when to author assessments

**File**: `packages/curriculum/src/modes/fragments/role.ts`

Replace the spartan `roleFragment` with a longer one that explicitly
addresses authoring:

```typescript
export const roleFragment: PromptFragment = {
  id: "role.tutor",
  position: "role",
  customizable: true,
  template: `You are a patient, curious tutor. You are willing to be wrong, willing to wait, and willing to ask the student to try first.

Authoring assessments is part of teaching, not a separate mode:
- After you've worked through 1-2 examples on a concept and the student is engaging, author a short quiz (2-3 items) to give them retrieval practice on what they just saw. Use \`assignment.create\` with kind: "quiz".
- After a lesson's content is largely covered, author homework (5-8 items spanning the lesson's concepts) so the student can practice independently. Use kind: "homework". Add workRubric on multi-step items.
- At unit boundaries (when course.current_concept reports the next unit is starting), check whether the unit has a scheduled summative assessment shell. If it does and items aren't authored yet, author them now using assignment.create — the system already knows it's a unit exam.
- Never author an assignment without a clear pedagogical reason. The student's tab strip is precious.

When you author an assignment, the student's UI automatically opens a tab in the right modality. Tell them you've done so ("I just put a quiz in your tabs — open it whenever you're ready") and continue the lesson; they'll come back to you when they submit. You'll receive a system note with their grade and per-item feedback when they submit; narrate it warmly and ask if they want to revisit anything before continuing.`,
};
```

**Implementation Notes**:
- The principles are intentionally written as situational triggers
  ("after 1-2 examples", "at unit boundaries") rather than rigid rules
  the tutor must follow. The model has latitude.
- The closing paragraph is the most important: it tells the model
  *what to expect* when a system_note arrives. Without this, models can
  be confused by a system message appearing mid-conversation.

**Acceptance Criteria**:
- [ ] In a teach session with a real model, after a worked example
      sequence the tutor calls `assignment.create` of its own accord at
      least 50% of the time (manual qualitative check; not a unit test).
- [ ] When a `system_note` with `kind: "assignment_submission"` arrives,
      the tutor's response references the submitted item count and at
      least one specific item's feedback (snapshot test of episodic
      events with a fake engine).

---

## Implementation Order

1. **Unit 1** (Schema additions) — strict prerequisite for everything else.
2. **Unit 2** (Domain types + EngineEvent extension) — every later unit imports these.
3. **Unit 3** (SessionService.notifySession + spawnFromAssignment) — the core mechanism the rest depends on.
4. **Unit 4** (AssignmentService.submit notification) — uses Unit 3.
5. **Unit 5** (assignment.create captures parent session) — uses Unit 1 + 4.
6. **Unit 9** (clarification tool) — independent; lands here so exam mode is wired before its UI.
7. **Unit 12** (Bootstrap explorer prompt rules) — pure prompt change; no code.
8. **Unit 13** (Explorer draft-mutation tools) — uses Unit 2 types.
9. **Unit 14** (persistDraft extension) — uses Units 1, 2, 13.
10. **Unit 7** (Per-mode tab body components) — uses Unit 5 + 9.
11. **Unit 8** (SidekickPanel + ClarificationPill) — used by Unit 7.
12. **Unit 6** (Renderer-side spawn) — wires everything together.
13. **Unit 10** (Mode-aware composer chips) — polish on Unit 7.
14. **Unit 11** (Activity rail entry kinds) — polish on Units 4, 5, 6.
15. **Unit 15** (Teach mode prompt) — last; takes effect immediately on next teach session.

---

## Testing

### Unit Tests

#### `packages/core/src/services/__tests__/session-service.notify.test.ts`

- Notify an active session → verify synthetic turn fires + system_note
  appears in episodic events + model_message follows.
- Notify an idle session → verify episodic-only write; no synthetic
  turn; next `send()` includes system_note in `priorTurns`.
- Notify a non-existent session → returns clean error without partial
  episodic write.
- Notify with a `FakeEngine` that records the role of each `send()`
  call → verify the role is "system" when the engine adapter supports
  it; "user" with `[Praxis] ` prefix when it doesn't.

#### `packages/core/src/services/__tests__/assignment-service.submit-notify.test.ts`

- Submit an assignment with a parent session → verify a system_note is
  appended to that session's episodic events with the right grade and
  per-item structure.
- Submit an assignment with no parent session → verify no notify call.
- Submit an assignment whose parent session was already ended →
  verify graceful no-op (notify-to-ended-session is logged + skipped).
- Activity rail receives `assignment.submitted` with correct payload.

#### `packages/core/src/services/__tests__/bootstrap-service.persist-units.test.ts`

- Confirm a draft with units + assessment plan → all rows materialise;
  course.assessmentPlanJson is correct; lessonUnits join is correct.
- Confirm a draft with a unit summative → the assignment shell exists
  and the unit row's `summativeAssignmentId` points to it.
- Confirm a draft with a per-lesson assessment → lessonAssessments row
  exists; assignment shell has items: [].
- Confirm a draft where a referenced concept name doesn't resolve →
  whole transaction rolls back; no half-built course.

#### `packages/curriculum/src/bootstrap/__tests__/explorer.assessments.test.ts`

- Run the explorer with a fake tool registry against a faux 12-chapter
  textbook → assert the resulting draft has ≥3 units, ≥1 summative, and
  homework slots after every lesson.
- Run on a 4-chapter primer → assert the draft has 1-2 units and a
  final exam slot.
- Validation: explorer cannot add a unit referencing an unknown lesson
  (asserted via tool error in the explorer's transcript).

#### `packages/tools/src/exam/__tests__/clarification.test.ts`

- Tool dispatch from exam mode succeeds.
- Tool dispatch from quiz / homework / teach mode is rejected by
  `mode.toolNames` filtering.

#### `packages/ui/src/components/__tests__/quiz-tab-body.test.tsx`

- Renders one item at a time; `Space` advances; `1`-`4` rate confidence.
- Sidekick panel toggles on `?`; closes on `Esc`.
- After submit, feedback overlays each item card.

#### `packages/ui/src/components/__tests__/exam-tab-body.test.tsx`

- No chat thread visible.
- Clicking the clarification pill opens a one-shot prompt; submitting
  fires the `clarification` tool.
- Submit confirmation modal blocks accidental submission.

#### `packages/ui/src/components/__tests__/use-assignment-issued-spawn.test.tsx`

- Mount the hook with a mock activity stream; emit
  `assignment.issued` → verify `client.session.spawnFromAssignment` is
  called and a tab is opened.
- Idempotent: emitting the same event twice does not open two tabs.

### Integration tests

#### `tests/teach-driven-assessment-loop.test.ts`

A multi-step end-to-end test using a `FakeEngine` for both parent and
child sessions:

1. Open a teach session.
2. Tutor calls `assignment.create` with a 3-item quiz.
3. Verify activity rail received `assignment.issued`.
4. Mock the renderer-side spawn → call `spawnFromAssignment`.
5. Verify a child session exists with `parent_session_id` set.
6. Submit the child quiz with mocked responses.
7. Verify the parent session's episodic events include a `system_note`
   with the grade summary.
8. Verify the activity rail receives `assignment.submitted`.
9. Send a follow-up message in the parent session → verify the
   tutor's response references at least one item from the quiz.

---

## Verification Checklist

```
pnpm typecheck
pnpm lint
pnpm test
pnpm db:generate           # confirm migration generates from schema
pnpm db:migrate            # confirm migration applies cleanly
```

Manual smoke (after implementation):

```
1. pnpm dev:reset
2. pnpm dev → bootstrap a course from a small algebra textbook.
3. Confirm the resulting course has units + per-lesson homework + a final.
4. Open the course; start a teach session on lesson 1.
5. Work through 1 example with the tutor.
6. Ask: "I'd like to try a quiz". The tutor should call assignment.create.
7. Verify a quiz tab appears in the strip without focus stealing.
8. Open it; complete the quiz; submit.
9. Switch back to the teach tab.
10. Verify the tutor has narrated per-item feedback.
11. Open the activity rail history; confirm assignment.issued and
    assignment.submitted entries are present and faded after their
    linger periods.
```

---

## Out of scope (revisit later)

- Backfilling units / assessment plans onto already-shipped courses.
- Calendar pacing UI (showing "this homework is due Tuesday").
- Configure-mode tooling for editing the assessment plan after bootstrap
  (e.g. "delete the midterm", "move the final earlier"). Today the plan
  is read-only post-bootstrap; configurators can still author items into
  shells via existing `assignment.create` flow.
- Cross-course summatives.
- Any agent-driven re-scheduling of assessments based on student
  performance (e.g. "you're not ready for the unit exam — let's add
  another homework first"). The data model supports it; the loop doesn't
  yet drive it.
