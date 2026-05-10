---
id: epic-phase-18-routing-integration
kind: feature
stage: done
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

## Design decisions

- **Single function, additive surface.** Extend `RouterInput` with 3
  optional fields and `RouterSuggestion` with 3 required fields.
  Pure-function constraint preserved — caller threads procedural +
  affective into RouterInput. No new modules, no separate "augment"
  layer. Existing call sites that omit the new inputs continue to
  work; the router treats missing data as "no signal" and defaults to
  normal/lesson-default outputs.
- **Difficulty surfaces as a hint, not a knob.** The tutor reads
  `difficultyHint: "easier" | "normal" | "harder"` and adapts its
  `assignment.create` / `quick_check.*` calls (item count, complexity).
  No tool shape changes. Cleanest extension; teaches the model to
  modulate via prompt-level guidance rather than dragging a difficulty
  scalar through every assessment-authoring path.
- **Frustration trumps procedural for strategy selection.** If
  frustration is spiking, the router forces `worked-examples`
  regardless of procedural preference. Affect-now beats history-aggregate
  when the student is hot — pedagogically sound (cognitive-load
  reduction in the moment) and matches the brief's "worked-examples
  beats Socratic for frustrated students."
- **Procedural preference requires evidenceCount >= 5.** Per the
  procedural-memory feature's risk note, preferences with thin evidence
  are noisy. The router applies an explicit threshold; below 5
  evidence points, falls back to the lesson's `suggestedStrategy`.
  Threshold is configurable via `RouterConfig.proceduralMinEvidence`.
- **Sustained ease requires a full window.** "Harder" only fires when
  the full `affectWindowSize` (default 3) most-recent samples are
  available AND show low-frustration + high-confidence. This avoids
  bumping difficulty on a single transient confident moment.
- **Mode transition is sustained-frustration-only for v1.** The brief
  also mentions "persistent misconception" as a trigger. Misconceptions
  aren't in `RouterInput` today; adding them would expand the surface.
  v1 ships with frustration-driven mode transition only; document the
  misconception seam as a future feature in the risks section.
- **Affect data optional.** RouterInput's affect fields are optional.
  When missing (e.g. fresh install with no affective samples yet),
  the router emits `difficultyHint: "normal"` and
  `suggestedModeTransition: null`. Procedural is similarly optional —
  unset → `suggestedStrategy` falls back to the lesson default.
- **Tutor prompt opt-in for the new fields.** A small addition (1-2
  paragraphs) to `principlesFragment` teaches the model how to honor
  `difficultyHint` and offer `suggestedModeTransition`. Modes that
  already include `principlesFragment` (every student-facing mode) get
  the guidance for free.

## Architectural choice

Extend the existing pure router function with additive RouterInput +
RouterSuggestion fields plus 3 new pure helpers
(`chooseStrategy`, `chooseDifficultyHint`, `chooseModeTransition`).

Considered alternatives:

- **Separate router functions per concern**: `chooseStrategy(input)`,
  `modulateDifficulty(input)`, etc., composed by the caller. Cleaner
  separation but expands the surface — three exports + three call
  sites — for marginal value. Rejected; the helpers are private to
  `router.ts`.
- **New layer wrapping `suggestNext`**: a `routing-augment.ts` that
  takes a `RouterSuggestion` and decorates it with the routing decisions.
  Useful if procedural / affective integration needed to be optional at
  build time (e.g., a slim build of the router without these). v1 doesn't
  need that level of seam — every Praxis deployment includes the
  projections.

The chosen shape stays in one file, reads procedural / affective via
optional RouterInput fields, and emits a consistent RouterSuggestion
that all consumers can rely on.

## Implementation Order

One child story:

1. `epic-phase-18-routing-integration-impl` (no deps on the substrate
   level — both upstream features are at done) — implements the type
   expansion, the three pure helpers, the config additions, the
   `current-concept` caller wiring, the tutor prompt-fragment update,
   and tests in one stride. ~200 lines of TS + tests.

## Risks

- **Heuristic tuning.** The seven new tunables (window size, spike
  delta, ease delta, study-skills delta, evidence threshold, preference
  threshold) carry pedagogical assumptions baked in as defaults. Real
  data may show that 0.2 frustration delta is too tight (false
  spikes) or too loose (missed spikes). Mitigation: defaults are
  explicit in `RouterConfig`; a future Phase 14 evals pass tunes them
  against captured sessions. The new tests assert per-branch behavior,
  not the specific threshold values, so threshold tuning won't churn
  tests.
- **`difficultyHint` is advisory.** The tutor decides whether to act
  on it. If the prompt fragment doesn't land cleanly, the hint shows
  up in the tool output but the tutor ignores it. Mitigation: the
  fragment text is concrete ("if difficultyHint is 'easier', author
  fewer items / simpler items"); if signal-to-action gets lost in dev,
  tighten the prompt or move difficulty to a structured assignment
  parameter in a follow-up.
- **Misconception-driven mode transition deferred.** v1 only triggers
  study-skills on sustained frustration. A persistent-misconception
  trigger would be more pedagogically motivated but requires expanding
  RouterInput to include misconceptions. Documented as a future
  feature seam (likely a small follow-on after this lands).
- **Zero-state behavior matters.** A brand-new student has no
  procedural data, no affective samples, no misconceptions. The
  router must emit sane defaults. The "all optional → emit normal /
  lesson-default / null" path is tested explicitly.

## Implementation summary (2026-05-10)

Single child story landed at `stage: review`:

- `epic-phase-18-routing-integration-impl` (`457b66d`) —
  `RouterInput` gains 3 optional fields; `RouterSuggestion` gains 3
  required fields; `RouterConfig` gains 7 new tunables; 3 chooser
  helpers + 5 supporting helpers in `router.ts`; `currentConceptTool`
  reads procedural + affective via `Promise.all` and threads them in;
  `principlesFragment` gains 2 paragraphs guiding the tutor on
  difficultyHint + suggestedModeTransition; 25 new tests
  (16 router + 9 tool integration).

Cross-cutting deviations / non-obvious decisions:
- **Build required between packages**: vitest resolves cross-package
  imports against `dist/`, not source (the `praxis-source` TS
  condition only applies to typecheck). Agent ran
  `pnpm --filter @praxis/curriculum build` before tools tests could
  see the new RouterSuggestion fields. Documented for future
  cross-package router-extension work.
- **`all_complete` shape**: omits `suggestedStrategy` (no concept
  being taught) but still surfaces `difficultyHint` +
  `suggestedModeTransition` (affect-based signals remain actionable
  even when the lesson stack is empty).
- **lint:fix side-effect**: the agent's `lint:fix` resolved
  pre-existing formatting issues in 3 unrelated files. Lint count
  went 9 → 4 — net improvement, no regression.

Verification at `457b66d`:
- `pnpm typecheck` clean (all 10 packages)
- `pnpm --filter @praxis/curriculum test` 323 passed
- `pnpm --filter @praxis/tools test` 439 passed
- `pnpm test` (full repo) 2225 passed / 15 skipped
- `pnpm lint` 4 errors (down from 9 baseline; zero new from this
  story — net improvement courtesy of lint:fix)

What's now possible:
- `course.current_concept` returns `suggestedStrategy`,
  `difficultyHint`, and `suggestedModeTransition` alongside the
  existing concept fields. The tutor's `principlesFragment`
  instructs it to honor those fields.
- Phase 18's behavioral promise closes: frustration → drop
  difficulty + force worked-examples; sustained ease → push
  difficulty; sustained high frustration → suggest study-skills mode.
- Procedural strategy preferences now feed back into teaching: a
  student who responds well to Socratic over many sessions will
  start seeing Socratic-styled lessons.
- `epic-phase-18-study-skills` epic — all 6 child features now
  shipped or in review. The epic itself is one review pass away from
  done. Phase 19 (ship v1) unblocks next.

Stage: implementing → review.
