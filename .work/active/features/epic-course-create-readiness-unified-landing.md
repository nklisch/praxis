---
id: epic-course-create-readiness-unified-landing
kind: feature
stage: drafting
tags: [ui, ingestion, bootstrap, configure, course-authoring]
parent: epic-course-create-readiness
depends_on: [epic-course-create-readiness-startup-invisible]
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Course-create unified landing

## Brief

Unify the entry point for course-create: the "Create a course" landing screen
at `/course-create` (the upload / material screen reachable from
Library → Packs → Create a course) should be the single landing surface for
every path that starts a course-design session — onboarding course cards,
library "Create a course" CTA, top-nav, deep links. Today some paths skip
this landing and drop the user directly into a fresh course-create chat,
which fragments the experience.

Four pieces ship together:

1. **Single landing surface.** Every route that begins a course-design
   session funnels through `/course-create`. No deep-link bypasses, no
   "fresh chat with no source" entry.
2. **Pre-seed and start in one click.** Whatever text the user types into
   the landing's prompt is sent as the first message immediately on arrival
   in the course-design view — not left as an empty chat to re-type into.
3. **Visible four-step progress trail.** Surface the arc
   `material · create · confirm · open` so the user understands the journey
   from picking source material through arriving at the live course.
4. **Pack picker in the material step.** Currently there's no pack-picker
   surface anywhere in the app since the redesign, so the canonical packs
   (algebra-1, biology, etc.) are unreachable except via the onboarding
   course cards. Add pack selection alongside upload, paste, and
   "from syllabus" — a single coherent source-selector that restores parity
   with the pre-redesign flow.

## Depends on

- `epic-course-create-readiness-startup-invisible` — the pre-seed-and-start
  flow assumes the visible chat actually surfaces when the engine session
  opens. Without that bug fix, piece (2) silently fails.

## Mockups

Net-new surfaces. `feature-design` (or `epic-design` if it inherits) should
mock the unified landing surface and the four-step progress trail under
`.mockups/screens/epic-course-create-readiness-unified-landing/`. The flow
across `material · create · confirm · open` is multi-screen and warrants a
flow mock under `.mockups/flows/course-create-unified/`.

Tier rule: this feature has an epic parent, so `epic-design` Phase 4.6 is
the primary tier for these mocks.
