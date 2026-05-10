---
id: epic-phase-18-coach-mode-impl
kind: story
stage: done
tags: [content]
parent: epic-phase-18-coach-mode
depends_on: []
release_binding: v0.1.0
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# `study-skills` mode + role fragment + UI accent

## Scope

Add the dedicated `study-skills` mode: Mode definition with the right
tool subset, a new role prompt fragment that captures the coach's voice
(explain technique → demonstrate → practice → reflect), mode-registry
registration, and a light visual accent in the chat tab body that
signals study-skills context.

The design lives in the parent feature body
(`epic-phase-18-coach-mode`); read it for architecture and design
decisions before starting.

## Units

### Unit 1: `study-skills-role` prompt fragment

**File**: `packages/curriculum/src/modes/fragments/study-skills-role.ts`

Mirror the shape of `role.ts` (the teach-mode role fragment). The
template is a coach voice: explain the technique → demonstrate it →
have the student practice → reflect on what worked.

```typescript
import type { PromptFragment } from "@praxis/core/types";

export const studySkillsRoleFragment: PromptFragment = {
  id: "role.study-skills",
  position: "role",
  customizable: true,
  template: `You are a metacognition coach. You teach study skills —
the techniques and habits that make learning stick.

Your loop for any technique:

1. **Explain** — name the technique and the cognitive principle it
   leverages (cognitive load, retrieval practice, dual coding,
   productive struggle, etc). Cite a concrete example from research
   if the pedagogy pack carries one.
2. **Demonstrate** — walk through one concrete application on a piece
   of the student's actual coursework. Use the pedagogy.* tools to pull
   technique content from the pack.
3. **Practice** — have the student try it on a fresh problem. Use the
   workspace tools (note.*, flashcard.*) to scaffold. For Cornell
   notes: open a cornell-format note. For spaced repetition: create
   flashcards from a recent note. For Feynman: ask them to explain it
   back in plain words.
4. **Reflect** — at the end, ask them what felt natural and what
   didn't. Their reflection is the most valuable signal — it surfaces
   metacognitive awareness.

You don't grade. You coach. There are no assignments to author and no
gates to advance. The student keeps using their own course material;
you teach them how to study it differently.

If a technique requires concept-graph navigation (e.g. concept
mapping), use course.what_can_i_teach to surface the catalog. Otherwise
stay general — study skills generalize across courses, and you should
help the student see them as transferable.

Pacing: introduce ONE technique per session, not several. Depth over
breadth. End with a clear "next time, try X on your own work" pointer.`,
};
```

**Acceptance**:
- [ ] Fragment exports correctly with `id: "role.study-skills"`,
      `position: "role"`, `customizable: true`.
- [ ] Template references the four-step loop and the available tool
      surface (pedagogy.*, note.*, flashcard.*, course.what_can_i_teach).

### Unit 2: `study-skills` mode

**File**: `packages/curriculum/src/modes/study-skills.ts`

```typescript
import type { Mode } from "@praxis/core/types";
import { constraintsFragment } from "./fragments/constraints.js";
import { courseContextFragmentDefault } from "./fragments/course-context.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";
import { studySkillsRoleFragment } from "./fragments/study-skills-role.js";
import { toolsFragment } from "./fragments/tools.js";

export const studySkillsMode: Mode = {
  id: "study-skills",
  label: "Study Skills",
  description:
    "Metacognition coach mode: teach techniques (Cornell notes, Feynman, spaced repetition, concept mapping) and the cognitive principles behind them.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    studySkillsRoleFragment,
    principlesFragment,
    toolsFragment,
    courseContextFragmentDefault,
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: [
    // Pedagogy pack reads — authoritative content for techniques + strategies.
    "pedagogy.list_strategies",
    "pedagogy.get_strategy",
    "pedagogy.list_techniques",
    "pedagogy.get_technique",
    "pedagogy.list_metacognitive_prompts",
    // Concept-graph navigation for concept-mapping exercises.
    "course.what_can_i_teach",
    // Workspace tools — Cornell, Feynman, free-form notes; FSRS-backed flashcards.
    "note.create",
    "note.update",
    "note.show",
    "note.list",
    "note.from_session_summary",
    "flashcard.create",
    "flashcard.from_note",
    "flashcard.review",
    "flashcard.review_next",
    // Quick-check formative probes — natural fit for "did the technique land?".
    "quick_check.single_choice",
    "quick_check.multi_select",
    "quick_check.short_answer",
    "quick_check.confidence",
  ],
  uiSurface: "chat",
};
```

**Acceptance**:
- [ ] Mode exports correctly with the listed `id`, `label`,
      `requiredRole`, `promptFragments`, `toolNames`, `uiSurface`.
- [ ] `toolNames` does NOT include `assignment.create`, `grade_math`,
      `code_sandbox`, `retrieve_from_textbook`, `course.start_lesson`,
      `course.current_concept`, `course.mark_studied`,
      `update_mastery`, `record_misconception` — study-skills is a
      coaching mode, not a teaching/grading mode.

### Unit 3: Mode-registry registration

**File**: `packages/curriculum/src/modes/index.ts`

Add to the `MODE_REGISTRY` Map and re-export from the barrel.

```typescript
// imports
import { studySkillsMode } from "./study-skills.js";

const MODE_REGISTRY: ReadonlyMap<string, Mode> = new Map([
  [teachMode.id, teachMode],
  [bootstrapMode.id, bootstrapMode],
  [quizMode.id, quizMode],
  [homeworkMode.id, homeworkMode],
  [examMode.id, examMode],
  [configureMode.id, configureMode],
  [studySkillsMode.id, studySkillsMode], // ← Phase 18
]);

// barrel
export { studySkillsMode } from "./study-skills.js";
```

**Acceptance**:
- [ ] `getMode("study-skills")` returns the mode.
- [ ] `requireMode("study-skills")` returns the mode.
- [ ] `listModes()` includes `studySkillsMode`.
- [ ] All existing tests in `packages/curriculum/src/modes/__tests__/`
      pass.

### Unit 4: UI accent in chat tab body

**File**: `packages/ui/src/components/chat-tab-body.tsx` (modify)

The `ChatTabBody` dispatcher (around line 267) currently routes
`study-skills` to `TeachChatTabBody` via the `default` case. Add a
small explicit branch that wraps `<TeachChatTabBody>` with a header
chip indicating coach context.

Two possible shapes; pick the simpler:

**Option A**: a new component
`packages/ui/src/components/study-skills-tab-body.tsx` that renders a
study-skills-specific accent (e.g. a small header chip "Study Skills")
above an embedded `<TeachChatTabBody>`. Add a `case "study-skills":`
to `ChatTabBody`.

**Option B**: pass `tab.modeId` into `TeachChatTabBody` (already
available via `tab.modeId`), and conditionally render the chip inside
the existing component.

Decision in implementation: Option A. Cleaner separation, easier to
extend, fewer cross-mode conditionals. The new file is ~30 lines.

```typescript
// study-skills-tab-body.tsx
import type { TabSummary } from "@praxis/core/types";
import type { JSX } from "react";
import { TeachChatTabBody } from "./chat-tab-body.js";
import styles from "./study-skills-tab-body.module.css";

export interface StudySkillsTabBodyProps {
  tab: TabSummary;
}

export function StudySkillsTabBody({ tab }: StudySkillsTabBodyProps): JSX.Element {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.chip}>study skills</span>
      </div>
      <div className={styles.body}>
        <TeachChatTabBody tab={tab} />
      </div>
    </div>
  );
}
```

The CSS module is minimal — chip styling + container flex column.

**Acceptance**:
- [ ] A study-skills tab renders a header chip + the chat body.
- [ ] Switching between a teach tab and a study-skills tab in
      `tab-body-isolation` works correctly (both bodies mount; inactive
      hidden via `display:none` per the existing pattern).
- [ ] Snapshot or render test confirms the chip text + layout shape.

### Unit 5: Tests

**Files**:
- `packages/curriculum/src/modes/__tests__/study-skills.test.ts` —
  asserts the mode's id/label, fragment composition order, tool list
  membership, registry registration.
- `packages/ui/src/__tests__/study-skills-tab-body.test.tsx` —
  asserts the chip renders + the chat body is embedded.

The existing `packages/curriculum/src/modes/__tests__/` directory has
mode-related tests as a pattern reference (mode loading, getMode/
requireMode). Mirror that shape.

## Acceptance criteria (story)

- [x] `study-skills` mode appears in `listModes()` and is dispatchable
      via `getMode("study-skills")`.
- [x] A study-skills session uses the new role fragment and the
      pedagogy.* / note.* / flashcard.* / quick_check.* tools (no
      assignment.create, no grade_math, no code_sandbox).
- [x] UI tab dispatch routes `modeId === "study-skills"` to the new
      `StudySkillsTabBody`, which renders a header chip + delegates
      body to `TeachChatTabBody`.
- [x] `pnpm typecheck && pnpm test` green.
- [x] `pnpm lint` shows no regression past the current 4-error baseline.

## Implementation notes

### Files created

- `packages/curriculum/src/modes/fragments/study-skills-role.ts` — role fragment
  with `id: "role.study-skills"`, `position: "role"`, `customizable: true`;
  four-step coaching loop (explain → demonstrate → practice → reflect).
- `packages/curriculum/src/modes/study-skills.ts` — full `Mode` definition with
  19 tools (5 pedagogy + 1 course nav + 5 note + 4 flashcard + 4 quick_check).
- `packages/curriculum/src/modes/__tests__/study-skills.test.ts` — 26 tests
  covering registry, shape, fragment composition, included tools, and excluded
  tools.
- `packages/ui/src/components/study-skills-tab-body.tsx` — ~30-line wrapper
  rendering a "study skills" chip + embedded `<TeachChatTabBody>`.
- `packages/ui/src/components/study-skills-tab-body.module.css` — chip accent
  styling (flex column container, pill chip with accent colour).
- `packages/ui/src/__tests__/study-skills-tab-body.test.tsx` — 4 tests asserting
  chip renders, composer present, and dispatcher routes correctly.

### Files modified

- `packages/curriculum/src/modes/index.ts` — added `studySkillsMode` to
  `MODE_REGISTRY` Map and re-exported from barrel.
- `packages/ui/src/components/chat-tab-body.tsx` — added `import` for
  `StudySkillsTabBody` and `case "study-skills":` to the dispatcher.

### Discrepancies

- Story acceptance says "17 tools" but the explicit list in unit 2 of the story
  body enumerates 19 (5 pedagogy + 1 course + 5 note + 4 flashcard + 4
  quick_check). The code and tests use 19, which matches the per-tool list in
  the spec; "17" appears to be a transient typo in the preamble.
- The `packages/curriculum/src/modes/__tests__/` directory didn't exist at the
  start — created it. Existing mode tests live in
  `packages/curriculum/src/__tests__/`; the new test follows the same shape.

### Verification results

```
pnpm typecheck   → all packages green (0 errors)
pnpm lint        → 4 errors (baseline; none from new files)
pnpm --filter @praxis/curriculum test  → 246 tests passed (22 files)
pnpm --filter @praxis/ui test          → 560 tests passed (75 files)
```

All new tests green: 26 curriculum + 4 UI = 30 new tests total.

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none

**Nits** (in conversation only):
- `study-skills.ts:19` lists fragments in a 7-element array
  (preamble / role / principles / tools / course-context / constraints
  / postamble). Same composition order as `teach.ts`. The order is
  asserted in tests but the order is implicit — a Mode shape that
  enforces composition order via discriminated positions would be a
  quality-of-life upgrade across all modes. Cross-mode concern, not
  this story.
- `studySkillsRoleFragment.template` is ~30 lines of prose. Solid
  content; no concerns.

**Notes**:
- Verified at HEAD (`b488710`): `pnpm typecheck` clean;
  `pnpm --filter @praxis/curriculum test` 246 passed;
  `pnpm --filter @praxis/ui test` 560 passed; `pnpm lint` 4 errors
  (unchanged baseline).
- 30 new tests across 2 files. The 26-test curriculum suite covers
  registration, shape, fragment composition order, included tools,
  and (importantly) explicit assertions that the EXCLUDED tools
  aren't in the toolNames list — a guard against future edits
  silently broadening the coaching mode's surface.
- Mode tool list: 19 tools, all of which exist in the registry today
  (verified by reading the tool barrels: pedagogy/index.ts,
  course/index.ts, notes/index.ts, flashcards/index.ts,
  quick-check/index.ts).
- Tab dispatcher routes `modeId === "study-skills"` to
  `StudySkillsTabBody` which renders a "study skills" chip + embeds
  `<TeachChatTabBody>`. Clean separation; the chip wrapper is
  ~30 lines.
- The story preamble's "17 tools" was a counting typo — the explicit
  enumerated list is 19. Implementation matches the explicit list
  (5 pedagogy + 1 course nav + 5 note + 4 flashcard + 4 quick_check).
  Documented in the implementation summary.

What's now possible: the metacognition coach's dedicated mode is
registered and dispatchable. A study-skills tab swaps in the coach
role fragment + the coaching-only tool surface + a study-skills
header chip. The `epic-phase-18-routing-integration` feature can
now reference `study-skills` as a mode-transition target ("after
persistent misconception, suggest study-skills mode") — its design
already wired this hook.
