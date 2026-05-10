---
id: epic-phase-18-metacognitive-prompts
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

# Metacognitive prompt injection across modes

## Brief

CURRICULUM.md is explicit: "Modes layer the metacognition coach's voice on
top. In `teach`, `quiz`, `homework`, and `exam`, prompt fragments include
metacognitive prompts at appropriate triggers (pre-reading, post-error,
session-end). The metacognition coach is woven through, not sequestered to
one mode."

This feature delivers that weaving. Today the existing prompt-fragment
catalog (`packages/curriculum/src/modes/fragments/`) has role / tools /
constraints / postamble / preamble fragments per mode but no metacognitive
prompts. This feature adds them.

What this delivers:

- New fragment file (`metacognitive-prompts.ts`) that selects prompts from
  the pedagogy pack by trigger + mode and inserts them at the right spots in
  the prompt composition pipeline.
- Composition wiring: teach / quiz / homework / exam mode definitions opt in
  to the fragment with the trigger set they care about (teach uses
  pre-reading + post-error + session-end; quiz uses pre-quiz + post-error;
  homework similar; exam may use only session-end since post-error coaching
  is suppressed during the verification stance).
- Trigger detection: pre-reading fires on session start when the lesson has
  prior context; post-error fires after a wrong-answer episodic event in the
  current turn; session-end fires when the agent declares the session
  closing. The exact event-handler placement is a design-pass call.
- Coach voice for the cross-mode case: a small "metacognition coach" speaker
  attribution surfaces in the fragment so the student can tell when the
  tutor is in coach mode within an otherwise non-coach session. Light
  treatment, not a separate UI — words on the page.
- Tests: prompt composition snapshot per mode shows the metacognitive
  fragment landing at the expected positions; trigger detection unit-tested
  off seeded episodic events.

What this feature does NOT cover: the dedicated `study-skills` mode itself
(`epic-phase-18-coach-mode`); the procedural / affective indexers that
inform *which* metacognitive prompt to choose adaptively (the v1 selection
is by trigger + mode + concept tags only — adaptive selection by procedural
preference can be a follow-on if useful).

## Epic context

- Parent epic: `epic-phase-18-study-skills`
- Position in epic: cross-cutting consumer of the pedagogy pack; modifies
  every non-bootstrap student-facing mode's prompt composition.

## Foundation references

- `docs/CURRICULUM.md` — "Modes layer the metacognition coach's voice on
  top" (line ~134) is the assertion this feature operationalises
- `docs/CONTRACT.md` — `MetacognitivePrompt` shape + the five
  `MetacognitivePromptTrigger` values
- `packages/curriculum/src/modes/fragments/` — existing fragment catalog
  this feature extends
- `docs/ROADMAP.md` Phase 18 — "Metacognitive prompt injection across
  other modes (pre-reading, post-error, session-end)"

## Design decisions

- **Static fragment with runtime tool lookup**, not dynamic
  system_note injection. The pedagogy pack already exposes
  `pedagogy.list_metacognitive_prompts({ trigger })` as a real tool;
  the fragment teaches the model when to use which trigger and
  delegates the actual prompt content to the tool. This avoids
  building a new event-listening service to detect triggers and
  inject system notes — that's substantially more plumbing for less
  flexibility (the model's judgment beats hard-coded trigger
  detection at the margin).
- **One factory function, four call sites.** The fragment is
  parameterized by the trigger set so each mode picks its relevant
  subset. Factory pattern keeps the trigger-guidance text in a single
  place; mode files just declare which triggers they care about.
- **Position: `principles`.** The metacognitive-coaching instruction
  reads as an extension of the project's pedagogical principles, not
  a standalone tool spec or context block. Two fragments share the
  `principles` position; composition order within position is the
  array order in the mode's `promptFragments`.
- **Trigger sets per mode** (matches the brief and the verification
  stance):
  - teach: `["pre-reading", "post-error", "session-end"]` — full
    coaching loop
  - quiz: `["pre-quiz", "post-error"]` — predict + reflect on errors
  - homework: `["pre-reading", "post-error"]` — frame the practice +
    surface assumption errors
  - exam: `["session-end"]` ONLY — the verification stance forbids
    feedback during the exam, but a session-end reflection is fine
- **Skip study-skills, bootstrap, configure.**
  - study-skills: its role fragment IS the metacognition coach voice;
    adding this fragment would duplicate.
  - bootstrap: pre-curricular onboarding for course authoring; no
    student-coaching surface.
  - configure: lock-gated authoring; not for students.
- **Empty-pack graceful degradation.** When
  `pedagogy.list_metacognitive_prompts` returns an empty list (no
  pack loaded, or no prompts for that trigger), the fragment instructs
  the model to skip the metacognitive surface for that moment. No
  hard error.
- **Don't build runtime trigger detection.** The story body's
  exploration mentioned post-error trigger detection on episodic
  events, but for v1 the model uses its own judgment about when a
  trigger applies — same model that decides when to use
  `quick_check.*` or `assignment.create`. Trigger detection in code
  is a follow-up if signal quality is poor.

## Architectural choice

Static parameterized prompt fragment with runtime tool lookup.
Considered alternatives:

- **Dynamic system_note injection.** A new service watches the
  session, detects trigger conditions on episodic events
  (post-error after wrong-answer events, session-end on session.end),
  and injects `system_note` events into the stream that the tutor
  weaves into its next response. Higher fidelity (the prompt fires
  precisely when a trigger applies) but ~150 lines of new
  service+wiring code, plus the system_note path is currently
  reserved for parent-session grade summaries. Rejected for v1.
- **Hard-coded prompt strings in the fragment.** Skip the runtime
  `pedagogy.*` lookup and embed the prompt templates directly in the
  fragment string. Simpler but bypasses the pedagogy pack's
  authoritative content; pack updates wouldn't propagate to the
  fragment. Rejected because the pack is the SSOT for pedagogy.

The chosen shape uses the pack's existing tool surface and the mode's
existing prompt-composition pipeline. Minimum new code; maximum reuse
of the patterns already shipped.

## Implementation Order

One child story:

1. `epic-phase-18-metacognitive-prompts-impl` (no deps) — implements
   the fragment factory, modifies four mode files (teach / quiz /
   homework / exam) to opt in with their trigger sets and to add the
   pedagogy.list_metacognitive_prompts tool, and tests in one stride.
   Single file added, four files modified. ~80 lines TS + tests.

## Risks

- **Prompt-quality risk.** The model needs to interpret "use a
  metacognitive prompt at this moment" as a judgment call.
  Over-application clutters the conversation; under-application means
  the feature ships dark. Mitigation: the fragment text explicitly
  says "don't surface multiple metacognitive prompts back-to-back;
  one well-timed prompt beats three perfunctory ones". If quality is
  poor in dev, tighten guidance or move to runtime trigger detection
  as a follow-up.
- **Token-budget impact.** Adding a fragment to four modes increases
  every session's prompt length. The fragment is ~250 words —
  modest, but real. Mitigation: keep guidance concise; the trigger
  list per mode is short (2-3 lines).
- **Exam-mode tool surface tension.** Exam mode's verification stance
  has a strict tool subset. Adding `pedagogy.list_metacognitive_prompts`
  is OK — it's read-only metadata that doesn't reveal answer info —
  but worth verifying that the exam-mode tool-scoping check doesn't
  reject it (the existing test suite for exam mode should catch
  any regression).

## Implementation summary (2026-05-10)

Single child story landed at `stage: review`:

- `epic-phase-18-metacognitive-prompts-impl` (`6e34c37`) —
  `metacognitivePromptsFragment(triggers)` factory + 4 mode opt-ins
  (teach / quiz / homework / exam) + 61 tests (27 unit + 34
  integration).

Cross-cutting deviations:
- Existing per-mode tests (`teach-mode.test.ts`, `quiz-mode.test.ts`,
  `exam-mode.test.ts`) had hardcoded fragment + tool counts that
  needed bumping (8→9 fragments, 9→10 fragments, 4→5 tools). The
  agent updated those alongside the new tests.
- Lint baseline reconciliation: the implementation prompt cited 4
  errors as baseline; actual baseline at HEAD is 9 (all pre-existing
  in `@praxis/claude-cli-sdk` and `@praxis/client` test files). No
  new errors introduced. The "4" earlier was a transient post-`lint:fix`
  reading that drifted back as later commits re-introduced
  auto-fixable issues elsewhere.

Verification at `6e34c37`:
- `pnpm typecheck` clean (all 10 packages)
- `pnpm --filter @praxis/curriculum test` 307 passed
- `pnpm test` (full repo) 2200 passed / 15 skipped
- `pnpm lint` 9 errors (unchanged baseline; zero new from this story)

What's now possible:
- Teach / quiz / homework / exam tutors are now woven through with
  metacognition-coach guidance at the right triggers — pre-reading,
  post-reading, pre-quiz, post-error, session-end.
- The metacognition coach is no longer sequestered to the
  `study-skills` mode (per CURRICULUM.md's "Modes layer the
  metacognition coach's voice on top" assertion).
- `epic-phase-18-routing-integration` is the last remaining Phase 18
  feature — it consumes procedural + affective projections and ties
  the loop closed.

Stage: implementing → review.
