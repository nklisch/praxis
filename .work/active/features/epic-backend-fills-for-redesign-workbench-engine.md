---
id: epic-backend-fills-for-redesign-workbench-engine
kind: feature
stage: drafting
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Workbench recommendation engine

## Brief

The locked Workbench discovery surface (`epic-ui-redesign-ground-up-discovery-surfaces`
Option 4) opens with **"There's three things ready for you"** — a
priority-ordered queue of actions the student should pick up *right now*,
each with a reason string ("Continuing now keeps the chain — coming back
tomorrow loses the thread"). Without a backend recommendation service, the
Workbench falls back to a flat "recent sessions" list and loses its
distinctive posture.

This feature adds a new **`RecommendationService`** in `@praxis/core` that
returns priority-ordered "what's next" items. Inputs: open sessions
(paused / mid-conversation), spaced-review queue (cards due now / soon),
mastery state (concepts under threshold that gate next lessons), pending
course-create drafts, suggested quick-checks. Output: an ordered list of
typed action items with reason strings and CTAs.

What this feature does **not** cover: the Workbench UI itself (lives in
`epic-ui-redesign-ground-up-discovery-surfaces` implementation); the
spaced-review scheduler (assumed to exist or be added separately).

## Epic context

- Parent epic: `epic-backend-fills-for-redesign`
- Position in epic: **independent** — no within-epic deps. Can land in
  parallel with everything else.
- UI co-ships with: `epic-ui-redesign-ground-up-discovery-surfaces`
  implementation (which consumes this service to render the Workbench).

## Foundation references

- `docs/ARCHITECTURE.md` § "Components" → `@praxis/core` (will add
  `RecommendationService` to the responsibility list when this ships)
- `docs/CURRICULUM.md` § "Adaptive routing" — the route already
  suggests modes after N concepts / mastery thresholds; this service
  generalises that pattern to the front-door queue
- `.mockups/screens/epic-ui-redesign-ground-up-discovery-surfaces/option-4.html`
  — the Workbench mock that consumes this service
- `.mockups/flows/session-loop/01-workbench.html` + `05-session-end.html`
  — flow showing the queue refresh after a lesson lands

<!-- The design pass (/agile-workflow:feature-design) will define the
service interface, the input signal set, the priority algorithm, and
the reason-string composition. -->
