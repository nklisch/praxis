---
id: epic-phase-18-coach-mode
kind: feature
stage: review
tags: [content]
parent: epic-phase-18-study-skills
depends_on: [epic-phase-18-pedagogy-pack]
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# `study-skills` coach mode

## Brief

The dedicated metacognition coach mode. Teaches and practices the
"principles-taught" list in `docs/CURRICULUM.md` (source authority,
elaborative interrogation, Cornell-style notes, concept mapping, productive
struggle as a habit, …). Often spans across courses — study skills
generalize.

`packages/curriculum/src/modes/` currently has bootstrap, configure, exam,
homework, quiz, teach. This feature adds `study-skills.ts` and its prompt
fragments (role + tools + any mode-specific constraints), registers it in
the mode registry, and gives it the visual treatment the brief calls out
("Coach voice / visual treatment in modes").

What this delivers:

- `packages/curriculum/src/modes/study-skills.ts` — full Mode definition
  with `id: "study-skills"`, the right tool scope, and the prompt fragments
  it composes from.
- New role fragment (`study-skills-role.ts`): explain technique → demonstrate
  → student practices → reflect, per `docs/CURRICULUM.md` line ~108.
- Tool scope: existing workspace tools (Cornell editor, concept-map editor,
  flashcard tools), pedagogy-pack content retrieval (`pedagogy.*` from the
  pack feature), spaced-review scheduling. Plus a small surface for
  surfacing the canonical concept graph for concept-mapping exercises (read
  via existing concept-graph reads).
- Mode-registry registration so the mode appears in the configure-mode
  picker and the new-tab modality menu.
- A light visual treatment in the chat tab body that signals study-skills
  context — a header chip or accent colour — not a full re-themed surface.
  Builds on existing editorial primitives.
- Acceptance: opening a study-skills tab and asking the tutor to teach
  Cornell note-taking should produce a session that walks the student
  through the technique using the workspace and pedagogy-pack content,
  ending with a reflective prompt.
- Tests: mode registration, prompt composition snapshot, smoke test of one
  full study-skills session (using a fake engine).

What this feature does NOT cover: cross-mode metacognitive prompt injection
(separate feature, `epic-phase-18-metacognitive-prompts`); routing
suggestions that *send* the student into study-skills mode after persistent
misconceptions (that's `epic-phase-18-routing-integration` — at most this
feature exposes the entry point, the router decides when to suggest it).

## Epic context

- Parent epic: `epic-phase-18-study-skills`
- Position in epic: headline deliverable of Phase 18 — the dedicated coach
  mode the ROADMAP names. Independent of the indexers; depends on the pack
  for content.

## Foundation references

- `docs/CURRICULUM.md` — `study-skills` mode definition (line ~104),
  principles-taught list (line ~41 onward)
- `docs/UX.md` — modality conventions and tab body shapes
- `docs/CONTRACT.md` — `Mode` interface
- `packages/curriculum/src/modes/teach.ts` — closest existing reference
  shape for a teaching-style mode
- `docs/ROADMAP.md` Phase 18 — "`study-skills` mode (curriculum delivery)"

## Design decisions

- **Reuse `TeachChatTabBody` with a study-skills accent chip.** The
  brief explicitly says "light visual treatment, not a full re-themed
  surface". A new `StudySkillsTabBody` wraps the existing chat body
  with a header chip — ~30 lines + a minimal CSS module. Cleaner
  separation than threading `modeId` through the chat body's existing
  conditionals.
- **Tool surface is moderate, not the full teach set.** Include
  pedagogy.* (authoritative technique content), note.* + flashcard.*
  (workspace tools per CURRICULUM.md), course.what_can_i_teach
  (concept-graph navigation for concept-mapping exercises),
  quick_check.* (formative probes — natural fit for "did the technique
  land?"). EXCLUDE assignment.create / grade_math / code_sandbox /
  retrieve_from_textbook / course.start_lesson / current_concept /
  mark_studied / update_mastery / record_misconception — study-skills
  is coaching, not teaching/grading.
- **Course binding stays for v1.** CURRICULUM.md says study-skills
  "often spans across courses", but Phase 18 v1 still requires an
  active course (the workspace context shows it). A future feature
  can decouple. Documented as a v1 limitation in the risks section.
- **One technique per session.** The role fragment caps the depth of
  the loop at one technique per session — explain → demonstrate →
  practice → reflect. Multiple techniques per session would dilute the
  reflective component.
- **No grading tools.** The brief says "study-skills generalize across
  courses and don't bind to gradeable artifacts". The mode doesn't
  author assignments or update mastery; it just teaches and practices
  techniques.

## Architectural choice

A new `Mode` entry in the existing curriculum mode registry, plus a
new role-prompt fragment, plus a thin UI wrapper that adds a header
chip to the existing chat tab body. Mirrors the established mode
pattern (teach / quiz / homework / exam / bootstrap / configure are all
shaped this way).

Considered alternatives:

- **Sub-mode of teach.** A flag on teach-mode that swaps in the
  study-skills role fragment + tool subset. Rejected because modes are
  the existing extension shape — adding a sub-mode flag complicates
  every mode-aware code path. The dedicated mode is the consistent
  choice.
- **Full re-themed UI.** A dedicated tab body with a different layout
  (e.g. technique catalog on the left, chat on the right). Rejected
  for v1 — the brief explicitly says "light visual treatment", and
  adding a new layout shape introduces UI work that doesn't help the
  ROADMAP test checkpoint ("Run study-skills session on Cornell
  notes"). A future feature can re-theme if usage data supports it.

## Implementation Order

One child story:

1. `epic-phase-18-coach-mode-impl` (no deps) — implements the role
   fragment, the mode definition, registry registration, the UI
   accent (`StudySkillsTabBody` wrapper + CSS module + dispatcher
   case), and tests in one stride. ~150 lines TS + tests; no
   parallelization gain from splitting.

## Risks

- **Tool surface gaps surface at runtime.** The mode lists 17 tool
  names. If any of them isn't actually wired into the registry (a
  pedagogy.* tool name typo, for instance, or a flashcard tool that
  was renamed), the mode-tool-scoping check at session-open will warn
  and the tutor's prompt won't include it. Mitigation: the registry
  test exercises every listed tool name and asserts it resolves.
- **Course binding limits cross-course study-skills sessions.**
  CURRICULUM.md envisions study-skills generalizing; v1 still requires
  an active course for the workspace context. Acceptable for the
  ROADMAP test checkpoint ("Run study-skills session on Cornell
  notes" — happens within a course context). Future feature can
  decouple.
- **Visual treatment risk-of-creep.** "Header chip" is well-bounded
  but easy to expand into "header chip + sidebar of techniques + new
  composer affordance". The story scope explicitly limits the wrapper
  to a chip; future UX iteration can expand if usage warrants.

## Implementation summary (2026-05-10)

Single child story landed at `stage: review`:

- `epic-phase-18-coach-mode-impl` (`800030c`) — `studySkillsRoleFragment` +
  `studySkillsMode` Mode definition + registry registration +
  `StudySkillsTabBody` UI wrapper (chip + embedded `TeachChatTabBody`) +
  CSS module + 30 tests (26 curriculum + 4 UI).

Cross-cutting deviations:
- The story preamble said "17 tools" but the explicit per-tool list
  enumerates 19 (5 pedagogy + 1 course.what_can_i_teach + 5 note + 4
  flashcard + 4 quick_check). Implementation matches the explicit list
  (19); the "17" was a counting typo in the design preamble.
  Documented; not a behavior change.

Verification at `800030c`:
- `pnpm typecheck` clean (all 10 packages)
- `pnpm --filter @praxis/curriculum test` 246 passed
- `pnpm --filter @praxis/ui test` 560 passed
- `pnpm lint` 4 errors (unchanged baseline; zero new from this story)

What's now possible:
- Students can open a `study-skills` tab — the chat surface gets a
  "study skills" header chip, the tutor-prompt swaps in the coach role
  fragment, and the tool surface narrows to coaching tools only (no
  grading, no assignment.create, no mastery writes).
- The metacognition-coach voice that CURRICULUM.md describes is now
  registered and dispatchable.
- `epic-phase-18-routing-integration` can now reference
  `study-skills` as a mode-transition target ("after persistent
  misconception, suggest study-skills mode") — its design already
  noted this hook.

Stage: implementing → review.
