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
 * For non-unit weight, the update is applied `weight` times (integer) or blended
 * toward the updated value for fractional weights. Simple approach: apply update
 * once then blend state toward updated by weight fraction.
 */
export function bktUpdate(
  state: BktState,
  signal: MasterySignalKind,
  params: BktParams = DEFAULT_BKT,
): BktState {
  const { pKnown } = state;
  const { pT, pG, pS } = params;
  const { correct, weight } = signalToObservation(signal);

  // Single update
  const updated = applyOneUpdate(pKnown, correct, pT, pG, pS);

  // Blend: new = pKnown + (updated - pKnown) * weight (clamped to [0..1])
  const blended = clamp01(pKnown + (updated - pKnown) * weight);

  // Uncertainty shrinks toward 0 as more evidence accumulates.
  // Formula: uncertainty = sqrt(pNew * (1 - pNew)), which is the Bernoulli std-dev.
  // Clamped to [0..0.5].
  const newUncertainty = clamp(Math.sqrt(blended * (1 - blended)), 0, 0.5);

  return { pKnown: blended, uncertainty: newUncertainty };
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
  return Math.min(1, Math.max(0, v));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
