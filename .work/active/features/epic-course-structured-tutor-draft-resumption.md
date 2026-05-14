---
id: epic-course-structured-tutor-draft-resumption
kind: feature
stage: implementing
tags: [tutor-ux, bootstrap]
parent: epic-course-structured-tutor
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Draft resumption — list-drafts tool + resume picker

## Brief

A student in the bootstrap explorer can start designing a course, get
partway through, and then close the window. Today there's no path back:
drafts are only addressable by the opaque `draftId` returned from the
prior `course.start_exploration` call, and that id isn't surfaced
anywhere the student would have copied it. The only "resume" path is
pasting an id the student doesn't have — a dead end in practice.

This feature adds two paired surfaces. **First**, a new
`course.list_drafts` tool (mode-scoped to bootstrap) that returns active
drafts with id, title (or working name), last-modified timestamp, and
structural progress signals (unit count, lesson count, completion
percent — exact shape decided at feature-design). **Second**, a "Resume
draft" UI affordance on the create-course screen that consumes the tool
output and lets the student pick by recognizable metadata, not by UUID.

The tool is the substrate prerequisite — the UI consumes it. They land
in one feature because splitting introduces an artificial dependency
edge for what is conceptually one capability ("enumerate drafts to
resume one").

## Epic context

- Parent epic: `epic-course-structured-tutor`
- Position in epic: independent — touches bootstrap surface,
  course-drafts data, mode-tool scoping. Parallelizable with the
  other two features.

## Scope absorbed from backlog

- `idea-list-in-progress-drafts-tool` — `course.list_drafts` tool plus
  UI resume affordance on the create-course screen.

## Foundation references

- `docs/ARCHITECTURE.md` — bootstrap explorer, course drafts data model
- `docs/CURRICULUM.md` — course draft lifecycle
- `CLAUDE.md` — patterns `mode-tool-scoping`, `batch-tool-per-item-results`
  (if the listing tool returns many drafts)

## Anchors (current implementation)

- Bootstrap service —
  `packages/core/src/services/bootstrap-service.ts`
- Course-draft store — `packages/core/src/db/` (drafts table + accessor
  layer; identify the exact accessor at feature-design)
- Bootstrap tools —
  `packages/tools/src/course/` (existing tools:
  `course.start_exploration`, `course.draft_add_unit`,
  `course.draft_set_assessment_plan`,
  `course.draft_add_lesson_assessment`)
- Bootstrap UI — `packages/ui/src/components/bootstrap-tab-body.tsx`
- Bootstrap mode definition (toolNames allowlist) —
  `packages/curriculum/src/modes/bootstrap.ts` (or equivalent)
- Create-course entry point — wherever the "new course" flow starts in
  `packages/ui/src/routes/` — feature-design needs to locate this

## Pre-design decisions (2026-05-14)

- **Draft surfacing scope**: create-course flow ONLY. A "Resume
  in-progress draft" picker appears at the top of "New course"
  (or wherever the bootstrap flow begins). Library shows only
  finished courses — drafts are NOT first-class artifacts there.
  Cleaner mental model; avoids the "what is a draft when it has no
  course id yet" question bleeding into the library UI.
- **Tool scoping**: `course.list_drafts` is `bootstrap`-mode-only,
  enforced via `mode.toolNames`. Don't leak into teach / quiz /
  homework / exam contexts.
- **Resume picker shape**: dropdown-style picker at the entry point;
  list shows draft title (or working name), last-modified, and
  structural progress (unit / lesson counts). Feature-design picks
  the visual primitive (combobox vs. inline list) based on the
  editorial system.

## Design decisions (2026-05-14, feature-design)

- **Tool vs. IPC channel**: The `course.list_drafts` tool is for the
  bootstrap model's mid-conversation use. The UI picker does NOT need
  a new IPC channel — `useDrafts()` already subscribes to the
  existing draft stream (`praxis.bootstrap.drafts.events`) which
  emits a `snapshot` of all active drafts on subscribe. Reusing it
  avoids a parallel one-shot read path.
- **Tool output shape**: Return a compact `DraftListing[]` projection
  (id, title, subject, gradeLevel, unit/lesson/concept/assessment
  counts, completionPercent, timestamps) — NOT the full
  `DraftCourseState` (too verbose for model token budget).
- **Picker primitive**: Inline expanding panel rendered alongside
  "+ New course" on the courses route — not a Modal. Resume is a
  quick mid-flow choice (the user knows they have a draft) so a
  destination modal is heavyweight. Returns `null` (no visual noise)
  when no active drafts exist.
- **Resume mechanism**: Picker opens a bootstrap session via
  `session.start({ modeId: "bootstrap" })`, navigates to the new
  tab, then seeds the conversation with a synthesized first user
  message naming the draftId; the bootstrap model already knows the
  resume-via-`course.start_exploration(draftId)` protocol per the
  `bootstrap-role` fragment.
- **Service accessor**: `BootstrapService.listActiveForStudent(studentId)`
  already exists and is exactly the right shape. No new service work
  required — the tool is a thin adapter + projection.
- **completionPercent heuristic**: Weighted score (10% metadata, 20%
  concepts, 20% lessons, 20% units, 15% assessment plan, 15% per-
  lesson assessments) with denominators calibrated against typical
  course size. Monotonic on adds; precision is illustrative, not
  exact.

## Architectural choice

Single tool + projection (`course.list_drafts` → `DraftListing[]`) backed by the
existing `BootstrapService.listActiveForStudent` accessor; mode-scoped via
`bootstrap.toolNames`; UI picker uses the existing draft stream via
`useDrafts()`. Rejected: parallel client-side `listDrafts()` invoke channel
(redundant with the live stream) and tool-returns-full-state (token-wasteful).

## Implementation Units

### Unit 1: `course.list_drafts` tool

**File**: `packages/tools/src/course/list-drafts.ts` (new)
**Registered in**: `packages/tools/src/course/index.ts` (`COURSE_TOOLS` array)
**Story**: `epic-course-structured-tutor-draft-resumption-tool`

```typescript
import type { DraftCourseState, ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({});

const DraftListingSchema = z.object({
  draftId: z.string(),
  title: z.string(),                       // "Untitled draft" if empty
  subject: z.string().optional(),
  gradeLevel: z.string().optional(),
  unitCount: z.number().int().nonnegative(),
  lessonCount: z.number().int().nonnegative(),
  conceptCount: z.number().int().nonnegative(),
  assessmentCount: z.number().int().nonnegative(),
  completionPercent: z.number().int().min(0).max(100),
  createdAt: z.number(),                   // ms epoch
  lastTouchedAt: z.number(),               // ms epoch
});

const OutputSchema = z.object({
  drafts: z.array(DraftListingSchema),     // sorted lastTouchedAt DESC
});

export const listDraftsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_drafts",
  description:
    "List the student's active course drafts (unconfirmed, undiscarded), newest-touched first. Each entry includes a recognizable title and structural progress signals. Call this when the student says they want to resume a course they started — pick the right draftId from the returned list, then call course.start_exploration with that draftId to continue.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(_args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const drafts = ctx.services.bootstrap.listActiveForStudent(ctx.studentId);
    return { drafts: drafts.map(toDraftListing) };
  },
};

/** Pure projection — co-located here for testability without DI. */
export function toDraftListing(state: DraftCourseState): z.infer<typeof DraftListingSchema> {
  const p = state.proposed;
  const trimmedTitle = (p.title ?? "").trim();
  const lessonCount = p.proposedLessons.length;
  const unitCount = p.proposedUnits?.length ?? 0;
  const conceptCount = p.proposedConcepts.length;
  const summativeCount = (p.proposedUnits ?? []).filter((u) => u.summative != null).length;
  const lessonAssessmentCount = p.proposedLessonAssessments?.length ?? 0;
  const assessmentCount = summativeCount + lessonAssessmentCount;

  return {
    draftId: state.draftId,
    title: trimmedTitle.length > 0 ? trimmedTitle : "Untitled draft",
    ...(p.subject ? { subject: p.subject } : {}),
    ...(p.gradeLevel ? { gradeLevel: p.gradeLevel } : {}),
    unitCount,
    lessonCount,
    conceptCount,
    assessmentCount,
    completionPercent: computeCompletion(p, lessonCount, unitCount, conceptCount, lessonAssessmentCount),
    createdAt: state.createdAt,
    lastTouchedAt: state.lastTouchedAt,
  };
}

function computeCompletion(/* see heuristic in feature body */): number { /* ... */ }
```

**Implementation Notes**:
- The tool input is an empty object (no params) — studentId is resolved from `ctx.studentId`.
- The projection MUST be a pure function (`toDraftListing`) so it can be unit-tested without spinning up a DB.
- `effects: ["none"]` — read-only.
- `tier: "grounded"` — matches sibling course tools like `show-draft.ts`.
- Cross-student leakage is impossible because `listActiveForStudent` filters by studentId; do not add a `studentId` param to the tool schema.

**Acceptance Criteria**:
- [ ] Tool file exists at `packages/tools/src/course/list-drafts.ts`.
- [ ] Tool exported from `packages/tools/src/course/index.ts` and included in `COURSE_TOOLS`.
- [ ] `handler` returns `{ drafts: [] }` for a student with no active drafts.
- [ ] Projection: `title` falls back to `"Untitled draft"` when `proposed.title` is empty/whitespace.
- [ ] Projection: `assessmentCount === summativeCount + lessonAssessmentCount`.
- [ ] Output sorted by `lastTouchedAt` DESC (relies on `listActiveForStudent`'s ordering — verify).
- [ ] `completionPercent` is in [0, 100], integer, monotonic when fields are added.
- [ ] Confirmed and discarded drafts are EXCLUDED (verified by repeating with marked-confirmed and marked-discarded rows).

---

### Unit 2: Mode-tool-scoping wiring

**File**: `packages/curriculum/src/modes/bootstrap.ts` (edit)
**File**: `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` (edit — add one-line tool entry)
**Story**: `epic-course-structured-tutor-draft-resumption-mode-wiring`

Add `"course.list_drafts"` to `bootstrapMode.toolNames`. Add a sentence to the bootstrap-tools fragment so the model knows the tool exists and when to use it:

> `course.list_drafts` — enumerate the student's active drafts when they
> ask to resume something they started. Pass the chosen draftId back into
> `course.start_exploration` to continue building.

**Implementation Notes**:
- This unit depends on Unit 1 (the tool must exist before the mode references it). `depends_on: [<feature-id>-tool]`.
- Do NOT add `"course.list_drafts"` to any other mode's `toolNames`. Specifically: `teach`, `quiz`, `homework`, `exam`, `study-skills`, `configure` must remain unchanged.

**Acceptance Criteria**:
- [ ] `bootstrapMode.toolNames` includes `"course.list_drafts"`.
- [ ] No other mode's `toolNames` includes `"course.list_drafts"` (mechanical sweep across `packages/curriculum/src/modes/*.ts`).
- [ ] `bootstrap-tools.ts` fragment includes a one-sentence usage entry for the tool.
- [ ] `pnpm typecheck` + `pnpm test` green.

---

### Unit 3: Resume draft picker (UI)

**File**: `packages/ui/src/components/resume-draft-picker.tsx` (new) + `.module.css` (new)
**File**: `packages/ui/src/routes/courses.tsx` (edit)
**Story**: `epic-course-structured-tutor-draft-resumption-ui-picker`

```typescript
// resume-draft-picker.tsx
import type { DraftCourseState } from "@praxis/core/types";
import { useDrafts } from "../hooks/use-drafts.js";

export interface ResumeDraftPickerProps {
  onResume: (draft: DraftCourseState) => void | Promise<void>;
}

/**
 * Inline expanding picker rendered alongside "+ New course". Subscribes to
 * the live draft stream via `useDrafts()`. Renders nothing when no active
 * drafts exist. Each row shows working title, relative last-touched, and
 * "N units · M lessons". Click → invokes onResume(draft).
 */
export function ResumeDraftPicker(props: ResumeDraftPickerProps): React.JSX.Element | null;
```

`courses.tsx` integration:

```typescript
const handleResumeDraft = async (draft: DraftCourseState) => {
  const handle = await client.session.start({ modeId: "bootstrap" });
  await navigate({ to: "/", search: { sessionId: handle.sessionId } });
  // Seed the conversation so the bootstrap model picks up the draftId.
  // The model already knows to call course.start_exploration(draftId) per
  // the bootstrap-role fragment.
  await drainSeedSend(
    client.session.send(
      handle.sessionId,
      `Please resume draft ${draft.draftId} ("${displayTitle(draft)}"). ` +
        `Call course.start_exploration with this draftId to continue building it.`,
    ),
  );
};

return (
  <RouteHeader
    /* ... */
    actions={
      <>
        <ResumeDraftPicker onResume={handleResumeDraft} />
        <button onClick={handleNewCourse}>+ New course</button>
      </>
    }
  />
);
```

**Implementation Notes**:
- Use editorial primitives only — no ad-hoc styling. `composes: editorial from global;` in the module CSS where appropriate.
- Picker disclosure pattern: small button (e.g., "Resume draft N") that toggles open an inline panel below `RouteHeader`. ARIA: `aria-haspopup="listbox"` + `aria-expanded`. ESC closes; click-outside closes.
- Relative-time formatting: use the project's existing date helper if there is one; otherwise simple "N min/hr/days ago" inline.
- Cap visible rows at 8; if `drafts.length > 8`, render "View all (N)" that opens a Modal-based full-list picker. Initial implementation MAY skip the modal overflow and just scroll vertically; defer to a follow-up if it bites.
- The seed message in `courses.tsx` is plain text; the bootstrap model handles the rest. Do not invent a new `session.start({ resumeDraftId })` API in this feature — the seed-message path is sufficient and avoids a new contract.
- `drainSeedSend` is a tiny local helper that consumes the AsyncIterable without unmounting — events also flow to the active chat tab once it subscribes via `useChatStream`.

**Acceptance Criteria**:
- [ ] Component returns `null` when `useDrafts().drafts.length === 0`.
- [ ] Component does NOT create any new IPC channel; uses existing `useDrafts()`.
- [ ] Rendered alongside `+ New course` on `routes/courses.tsx`.
- [ ] Each row displays: title (or "Untitled draft"), relative last-touched, and "N units · M lessons".
- [ ] Clicking a row opens a bootstrap session, navigates to it, and emits a seed user message containing the chosen `draftId`.
- [ ] Keyboard accessible: arrow keys navigate rows; Enter selects; Esc closes.
- [ ] Vitest test in `packages/ui/src/__tests__/resume-draft-picker.test.tsx`:
  - renders nothing when no drafts
  - renders rows when drafts present
  - click triggers `client.session.start({ modeId: "bootstrap" })` + `client.session.send` with `draftId` in the message body
- [ ] No new exports from `@praxis/core/types` (the picker consumes `DraftCourseState` only).

---

## Implementation Order

1. Unit 1 (`...-tool`) — define the tool + projection + tests. No dependencies.
1. Unit 3 (`...-ui-picker`) — UI picker. No dependencies (uses existing `useDrafts()`). Can land in parallel with Unit 1.
2. Unit 2 (`...-mode-wiring`) — expose the tool in bootstrap mode. Depends on Unit 1.

Parallel-wave shape: `[Unit 1, Unit 3]` → `[Unit 2]`.

## Testing

### Unit Tests

- `packages/tools/src/course/__tests__/list-drafts.test.ts` — `toDraftListing` projection (pure-function tests), and a thin handler test with a fake `BootstrapService` injected via `ToolContext` mock. Cases: empty, untitled, fully-scaffolded, sort order, completion-percent monotonicity, confirmed-drafts excluded (delegated to `listActiveForStudent` filter — verify by mock contract).
- `packages/curriculum/src/modes/__tests__/bootstrap.test.ts` — append assertions for `course.list_drafts` membership; add a sweep test that loops over `[teachMode, quizMode, homeworkMode, examMode, studySkillsMode, configureMode]` asserting absence.
- `packages/ui/src/__tests__/resume-draft-picker.test.tsx` — RTL test with `makeFakeClient` providing a fake `drafts.events()` AsyncIterable. See pattern `ui-test-helper`.

### Integration

The resume path is end-to-end smoke-testable by: start a bootstrap session → run `course.start_exploration` partway → close the tab → reopen the courses route → picker shows the draft → click → seed message lands → model calls `course.start_exploration(draftId)` to continue. Not automated in this feature — manual smoke check at review time.

## Risks

- **Seed-message reliability**: the synthesized user message is the only mechanism telling the bootstrap model to resume. If model behavior drifts and it ignores the seed, resume silently breaks. Mitigation: the message names the tool by exact symbol (`course.start_exploration`) and the bootstrap-role fragment already documents the resume protocol; if it drifts, harden by adding an explicit `session.start({ resumeDraftId })` contract in a follow-up.
- **Picker overflow at scale**: a student with many drafts will hit the inline-panel ceiling. Acceptance allows scroll fallback initially; document a follow-up backlog item if smoke testing shows >8 drafts is common.
- **listActiveForStudent cost**: the accessor deserializes full `stateJson` blobs for every active draft. Acceptable now (drafts-per-student is small); flag for SQL-projection refactor if measured to be slow.
