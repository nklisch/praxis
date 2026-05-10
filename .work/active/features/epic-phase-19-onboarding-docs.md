---
id: epic-phase-19-onboarding-docs
kind: feature
stage: drafting
tags: [docs]
parent: epic-phase-19-ship-v1
depends_on: [epic-phase-19-first-run-flow]
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Onboarding documentation

## Brief

The v1 documentation pass — README + an onboarding video / screencast plan
— so a new user landing on the repo or the downloads page can install,
launch, and run their first teach session without dev tools or hand-holding.
ROADMAP Phase 19 names this as the "Documentation pass" deliverable.

What this feature covers:

- Rewrite the user-facing portions of `README.md`: a "What is Praxis"
  framing, a quickstart that matches the actual signed-installer flow,
  and a "Run your first session" walkthrough that mirrors the in-app
  first-run flow. The dev-setup section can stay as a deeper "for
  contributors" section.
- An onboarding screencast plan: short outline of the 2-4 minute video
  storyboard ("install → sign in → pick a pack → first teach turn"),
  the script, and where the artefact will be hosted (likely a GitHub
  release asset or a YouTube link in the README).
- In-app help text alignment: where the first-run flow surfaces copy,
  the onboarding doc and the in-app text use consistent terminology
  (no "lesson" in one and "module" in the other, etc.).
- A landing copy pass on `docs/VISION.md` framing where it leaks into
  README — making sure the "what" of Praxis matches what v1 actually
  does.

What this feature does NOT cover:

- Producing the screencast video file itself — that's an out-of-band
  artefact recorded by a human; this feature lands the plan and the
  hosting link, not the editing.
- Marketing copy / website — Praxis ships as a repo + downloads page
  for v1; a marketing site is post-v1.
- Per-mode tutorials inside the app — the in-app first-run flow is the
  tutorial.

## Epic context

- Parent epic: `epic-phase-19-ship-v1`
- Position in epic: depends on `first-run-flow` because the docs document
  the realised flow, not the planned one. The flow needs to exist
  before the docs can describe it accurately.

## Foundation references

- `docs/ROADMAP.md` — Phase 19 build list ("Documentation pass: README +
  onboarding video / screencast").
- `README.md` — the file under rewrite.
- `docs/VISION.md` — the source-of-truth framing the README pulls from.
- `docs/UX.md` — copy tone the doc must match.

<!-- Feature-design pass will scope the README diff, the screencast
outline, and the in-app copy alignment touchpoints. -->
