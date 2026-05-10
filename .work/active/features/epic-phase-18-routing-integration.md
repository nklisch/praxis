---
id: epic-phase-18-routing-integration
kind: feature
stage: drafting
tags: [content]
parent: epic-phase-18-study-skills
depends_on: [epic-phase-18-procedural-memory, epic-phase-18-affective-memory]
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Adaptive routing: read procedural + affective into next-step decisions

## Brief

The Phase 10 `suggestNext` router (`packages/curriculum/src/router/router.ts`)
is concept-aware (mastery, decay, frontier, interleave) but does NOT yet
read procedural strategy preferences or affective signals. This feature
closes the loop: now that procedural and affective projections are real
(features 2 and 3), the router uses them.

What this delivers:

- Router input expansion: `RouterInput` gains `proceduralStrategies` and
  `affectiveBaseline` / `recentAffect` fields. The function stays pure (no
  DB access inside the router); the caller threads in the data.
- Strategy selection logic: when a concept is being taught, choose the
  teaching strategy by procedural preference (worked-examples beats
  Socratic for novice / frustrated students; Socratic preferred only when
  procedural confirms it lands and affective shows confident engagement).
- Difficulty modulation: a frustration spike (recent samples > baseline +
  threshold) drops the next item's difficulty target by one notch; sustained
  ease (low frustration, high confidence over the last K samples) raises it.
  Default targets the existing ~85% success-rate aim from `CURRICULUM.md`.
- Mode-transition suggestion expansion: persistent misconceptions surface a
  hint to enter `study-skills` mode for explicit remediation — wires into
  the `course.suggest_alternative` exception path.
- Test checkpoint from `docs/ROADMAP.md` Phase 18: "Run several teach
  sessions; procedural memory reflects strategy preferences. Force a
  frustration trigger; difficulty backs off next item." This feature is the
  one that satisfies that test.

What this feature does NOT cover: changing the router's pure-function shape
beyond the additive input fields; rewriting concept selection (still
frontier-first); the indexers themselves (those land in features 2 and 3
and are pre-requisites).

## Epic context

- Parent epic: `epic-phase-18-study-skills`
- Position in epic: terminal feature — the read side of the loop the
  indexers wrote. Closes Phase 18's behavioural promise.

## Foundation references

- `docs/CURRICULUM.md` — Adaptive routing section, especially "Inputs to the
  router" and "Routing decisions" (lines ~171-189)
- `packages/curriculum/src/router/router.ts` — Phase 10 `suggestNext`
  implementation (the seam this feature extends)
- `docs/CONTRACT.md` — `ProceduralModel`, `AffectiveModel`,
  `RouterSuggestion`
- `docs/ROADMAP.md` Phase 18 — test checkpoint specifically calls for this
  loop to close
