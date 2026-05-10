---
id: idea-onboarding-course-card-pre-seed
kind: story
stage: drafting
tags: [ui, content]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Pre-seed onboarding course-card messages into the bootstrap session

The first-run-flow course step labels three paths — Algebra (canonical),
Biology (canonical), From your own syllabus — but all three currently
open the same fresh bootstrap session with no pre-seeded message. A user
who clicks "Biology (canonical)" lands in an empty bootstrap chat and
has to remember to ask the agent to use the biology pack — the label
suggests the course should already be on its way.

To make labels match outcomes, the course-card click handler should:

- For Algebra: send an initial message like "Please use the canonical
  algebra-1 pack to create my course." after `session.start`.
- For Biology: same pattern with `biology` pack id.
- For Syllabus: no pre-seeded message (current behaviour).

Implementation needs either a new `session.start({ initialMessage })`
parameter or a follow-up `session.send` call after the session is
opened. The bootstrap-mode role prompt (already strong on calling
`course.list_canonical_packs` first) will do the rest.

This is a UX completion of the onboarding feature, not a blocker. The
agent's initial response in a fresh bootstrap session already nudges
toward canonical packs; the user just has to type their request first.

Origin: review of `epic-phase-19-first-run-flow`.
