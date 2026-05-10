---
id: epic-phase-18-metacognitive-prompts
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
