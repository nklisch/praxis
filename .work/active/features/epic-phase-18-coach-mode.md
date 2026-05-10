---
id: epic-phase-18-coach-mode
kind: feature
stage: drafting
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
