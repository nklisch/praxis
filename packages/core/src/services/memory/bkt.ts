/**
 * Bayesian Knowledge Tracing (BKT) — pure helper functions.
 *
 * Classic Corbett & Anderson (1995) update. No DB, no imports beyond types.
 * All inputs/outputs in [0..1]; encoding (milli-int) happens at the schema boundary.
 */

import type { MasterySignalKind } from "../../types/memory.js";

/**
 * BKT parameters (four-parameter model).
 *
 *   pL0  — prior probability the student knows the skill before observation
 *   pT   — probability of transitioning from "not learned" to "learned" per opportunity
 *   pG   — guess probability: correct response while not knowing
 *   pS   — slip probability: incorrect response while knowing
 */
export interface BktParams {
  pL0: number;
  pT: number;
  pG: number;
  pS: number;
}

/** Conservative defaults; per-concept overrides deferred to Phase 14. */
/**
 * Conservative defaults; per-concept overrides deferred to Phase 14.
 * pT=0.05 (low per-opportunity learning rate) ensures that an incorrect signal
 * at low mastery produces a net decrease in pKnown — consistent with classic
 * BKT behaviour expectations and the mastery-indexer unit tests.
 */
export const DEFAULT_BKT: BktParams = { pL0: 0.1, pT: 0.05, pG: 0.2, pS: 0.1 };

export interface BktState {
  /** P(L_n) = probability the student knows the skill at observation n. */
  pKnown: number;
  /** Approximate uncertainty (shrinks after each observation). */
  uncertainty: number;
}

/**
 * Initial BKT state from priors.
 * `pKnown` starts at `pL0`; `uncertainty` starts at 0.5 (maximum Bernoulli entropy).
 */
export function bktInitial(params: BktParams = DEFAULT_BKT): BktState {
  return {
    pKnown: clamp01(params.pL0),
    uncertainty: 0.5,
  };
}

/**
 * Translate a `MasterySignalKind` into the (correct?, weight) pair BKT consumes.
 *
 * - `correct`, `exam_pass`    → correct=true
 * - `incorrect`, `exam_fail`  → correct=false
 * - `slip`                    → incorrect with reduced weight (0.5) — mechanical error, not missing concept
 * - `hint_requested`          → incorrect with reduced weight (0.3) — suggests low confidence
 * - `timeout`                 → incorrect with reduced weight (0.3) — stalled, less informative
 *
 * `exam_pass`/`exam_fail` use weight=2 (higher-stakes evidence than a single quiz response).
 */
export function signalToObservation(signal: MasterySignalKind): {
  correct: boolean;
  weight: number;
} {
  switch (signal) {
    case "correct":
      return { correct: true, weight: 1 };
    case "incorrect":
      return { correct: false, weight: 1 };
    case "slip":
      return { correct: false, weight: 0.5 };
    case "hint_requested":
      return { correct: false, weight: 0.3 };
    case "timeout":
      return { correct: false, weight: 0.3 };
    case "exam_pass":
      return { correct: true, weight: 2 };
    case "exam_fail":
      return { correct: false, weight: 2 };
    default: {
      // Exhaustiveness check — TypeScript errors if a new kind is added without a case.
      const _exhaustive: never = signal;
      throw new Error(`Unknown MasterySignalKind: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Apply one BKT update for an observation.
 *
 * Single-observation classic update (Corbett & Anderson, 1995):
 *
 *   if correct:
 *     pKnownGivenObs = pKnown * (1 - pS) / (pKnown * (1 - pS) + (1 - pKnown) * pG)
 *   else:
 *     pKnownGivenObs = pKnown * pS / (pKnown * pS + (1 - pKnown) * (1 - pG))
 *
 *   pKnownNext = pKnownGivenObs + (1 - pKnownGivenObs) * pT
 *
 * For non-unit weight, integer weights are repeated observations. Fractional
 * remainder weights blend toward one additional observation.
 */
export function bktUpdate(
  state: BktState,
  signal: MasterySignalKind,
  params: BktParams = DEFAULT_BKT,
): BktState {
  const pT = clamp01(params.pT);
  const pG = clamp01(params.pG);
  const pS = clamp01(params.pS);
  const { correct, weight } = signalToObservation(signal);
  const safeWeight = Number.isFinite(weight) ? Math.max(0, weight) : 0;
  const wholeUpdates = Math.floor(safeWeight);
  const fractionalUpdate = safeWeight - wholeUpdates;

  let pKnown = clamp01(state.pKnown);
  for (let i = 0; i < wholeUpdates; i++) {
    pKnown = applyOneUpdate(pKnown, correct, pT, pG, pS);
  }

  if (fractionalUpdate > 0) {
    const updated = applyOneUpdate(pKnown, correct, pT, pG, pS);
    pKnown = clamp01(pKnown + (updated - pKnown) * fractionalUpdate);
  }

  // Uncertainty shrinks toward 0 as more evidence accumulates.
  // Formula: uncertainty = sqrt(pNew * (1 - pNew)), which is the Bernoulli std-dev.
  // Clamped to [0..0.5].
  const newUncertainty = clamp(Math.sqrt(pKnown * (1 - pKnown)), 0, 0.5);

  return { pKnown, uncertainty: newUncertainty };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function applyOneUpdate(
  pKnown: number,
  correct: boolean,
  pT: number,
  pG: number,
  pS: number,
): number {
  // Posterior given observation.
  let pKnownGivenObs: number;
  if (correct) {
    const numerator = pKnown * (1 - pS);
    const denominator = numerator + (1 - pKnown) * pG;
    // denominator cannot be zero when pG > 0 and pS < 1; guard anyway.
    pKnownGivenObs = denominator === 0 ? pKnown : numerator / denominator;
  } else {
    const numerator = pKnown * pS;
    const denominator = numerator + (1 - pKnown) * (1 - pG);
    pKnownGivenObs = denominator === 0 ? pKnown : numerator / denominator;
  }

  // Transition: account for learning opportunity.
  const pKnownNext = pKnownGivenObs + (1 - pKnownGivenObs) * pT;
  return clamp01(pKnownNext);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}
