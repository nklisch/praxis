---
id: epic-phase-18-routing-integration-impl
kind: story
stage: done
tags: [content]
parent: epic-phase-18-routing-integration
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Router consumes procedural + affective; surfaces strategy / difficulty / mode-transition

## Scope

Extend the Phase 10 `suggestNext` router to consume procedural strategy
preferences and affective signals. Add 3 fields to `RouterInput` and 3
fields to `RouterSuggestion`. Wire `course.current_concept` to thread
the new data through and surface the new fields in its output. Tests.

The design lives in the parent feature body
(`epic-phase-18-routing-integration`); read it for architecture and
design decisions.

## Units

### Unit 1: `RouterInput` + `RouterSuggestion` expansion

**File**: `packages/curriculum/src/router/types.ts`

Add additive fields. Pure-function shape preserved.

```typescript
export interface RouterInput {
  // ── existing fields, unchanged ─────────────────────────────────────────────
  snapshot: CourseStateSnapshot;
  masteryByConceptId: ReadonlyMap<string, number>;
  uncertaintyByConceptId: ReadonlyMap<string, number>;
  lastPracticedByConceptId: ReadonlyMap<string, Timestamp>;
  now: Timestamp;
  decayDays: number;

  // ── Phase 18 additions ─────────────────────────────────────────────────────
  /**
   * Per-strategy preference + evidence count, from the procedural
   * indexer's projection. The router weights preferences by
   * `evidenceCount` — preferences with fewer than `proceduralMinEvidence`
   * (config; default 5) data points are treated as noisy and skipped.
   * Optional: when undefined, the router uses the lesson's
   * `suggestedStrategy` as-is.
   */
  proceduralStrategies?: ReadonlyMap<string, { preference: number; evidenceCount: number }>;
  /**
   * Rolling baseline averages for engagement / frustration / confidence.
   * Optional: when undefined, the router skips difficulty modulation
   * and mode-transition suggestions.
   */
  affectiveBaseline?: { engagement: number; frustration: number; confidence: number };
  /**
   * Most-recent affect samples (most-recent first). The router averages
   * the first K (config; default 3) when computing spike / ease detection.
   * Optional: when undefined or empty, the router skips difficulty
   * modulation and mode-transition suggestions.
   */
  recentAffect?: ReadonlyArray<{
    engagement: number;
    frustration: number;
    confidence: number;
  }>;
}

export interface RouterSuggestion {
  // ── existing fields, unchanged ─────────────────────────────────────────────
  primary: ConceptCandidate | null;
  reviews: ConceptCandidate[];
  interleaves: ConceptCandidate[];

  // ── Phase 18 additions ─────────────────────────────────────────────────────
  /**
   * The teaching strategy the router recommends for the primary concept.
   * Defaults to the current lesson's `suggestedStrategy`; overridden by
   * procedural preferences when evidence is sufficient, or by frustration
   * fallback to a low-cognitive-load strategy.
   */
  suggestedStrategy: StrategyId;
  /**
   * Difficulty modulation hint:
   * - `"easier"`: frustration spike detected — back off difficulty.
   * - `"harder"`: sustained ease detected — push difficulty.
   * - `"normal"`: neither signal detected (or insufficient affective data).
   *
   * The tutor reads this and adjusts its `assignment.create` /
   * `quick_check.*` calls (item count, complexity) accordingly. The
   * tools themselves don't change shape.
   */
  difficultyHint: "easier" | "normal" | "harder";
  /**
   * Mode-transition suggestion:
   * - `"study-skills"`: sustained high frustration; the tutor should
   *   propose a study-skills coaching session via
   *   `course.suggest_alternative` (or weave the suggestion into chat).
   * - `null`: no transition recommended.
   *
   * v1 only suggests `study-skills`; the field is structured as a
   * mode-id-or-null union for future extensions.
   */
  suggestedModeTransition: "study-skills" | null;
}
```

**Acceptance**:
- [ ] All new fields are required on `RouterSuggestion` (the router
      always emits values).
- [ ] All new fields are optional on `RouterInput` (callers without
      access to the projections can omit them).
- [ ] Existing tests continue to pass (additive change only).

### Unit 2: Router logic

**File**: `packages/curriculum/src/router/router.ts`

Three new pure helper functions; wired into `suggestNext` after
`primary` is computed.

```typescript
/** Choose a teaching strategy, weighing procedural preferences + affective. */
function chooseStrategy(
  input: RouterInput,
  config: RouterConfig,
  primaryLessonId: LessonId | null,
): StrategyId {
  // Default: the current lesson's suggestedStrategy.
  const lesson = primaryLessonId
    ? input.snapshot.lessons.find((l) => l.id === primaryLessonId)
    : null;
  const lessonStrategy = lesson?.suggestedStrategy ?? brandId<"StrategyId">("worked-examples");

  // Frustration fallback: if frustration is spiking above baseline, force
  // worked-examples (low cognitive load). Beats both lesson default and
  // procedural override — affect trumps history when the student is hot.
  if (isFrustrationSpike(input, config)) {
    return brandId<"StrategyId">("worked-examples");
  }

  // Procedural override: if the student has a clear preference for a
  // specific strategy and enough evidence to trust it, use that.
  const top = topProceduralStrategy(input, config);
  if (top) return top;

  // No override; use the lesson's declared strategy.
  return lessonStrategy;
}

function chooseDifficultyHint(
  input: RouterInput,
  config: RouterConfig,
): "easier" | "normal" | "harder" {
  if (!input.affectiveBaseline || !input.recentAffect || input.recentAffect.length === 0) {
    return "normal"; // no affective data to act on
  }
  if (isFrustrationSpike(input, config)) return "easier";
  if (isSustainedEase(input, config)) return "harder";
  return "normal";
}

function chooseModeTransition(
  input: RouterInput,
  config: RouterConfig,
): "study-skills" | null {
  // v1: only sustained high frustration triggers a study-skills suggestion.
  // Persistent-misconception trigger is documented as a future seam in the
  // feature body — it requires the misconception projection in RouterInput,
  // which is out of scope here.
  if (isSustainedHighFrustration(input, config)) return "study-skills";
  return null;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function isFrustrationSpike(input: RouterInput, config: RouterConfig): boolean {
  if (!input.affectiveBaseline || !input.recentAffect || input.recentAffect.length === 0) {
    return false;
  }
  const window = input.recentAffect.slice(0, config.affectWindowSize);
  const avgFrustration = avg(window.map((s) => s.frustration));
  return avgFrustration > input.affectiveBaseline.frustration + config.frustrationSpikeDelta;
}

function isSustainedEase(input: RouterInput, config: RouterConfig): boolean {
  if (!input.affectiveBaseline || !input.recentAffect || input.recentAffect.length === 0) {
    return false;
  }
  const window = input.recentAffect.slice(0, config.affectWindowSize);
  if (window.length < config.affectWindowSize) return false; // need full window
  const avgFrustration = avg(window.map((s) => s.frustration));
  const avgConfidence = avg(window.map((s) => s.confidence));
  return (
    avgFrustration < input.affectiveBaseline.frustration - config.easeFrustrationDelta &&
    avgConfidence > input.affectiveBaseline.confidence + config.easeConfidenceDelta
  );
}

function isSustainedHighFrustration(input: RouterInput, config: RouterConfig): boolean {
  if (!input.affectiveBaseline || !input.recentAffect || input.recentAffect.length === 0) {
    return false;
  }
  const window = input.recentAffect.slice(0, config.affectWindowSize);
  if (window.length < config.affectWindowSize) return false;
  const avgFrustration = avg(window.map((s) => s.frustration));
  return avgFrustration > input.affectiveBaseline.frustration + config.studySkillsFrustrationDelta;
}

function topProceduralStrategy(
  input: RouterInput,
  config: RouterConfig,
): StrategyId | null {
  if (!input.proceduralStrategies) return null;
  let best: { id: StrategyId; preference: number } | null = null;
  for (const [id, p] of input.proceduralStrategies) {
    if (p.evidenceCount < config.proceduralMinEvidence) continue;
    if (p.preference < config.proceduralMinPreference) continue;
    if (best === null || p.preference > best.preference) {
      best = { id: brandId<"StrategyId">(id), preference: p.preference };
    }
  }
  return best?.id ?? null;
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
```

`suggestNext` integrates the helpers after `primary` is resolved:

```typescript
const primary = pickPrimary(currentCandidates, config);
const reviews = pickReviews(earlierCandidates, config);
const interleaves = pickInterleaves(earlierCandidates, input, config, reviews);

return {
  primary,
  reviews,
  interleaves,
  suggestedStrategy: chooseStrategy(input, config, primary?.lessonId ?? null),
  difficultyHint: chooseDifficultyHint(input, config),
  suggestedModeTransition: chooseModeTransition(input, config),
};
```

**Acceptance**:
- [ ] No `affectiveBaseline` / `recentAffect` → `difficultyHint:
      "normal"`, `suggestedModeTransition: null`.
- [ ] No `proceduralStrategies` → `suggestedStrategy` falls back to
      lesson default (or `"worked-examples"` if no lesson).
- [ ] Frustration spike → `difficultyHint: "easier"` AND
      `suggestedStrategy: "worked-examples"` (frustration trumps
      procedural).
- [ ] Sustained ease → `difficultyHint: "harder"`.
- [ ] Sustained high frustration → `suggestedModeTransition:
      "study-skills"`.
- [ ] Procedural preference with `evidenceCount >= 5` AND `preference >=
      0.3` → that strategy wins (in non-frustration case).
- [ ] Procedural preference with `evidenceCount < 5` → ignored, falls
      back to lesson default.

### Unit 3: Router config additions

**File**: `packages/curriculum/src/router/config.ts`

```typescript
export interface RouterConfig {
  // ... existing fields, unchanged ...

  // ── Phase 18 routing-integration additions ─────────────────────────────────
  /** Window size (most-recent samples) to average for affect spike/ease detection. Default: 3. */
  affectWindowSize: number;
  /** Frustration delta above baseline that constitutes a "spike". Default: 0.2. */
  frustrationSpikeDelta: number;
  /** Frustration delta below baseline (toward 0) for sustained ease. Default: 0.15. */
  easeFrustrationDelta: number;
  /** Confidence delta above baseline for sustained ease. Default: 0.15. */
  easeConfidenceDelta: number;
  /** Frustration delta above baseline that triggers a study-skills transition. Default: 0.3. */
  studySkillsFrustrationDelta: number;
  /** Minimum evidence count for procedural preferences to be honored. Default: 5. */
  proceduralMinEvidence: number;
  /** Minimum preference (0..1) for procedural override. Default: 0.3. */
  proceduralMinPreference: number;
}

export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  // ... existing defaults ...
  affectWindowSize: 3,
  frustrationSpikeDelta: 0.2,
  easeFrustrationDelta: 0.15,
  easeConfidenceDelta: 0.15,
  studySkillsFrustrationDelta: 0.3,
  proceduralMinEvidence: 5,
  proceduralMinPreference: 0.3,
} as const satisfies RouterConfig;
```

**Acceptance**:
- [ ] All 7 new fields present with documented defaults.
- [ ] DEFAULT_ROUTER_CONFIG continues to satisfy the type and is
      `as const`.

### Unit 4: `course.current_concept` caller wiring

**File**: `packages/tools/src/course/current-concept.ts`

Read procedural + affective from MemoryService and thread into the
router. Surface the 3 new fields in the OutputSchema.

```typescript
// Inside the handler, after building masteryByConceptId etc:

const proceduralModel = await memory.procedural(studentId);
const affectiveModel = await memory.affective(studentId);

// Build the procedural map for the router (string keys; router brands at read).
const proceduralStrategies = new Map<string, { preference: number; evidenceCount: number }>();
for (const [id, pref] of proceduralModel.strategies) {
  proceduralStrategies.set(id as string, {
    preference: pref.preference,
    evidenceCount: pref.evidenceCount,
  });
}

const recentAffect = affectiveModel.recent.map((s) => ({
  engagement: s.engagement,
  frustration: s.frustration,
  confidence: s.confidence,
}));

const suggestion = suggestNext({
  snapshot,
  masteryByConceptId,
  uncertaintyByConceptId,
  lastPracticedByConceptId,
  now: Date.now() as Timestamp,
  decayDays,
  proceduralStrategies, // ← Phase 18
  affectiveBaseline: affectiveModel.baseline, // ← Phase 18
  recentAffect, // ← Phase 18
});
```

OutputSchema gains:

```typescript
{
  // ... existing fields ...
  suggestedStrategy: z.string(),
  difficultyHint: z.enum(["easier", "normal", "harder"]),
  suggestedModeTransition: z.enum(["study-skills"]).nullable(),
}
```

**Acceptance**:
- [ ] `currentConceptTool` reads procedural + affective from memory and
      threads them in.
- [ ] OutputSchema includes the 3 new fields in both the `kind: "ok"`
      and the `all_complete` cases (in the all-complete case, the
      strategy is `null` or omitted; difficulty + mode-transition can
      still be computed).
- [ ] Existing test fixtures that don't supply procedural/affective
      continue to pass — the tool wires defaults / undefineds and the
      router treats undefined gracefully.

### Unit 5: Tutor prompt fragment opt-in

**File**: `packages/curriculum/src/modes/fragments/principles.ts` (or a
new fragment, decided in implementation)

The tutor needs to know how to honor `difficultyHint` and act on
`suggestedModeTransition`. Add 2-4 sentences to the principles fragment
explaining:

- "If `course.current_concept` returns `difficultyHint: 'easier'` /
  `'harder'`, adapt your next question / item to that target."
- "If it returns `suggestedModeTransition: 'study-skills'`, weave a
  suggestion into chat: 'Looks like this is getting frustrating —
  shall we step back and work on study skills for a bit?' Don't force
  the transition; offer it."

This is a small addition to the existing `principlesFragment` template
text. The fragment doesn't change shape; it gains 1-2 paragraphs of
guidance.

**Acceptance**:
- [ ] `principlesFragment.template` includes guidance on
      `difficultyHint` and `suggestedModeTransition`.
- [ ] No mode definitions change beyond what they already pull in via
      the principles fragment.

### Unit 6: Tests

**File**:
`packages/curriculum/src/router/__tests__/routing-integration.test.ts`

Pure-function router tests covering each branch:
- No procedural / no affective → defaults (suggestion: lesson default,
  hint: normal, transition: null).
- Frustration spike (recent avg > baseline + 0.2) → hint: easier;
  strategy override forces worked-examples even if procedural prefers
  Socratic.
- Sustained ease (3 samples below frustration baseline AND above
  confidence baseline) → hint: harder.
- Sustained high frustration (recent avg > baseline + 0.3) →
  transition: study-skills.
- Procedural preference: prefer `socratic` with evidence ≥ 5 →
  suggestion: socratic.
- Procedural preference: prefer `socratic` with evidence < 5 →
  fallback to lesson default.
- Empty `recentAffect` → hint: normal, transition: null even when
  baseline is provided.

**File**:
`packages/tools/src/course/__tests__/current-concept-routing.test.ts`

Integration tests:
- Mock memory service returning real `ProceduralModel` / `AffectiveModel`
  shapes; assert the suggestion's new fields propagate to the tool's
  output.
- Tool output schema validates with the new fields.

## Acceptance criteria (story)

- [ ] `RouterInput` gains 3 optional fields (procedural, baseline,
      recentAffect).
- [ ] `RouterSuggestion` gains 3 required fields (suggestedStrategy,
      difficultyHint, suggestedModeTransition).
- [ ] `RouterConfig` gains 7 new tunables with documented defaults.
- [ ] `chooseStrategy` / `chooseDifficultyHint` /
      `chooseModeTransition` are pure helper functions in `router.ts`.
- [ ] `currentConceptTool` reads procedural + affective from memory and
      surfaces the new fields in its output.
- [ ] Tutor's `principlesFragment` gains 1-2 paragraphs explaining how
      to act on the new fields.
- [ ] All existing router and current-concept tests continue to pass.
- [ ] New unit + integration tests cover every branch in unit 6.
- [x] `pnpm typecheck && pnpm test` green.
- [x] `pnpm lint` shows no regression past the current 9-error baseline.

## Implementation notes

### Files created
- `packages/curriculum/src/router/__tests__/routing-integration.test.ts` — 16 pure-function router tests covering all acceptance-criteria branches.
- `packages/tools/src/course/__tests__/current-concept-routing.test.ts` — 9 integration tests for the tool's new output fields.

### Files modified
- `packages/curriculum/src/router/types.ts` — added 3 optional `RouterInput` fields and 3 required `RouterSuggestion` fields, plus `StrategyId` import.
- `packages/curriculum/src/router/config.ts` — added 7 new tunables to `RouterConfig` and `DEFAULT_ROUTER_CONFIG`.
- `packages/curriculum/src/router/router.ts` — added `chooseStrategy`, `chooseDifficultyHint`, `chooseModeTransition` (3 choosers) and `isFrustrationSpike`, `isSustainedEase`, `isSustainedHighFrustration`, `topProceduralStrategy`, `avg` (5 helpers). Wired into `suggestNext` return. Also fixed the early-return path (no currentLesson) to include the 3 new required fields.
- `packages/tools/src/course/current-concept.ts` — reads `memory.procedural()` + `memory.affective()` in parallel. Threads `proceduralStrategies`, `affectiveBaseline`, `recentAffect` into router. Surfaces 3 new fields in `"ok"` response and `"all_complete"` response (all_complete gets `difficultyHint` + `suggestedModeTransition`).
- `packages/curriculum/src/modes/fragments/principles.ts` — appended 2 paragraphs explaining `difficultyHint` and `suggestedModeTransition` to the tutor.
- `packages/tools/src/course/__tests__/current-concept-adaptive.test.ts` — updated `makeCtxForSnapshot` and one inline test to add `procedural` + `affective` mocks (required since the handler now calls both).
- `packages/curriculum/src/modes/fragments/metacognitive-prompts.ts` + related test files — formatting-only changes from `pnpm lint:fix`.

### Discrepancies from design
- The design specified `all_complete` case doesn't include `suggestedStrategy`. The story says both `"ok"` and `all_complete` should have the fields. The implementation follows the story: `all_complete` gets `difficultyHint` + `suggestedModeTransition` (affect-based signals still useful), but NOT `suggestedStrategy` (no concept being taught → no strategy needed).
- Lint baseline improved from 9 to 4 errors (lint:fix resolved pre-existing formatting issues in unrelated files during the fix pass).

### Build note
After editing router source, `pnpm --filter @praxis/curriculum build` was needed before running tools tests. The `praxis-source` TS custom condition applies to typecheck only; vitest resolves cross-package imports against `dist/` at runtime.

### Verification results
- `pnpm typecheck`: green (all packages).
- `pnpm --filter @praxis/curriculum test`: 323 tests passed (25 files), includes 16 new routing-integration tests.
- `pnpm --filter @praxis/tools test`: 439 tests passed (58 files, 1 skipped), includes 9 new current-concept-routing tests.
- `pnpm test` (full repo): 2225 passed, 15 skipped (268 test files).
- `pnpm lint`: 4 errors (down from 9 baseline; all remaining errors are pre-existing in unmodified files).

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none

**Nits** (in conversation only):
- Asymmetry between `isFrustrationSpike` (doesn't require full window)
  and `isSustainedEase` / `isSustainedHighFrustration` (require full
  `affectWindowSize` window). Intentional — frustration is an
  instantaneous concern; ease is a sustained pattern — but a one-line
  comment in `router.ts` near each helper would help future readers
  understand the asymmetry without re-deriving it from the design.
- The early-return path at `router.ts:35` emits
  `suggestedStrategy: "worked-examples"` as a literal. Reasonable
  default for the no-lesson case but couples the early-return to a
  specific strategy id. A future pack rename would need updating
  here too. Minor — flagged for visibility.

**Notes**:
- Verified at HEAD (`7ba5586`): `pnpm typecheck` clean;
  `pnpm --filter @praxis/curriculum test` 323 passed;
  `pnpm --filter @praxis/tools test` 439 passed; `pnpm test`
  (full repo) 2225 passed / 15 skipped; `pnpm lint` 4 errors
  (down from 9 baseline; net improvement from agent's `lint:fix`
  pass).
- Implementation matches the design exactly: 3 optional
  RouterInput fields, 3 required RouterSuggestion fields, 7 new
  RouterConfig tunables with documented defaults, 3 chooser
  helpers + 5 supporting helpers (`isFrustrationSpike`,
  `isSustainedEase`, `isSustainedHighFrustration`,
  `topProceduralStrategy`, `avg`), wired into `suggestNext` for
  both the early-return (no-lesson) path and the main path.
- `currentConceptTool` reads procedural + affective via
  `Promise.all` (parallel) and threads them in. OutputSchema
  surfaces all 3 new fields in `kind: "ok"` and 2 of 3 in
  `kind: "all_complete"` (omits `suggestedStrategy` since no
  concept is being taught — sensible).
- `principlesFragment` gains 2 paragraphs guiding the tutor on
  honoring `difficultyHint` (adapt next assignment / quick_check
  complexity) and `suggestedModeTransition` (offer the transition,
  don't force it). Modes that include the principles fragment all
  get this guidance for free.
- Pure-function constraint preserved — no DB access, no `Date.now()`
  inside the router. Caller threads in. Tests run in microseconds.
- 25 new tests across 2 files cover every branch: no procedural /
  no affective → defaults; frustration spike → easier + worked-examples
  override; sustained ease → harder; sustained high frustration →
  study-skills transition; procedural preference with sufficient
  evidence → wins; preference with insufficient evidence → ignored;
  zero-state inputs → sane defaults.
- Cross-package build dance documented as a non-obvious decision —
  vitest resolves cross-package imports against `dist/`, not source,
  so the agent ran `pnpm --filter @praxis/curriculum build` before
  tools tests could see the new RouterSuggestion fields. Worth
  noting for future router-extension work.

What's now possible: Phase 18's behavioral promise is closed. A
student who shows sustained frustration sees the next item drop in
difficulty AND gets `worked-examples` as the teaching strategy AND
gets a "want to step back into study-skills?" suggestion. A student
who shows sustained ease and confidence sees difficulty bump up.
Strategy preferences accumulate over sessions and the router honors
them once they're well-evidenced. The metacognition loop the
ROADMAP test checkpoint asks for is now wired end-to-end.

What's now possible at the epic level: `epic-phase-18-study-skills`
has all 6 children at done or one review pass away. The Phase 18
epic auto-advances to review when this story's parent feature reaches
done.
