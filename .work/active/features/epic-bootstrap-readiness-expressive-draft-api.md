---
id: epic-bootstrap-readiness-expressive-draft-api
kind: feature
stage: review
tags: [bootstrap, course-authoring]
parent: epic-bootstrap-readiness
depends_on: [epic-bootstrap-readiness-durable-drafts]
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Expressive draft-editing API

## Brief

`course.edit_draft` today is expressive enough to build a draft from
scratch (`add_concept`, `add_lesson`, etc.) but not expressive enough to
*refactor* one. Two real-session failure modes prove this:

1. **Silent no-ops and unrelinkable concepts.** `add_concept` is a silent
   no-op when the concept name already exists — no warning, no relink,
   the call appears to succeed. With no "link existing concept to a
   different lesson" op and no `add_edge` op exposed through `edit_draft`,
   removing a lesson orphans its concepts and there's no recovery path
   inside the tool. Mastery tracking for the orphaned concept silently
   breaks. (See `idea-course-edit-draft-api-gaps` for the merged-lesson
   transcript that surfaced this.)
2. **Non-cascading removes.** `remove_lesson` doesn't cascade-clean unit
   memberships or lesson assessments, so deleting a lesson leaves four
   units and five assessments pointing at the dead id and
   `course.confirm_draft`'s validation rejects the draft. The documented
   workaround — re-run `course.start_exploration` on the same draft —
   costs 30-90s per cleanup pass. (See
   `idea-bootstrap-draft-edit-and-query-apis`.)

This feature expands the `DraftEditOp` union and the `BootstrapServiceImpl`
edit handler to make non-trivial refactors actually tractable from the
agent's chat:

- **Idempotent / loud-failing `add_concept`** — repeat calls with an
  existing name either succeed-as-no-op with a clear `alreadyExisted:
  true` signal in the result, or fail loudly with a structured error the
  model can read. Pick during design.
- **`relink_concept` op** — change which lesson owns an existing concept
  without losing its prerequisite edges.
- **`add_edge` op inside `edit_draft`** — the underlying
  `course.draft_add_edges` tool already exists in the registry
  (`packages/tools/src/course/draft-add-edges.ts`) but isn't reachable
  through the in-flight edit path. Add the op so cascade-recoveries can
  rebuild edges after destructive cleanups.
- **Cascade-clean on `remove_lesson` / `remove_unit`** — when a lesson is
  removed, drop its memberships from units and remove its assessments in
  the same op. Removing a unit cascades to its lessons. Either the cascade
  is implicit (one op, multi-row update) or the op returns a structured
  preview the agent can confirm before applying — choose during design.
- **`validate_draft` op** — explicit pre-confirm pass that lists orphan
  concepts, dangling unit memberships, lesson assessments pointing at
  removed lessons, and any other invariant violations. Today the validator
  only runs at confirm time; surfacing it via `edit_draft` lets the agent
  self-correct before the human sees a rejection.
- **Chunked query / progressive disclosure** — `course.show_draft` today
  returns the entire graph, which gets unwieldy at 26 lessons / 8 units
  / 95 edges. Add narrower queries: `list_units`, `list_lessons_in_unit`,
  `get_lesson_detail`, `list_dangling_refs`. The agent can reason about
  parts without re-reading the whole graph every turn.

This feature does NOT change where drafts are persisted (that's
`epic-bootstrap-readiness-durable-drafts`, which must land first), does
NOT touch the explorer agent's tool registry (the explorer has its own
non-edit_draft tool set), and does NOT change the `course.confirm_draft`
materialisation path — same `persistDraft` semantics, just easier to
arrive at a clean draft before calling it.

## Epic context
- Parent epic: `epic-bootstrap-readiness`
- Position in epic: consumer of `durable-drafts`. The new ops mutate the
  same draft store; landing them on the persistent store directly avoids
  retrofitting Map→SQLite later.

## Foundation references
- `docs/ARCHITECTURE.md:331-335` — bootstrap-mode mechanics.
- `docs/CONTRACT.md:1258-1260` — current draft tool listing (will need a
  roll-forward as ops land).
- `packages/tools/src/course/edit-draft.ts` — `DraftEditOp` union schema;
  primary surface to extend.
- `packages/core/src/services/bootstrap-service.ts:492` — `editDraft`
  dispatcher.
- `packages/tools/src/course/draft-add-edges.ts` — existing add-edges
  tool, reachable today only outside `edit_draft`. Either fold or
  re-expose.

## Originating backlog
- `idea-course-edit-draft-api-gaps` — consumed by this feature; will be
  removed from `.work/backlog/` as part of epic-design.
- `idea-bootstrap-draft-edit-and-query-apis` — consumed by this feature;
  will be removed from `.work/backlog/` as part of epic-design.

## Architectural choice

**Extend `DraftEditOp` with the missing ops + change `applyEdit` to return
`{ state, warnings[] }` + add four new top-level read tools for chunked
queries.** No new service, no replaced abstraction — the existing
`BootstrapServiceImpl.editDraft → applyEdit` path stays the single
dispatch point for mutations; the union grows; the result shape gains a
`warnings` field; chunked reads land as new top-level tools alongside
`course.show_draft` (which stays for whole-draft views).

Alternatives considered:

- **New facade service `DraftEditor` wrapping `BootstrapServiceImpl`.**
  Cleaner separation of concerns on paper, but: every method just delegates;
  there's only one consumer (the `course.edit_draft` tool); facade adds
  indirection without value. Rejected.
- **Replace `course.edit_draft` (one-op) with one-tool-per-op (mirror the
  explorer's `course.draft_add_*` tools).** The explorer tools already do
  this for the batch-construct path. But `course.edit_draft` is the
  *in-flight* path for the tutor — keeping it as one tool with an op-union
  means the tutor can sequence many edits without a tool-list explosion in
  its prompt. Rejected.
- **Per-edit Zod schemas tied to per-op handler functions** (rather than a
  shared `applyEdit` discriminator). Each op gets its own handler with
  exact input typing. Marginally cleaner per-op code, more files, similar
  total complexity. Rejected — the current pattern's exhaustive switch
  surfaces missing-case errors at compile time, which we want to preserve.

The `applyEdit` return shape change from `ProposedCourse` to
`{ state: ProposedCourse; warnings?: string[] }` is the small public-API
shift the feature carries. The `course.edit_draft` tool surfaces
`warnings` in its output so the model sees signals like "concept
'completing the square' already exists; no new concept was added" or
"removed lesson 5 also dropped 2 unit memberships and 3 lesson
assessments." The model can read and act on those.

The four chunked-read tools (`course.list_units`,
`course.list_lessons_in_unit`, `course.get_lesson_detail`,
`course.list_dangling_refs`) are pure reads against the active draft.
They live alongside `course.show_draft` (which stays for the
whole-draft case). The tutor uses chunked reads on large drafts to
reason about parts without dragging the full graph into context every
turn.

## Implementation Units

### Unit 1: New edit-ops on `DraftEditOp` union

**Files**:
- `packages/tools/src/course/edit-draft.ts` — Zod discriminator extension + output `warnings` field
- `packages/core/src/types/` — `DraftEditOp` TypeScript union extension (find via `grep -rn "type DraftEditOp\|DraftEditOp =" packages/core/src/types/`)
- `packages/core/src/services/bootstrap-service.ts` — `applyEdit` new cases

**Story**: `story-epic-bootstrap-readiness-expressive-draft-api-edit-ops`

New variants and behavior changes:

```typescript
// New variants on DraftEditOp:

| { kind: "relink-concept";
    conceptName: string;
    lessonIndex: number;        // destination lesson; -1 to unparent (orphan)
    afterConceptIndex?: number; // insertion position in destination
  }
| { kind: "add-edge";
    fromName: string;
    toName: string;
    strength: number;           // 0..1
    rationale?: string;
  }
| { kind: "remove-unit";
    draftUnitId: string;        // cascade: also remove the unit's lesson memberships
  }
| { kind: "validate-draft" }    // no input args; returns issues via warnings

// Modified variants:

// add-concept: existing-name path returns a warning instead of silent merge.
//   Behavior: if the name exists, do NOT add a new concept node, do NOT
//   modify the lesson's conceptNames; instead push a warning string into
//   the result. The model sees the warning and can choose to relink-concept.

// remove-lesson: cascade-clean unit memberships and lesson assessments.
//   Behavior: drop the lesson; remove its draftLessonId from every unit's
//   draftLessonIds array; drop every proposedLessonAssessment whose
//   draftLessonId points at the removed lesson; push a one-line summary
//   warning describing what cascaded.
```

`applyEdit` signature change:

```typescript
// BEFORE:
function applyEdit(p: ProposedCourse, op: DraftEditOp): ProposedCourse

// AFTER:
interface EditResult {
  state: ProposedCourse;
  warnings: readonly string[];
}
function applyEdit(p: ProposedCourse, op: DraftEditOp): EditResult
```

The `BootstrapServiceImpl.editDraft` method returns the new draft state and
the warnings flow up to the tool. The tool's `OutputSchema` gains:

```typescript
const OutputSchema = z.object({
  ok: z.literal(true),
  draftId: z.string(),
  summary: z.object({ … }),
  warnings: z.array(z.string()).optional(),
});
```

**Cascade-clean specifics for `remove-lesson`**:

When a lesson at `lessonIndex` is removed:
1. Capture its `draftLessonId` before splicing.
2. Splice the lesson out of `proposedLessons`.
3. For every `proposedUnits[i]`, filter `draftLessonIds` to exclude the
   removed id. If a unit ends up empty (zero lessons), keep it (the user
   may want to add lessons later) but warn.
4. For every `proposedLessonAssessments[i]`, drop entries whose
   `draftLessonId` matches the removed id.
5. Concatenate counts into a warning: `"removed lesson 'Foo' (id …);
   also dropped: 2 unit-membership refs, 3 lesson assessments"`.

**Cascade-clean for `remove-unit`**:

When a unit is removed, drop the unit row. Its summative (if any) goes
with it. Per-lesson assessments under the unit's lessons are NOT
touched. Warn with the unit name and lesson-count it contained.

**`validate-draft` op behavior**:

Calls the existing `validateProposed(p: ProposedCourse): Issue[]` helper
(already at file scope in `bootstrap-service.ts`). Converts issues into
warning strings prefixed with the issue `kind`:
`"unknown_concept_in_lesson: lesson 'Foo' references unknown concept
'Bar'"`. Returns the same draft state untouched plus the warnings.

**`add-concept` warning shape**:

Today (line 882-887 of `bootstrap-service.ts`):
```typescript
case "add-concept": {
  const known = new Set(p.proposedConcepts.map((c) => c.name));
  if (known.has(op.name)) {
    // Design says: silently merge (no error) for duplicate name — just skip adding.
    return p;
  }
  // … add the new concept …
}
```

New:
```typescript
case "add-concept": {
  const known = new Set(p.proposedConcepts.map((c) => c.name));
  if (known.has(op.name)) {
    return {
      state: p,
      warnings: [
        `concept '${op.name}' already exists in the draft; no new concept was added. ` +
        `Use relink-concept if you want to associate it with lesson ${op.lessonIndex}.`,
      ],
    };
  }
  // … add the new concept; warnings: [] …
}
```

**`relink-concept` op behavior**:

Move an existing concept's lesson membership. Concept-node and edges
unchanged.
1. If `lessonIndex === -1`: remove the concept name from every lesson's
   `conceptNames` array (orphan in the prereq graph but not in any lesson).
2. Otherwise: same as (1) plus insert the concept name in the destination
   lesson's `conceptNames` at `afterConceptIndex + 1` (or end if undefined).
3. Warn if the concept didn't exist (no-op).

**`add-edge` op behavior**:

Mirrors the existing `BootstrapService.addEdge` method (line 247-278) but
inside the edit_draft pipeline. Validates both concepts exist; rejects
self-edges; rejects duplicates. Throws on validation failure (the model
can catch via the existing tool-error path).

**Implementation Notes**:
- The discriminated-union exhaustiveness check at the end of `applyEdit`
  catches any forgotten variant at compile time. Don't bypass it.
- Cascade tests should pin behavior: before-merge state with N units, M
  lessons; after `remove-lesson` of one referenced lesson, verify unit
  memberships and lesson assessments are correctly cleaned.

**Acceptance**:
- [ ] `DraftEditOp` Zod discriminator includes `relink-concept`,
      `add-edge`, `remove-unit`, `validate-draft`.
- [ ] `applyEdit` returns `{ state, warnings[] }`.
- [ ] `add-concept` on an existing name returns the original state with a
      single warning; tests pin the warning text.
- [ ] `remove-lesson` cascade-cleans `proposedUnits[*].draftLessonIds`
      and `proposedLessonAssessments` referencing the removed id;
      warns with cleanup counts.
- [ ] `remove-unit` removes the unit (and its summative); warns with
      lesson-count.
- [ ] `validate-draft` returns the draft state unchanged plus warnings
      enumerating any issue from `validateProposed`.
- [ ] `relink-concept` with `lessonIndex >= 0` moves the concept name;
      with `lessonIndex === -1` orphans it. Concept node + edges
      unchanged either way.
- [ ] `add-edge` validates both endpoints exist, rejects self-edges and
      duplicates; throws on failure.
- [ ] `course.edit_draft` tool output schema gains optional `warnings`
      field; tool returns them to the model.
- [ ] No existing edit op's behavior regresses (rename-*, reorder-*,
      add-lesson, rename-concept, remove-concept, set-thresholds tests
      all pass).

---

### Unit 2: Chunked-query tools

**Files** (all new):
- `packages/tools/src/course/list-units.ts` — `course.list_units`
- `packages/tools/src/course/list-lessons-in-unit.ts` — `course.list_lessons_in_unit`
- `packages/tools/src/course/get-lesson-detail.ts` — `course.get_lesson_detail`
- `packages/tools/src/course/list-dangling-refs.ts` — `course.list_dangling_refs`
- `packages/tools/src/course/index.ts` (modify) — export the four new tools
- `packages/tools/src/index.ts` (modify) — register in default tools array
- `packages/curriculum/src/modes/bootstrap.ts` (modify) — add to toolNames
- `packages/curriculum/src/modes/configure.ts` (modify) — add to toolNames
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` (modify) —
  document the four new tools
- `packages/core/src/services/bootstrap-service.ts` (modify) — new public
  methods backing the tools

**Story**: `story-epic-bootstrap-readiness-expressive-draft-api-query-tools`

```typescript
// course.list_units
const ListUnitsInput = z.object({ draftId: z.string() });
const ListUnitsOutput = z.object({
  units: z.array(z.object({
    draftUnitId: z.string(),
    name: z.string(),
    summary: z.string().optional(),
    lessonCount: z.number().int().nonnegative(),
    hasSummative: z.boolean(),
  })),
});

// course.list_lessons_in_unit
const ListLessonsInUnitInput = z.object({
  draftId: z.string(),
  draftUnitId: z.string(),
});
const ListLessonsInUnitOutput = z.object({
  draftUnitId: z.string(),
  unitName: z.string(),
  lessons: z.array(z.object({
    draftLessonId: z.string(),
    title: z.string(),
    conceptCount: z.number().int().nonnegative(),
    assessmentCount: z.number().int().nonnegative(),
  })),
});

// course.get_lesson_detail
const GetLessonDetailInput = z.object({
  draftId: z.string(),
  draftLessonId: z.string(),
});
const GetLessonDetailOutput = z.object({
  draftLessonId: z.string(),
  title: z.string(),
  conceptNames: z.array(z.string()),
  assessments: z.array(z.object({
    draftAssessmentId: z.string(),
    kind: z.enum(["quiz", "homework", "exam"]),
    timing: z.enum(["before", "after", "interleaved"]),
    purpose: z.enum(["readiness", "practice", "checkpoint"]),
    title: z.string(),
  })),
  parentUnit: z.object({
    draftUnitId: z.string(),
    name: z.string(),
  }).nullable(),
});

// course.list_dangling_refs
const ListDanglingRefsInput = z.object({ draftId: z.string() });
const ListDanglingRefsOutput = z.object({
  orphanConcepts: z.array(z.string()),
    // concepts in the graph that no lesson references
  danglingUnitMemberships: z.array(z.object({
    draftUnitId: z.string(),
    unitName: z.string(),
    badLessonIds: z.array(z.string()),
  })),
  danglingLessonAssessments: z.array(z.object({
    draftAssessmentId: z.string(),
    badLessonId: z.string(),
  })),
  edgesReferencingUnknownConcepts: z.array(z.object({
    fromName: z.string(),
    toName: z.string(),
  })),
});
```

**Service methods on `BootstrapServiceImpl`** (mirror the pattern of
existing methods that take `draftId` and return data shapes):

```typescript
async listUnits(draftId: string): Promise<UnitListEntry[] | null>
async listLessonsInUnit(input: { draftId; draftUnitId }): Promise<LessonsInUnit | null>
async getLessonDetail(input: { draftId; draftLessonId }): Promise<LessonDetail | null>
async listDanglingRefs(draftId: string): Promise<DanglingRefsReport | null>
```

Each returns `null` if the draft is not found (consistent with
`showDraft`). Each calls `this.store.load(draftId)` then computes the
projection from the loaded `DraftCourseState`.

**`listDanglingRefs` logic**:

```typescript
async listDanglingRefs(draftId: string): Promise<DanglingRefsReport | null> {
  const d = this.store.load(draftId);
  if (!d) return null;
  const p = d.proposed;

  // Orphan concepts: in proposedConcepts but referenced by zero lessons.
  const conceptsInLessons = new Set<string>();
  for (const lesson of p.proposedLessons) {
    for (const cn of lesson.conceptNames) conceptsInLessons.add(cn);
  }
  const orphanConcepts = p.proposedConcepts
    .filter((c) => !conceptsInLessons.has(c.name))
    .map((c) => c.name);

  // Dangling unit memberships: unit's draftLessonIds not in proposedLessons.
  const knownLessonIds = new Set(p.proposedLessons.map((l) => l.draftLessonId));
  const danglingUnitMemberships = (p.proposedUnits ?? [])
    .map((u) => ({
      draftUnitId: u.draftUnitId,
      unitName: u.name,
      badLessonIds: u.draftLessonIds.filter((id) => !knownLessonIds.has(id)),
    }))
    .filter((u) => u.badLessonIds.length > 0);

  // Dangling lesson assessments: assessment's draftLessonId not in proposedLessons.
  const danglingLessonAssessments = (p.proposedLessonAssessments ?? [])
    .filter((la) => !knownLessonIds.has(la.draftLessonId))
    .map((la) => ({
      draftAssessmentId: la.draftAssessmentId,
      badLessonId: la.draftLessonId,
    }));

  // Edges referencing unknown concepts.
  const knownConcepts = new Set(p.proposedConcepts.map((c) => c.name));
  const edgesReferencingUnknownConcepts = p.proposedEdges
    .filter((e) => !knownConcepts.has(e.fromName) || !knownConcepts.has(e.toName))
    .map((e) => ({ fromName: e.fromName, toName: e.toName }));

  return {
    orphanConcepts,
    danglingUnitMemberships,
    danglingLessonAssessments,
    edgesReferencingUnknownConcepts,
  };
}
```

**Implementation Notes**:
- Tool tier: `"grounded"` for all four (deterministic projection of the
  in-memory draft).
- All four tools share an "draft not found" handler shape: return an
  output with empty arrays + a single warning string. Or, alternatively,
  the tool throws a recognizable error and the model sees it via the
  tool-error path. Pick one and use it consistently. Prefer the "return
  empty + warning" pattern since `course.list_*` tools shouldn't fail-hard.
- Prompt fragment listing: append four short bullets to
  `bootstrapToolsFragment` and `configureToolsFragment` describing each
  tool one-line.

**Acceptance**:
- [ ] All four tools exist with schemas matching the design above.
- [ ] Each is reachable via `registry.dispatch(...)`.
- [ ] Each tool is in `bootstrapMode.toolNames` and `configureMode.toolNames`.
- [ ] `bootstrapToolsFragment` (and configure equivalent) lists each tool
      with a one-line description.
- [ ] `BootstrapServiceImpl` has `listUnits`, `listLessonsInUnit`,
      `getLessonDetail`, `listDanglingRefs` public methods.
- [ ] Each method returns `null` (or empty + warning) for unknown draftId.
- [ ] `listDanglingRefs` correctly identifies orphan concepts (in graph,
      not in any lesson), dangling unit memberships, dangling lesson
      assessments, and edges with unknown endpoints.
- [ ] Tests cover happy path + draft-not-found + dangling-refs scenarios.

## Implementation Order

Two stories with one dep edge (Story B depends on Story A):

1. **Story A** (`expressive-draft-api-edit-ops`): Unit 1 — DraftEditOp
   extensions + cascade behavior + `applyEdit` return-shape change +
   tool output `warnings` field. No deps. Lands first; touches the
   shared `bootstrap-service.ts` file.
2. **Story B** (`expressive-draft-api-query-tools`): Unit 2 — four
   chunked-read tools + service projections + mode/prompt wiring.
   Depends on Story A so the orchestrator schedules it after, avoiding
   merge conflicts on `bootstrap-service.ts`.

## Testing

### Story A tests
- `packages/core/src/__tests__/bootstrap-service.test.ts` (extend):
  each new op (relink-concept, add-edge, remove-unit, validate-draft)
  gets happy-path tests; the modified add-concept gets a duplicate-name
  test asserting the warning text; remove-lesson gets a cascade-clean
  test with units and lesson assessments pre-seeded.
- New file `packages/core/src/__tests__/bootstrap-service.edit-ops.test.ts`
  if the existing file grows unwieldy.

### Story B tests
- `packages/core/src/__tests__/bootstrap-service.queries.test.ts`
  (new): per-method coverage for the four new query methods, including
  the dangling-refs scenarios.
- `packages/tools/src/course/__tests__/list-*.test.ts` and similar for
  each new tool (schema validation + handler dispatch).

## Risks

- **`applyEdit` return-shape change is a public-API shift.** The only
  caller today is `BootstrapServiceImpl.editDraft`, but a future
  refactor might surface other callers. Mitigation: the change is
  contained behind `editDraft`, and `editDraft`'s public API only adds
  an optional `warnings` field. Net: tiny blast radius if anyone
  bypasses the service.
- **Cascade semantics on `remove-lesson` could surprise the agent.** A
  lesson that's part of three units gets removed; three unit
  memberships silently disappear. The warning string carries the count,
  but the agent might not parse it. Mitigation: tests pin the warning
  text; the prompt fragment for `course.edit_draft` calls out "cascade
  cleanups are summarized in the `warnings` field — read them."
- **`list_dangling_refs` overlaps with `validate-draft`.** Both report
  the same conditions in different shapes. Acceptable redundancy —
  `validate-draft` is for the final pre-confirm sanity pass;
  `list_dangling_refs` is for the agent to inspect specific gaps
  during refactor. Keeping both separate keeps each shape focused.
- **AssignmentItem-union friction (carried from `structured-questions`).**
  The exhaustive-switch updates in graders/UI from that feature must
  not regress here — the cascade ops don't touch `AssignmentItem`,
  but the test fixtures might. Spot-check after implementation.

## Implementation run summary (2026-05-10)

Both child stories landed at `stage: review`. Build, typecheck, and full
test suite green (2547 tests).

- `story-epic-bootstrap-readiness-expressive-draft-api-edit-ops` —
  `DraftEditOp` union extended with `relink-concept`, `add-edge`,
  `remove-unit`, `validate-draft`. `applyEdit` returns
  `{ state, warnings[] }`; `editDraft` threads warnings up to the tool.
  `add-concept` on duplicate name no longer silently merges — returns
  a warning. `remove-lesson` cascade-cleans unit memberships and
  lesson assessments with one summary warning. 11 new tests.
- `story-epic-bootstrap-readiness-expressive-draft-api-query-tools` —
  four new read tools (`course.list_units`,
  `course.list_lessons_in_unit`, `course.get_lesson_detail`,
  `course.list_dangling_refs`) with matching `BootstrapService`
  methods. Dangling-refs report identifies orphan concepts, dangling
  unit memberships, dangling lesson assessments, and edges referencing
  unknown concepts. 37 new tests (16 service + 21 tool).

Combined effect: the tutor can now refactor a draft (relink concepts,
add edges, cascade-remove lessons/units, validate before confirm) AND
inspect parts of a draft (units, lessons-in-unit, lesson detail,
dangling-refs) without dragging the whole graph through every turn —
which was the original pain that surfaced the
`idea-course-edit-draft-api-gaps` and
`idea-bootstrap-draft-edit-and-query-apis` parks.
