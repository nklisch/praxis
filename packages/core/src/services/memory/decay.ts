/**
 * Decay helper — exponential decay applied at read time.
 *
 * effectivePKnown = pKnown * exp(-elapsedDays / decayDays)
 *
 * No DB, no side effects. Pure function.
 */

export interface DecayInput {
  pKnown: number;
  /**
   * Epoch ms; when undefined, no decay is applied (pristine state — never practiced).
   * NOTE: exactOptionalPropertyTypes is enabled — pass `undefined` explicitly when the
   * caller has `number | undefined`.
   */
  lastPracticedAt: number | undefined;
  /** Epoch ms; current time. */
  now: number;
  /** Half-life constant in days. Clamped to >= 1 to avoid division by zero. */
  decayDays: number;
}

/**
 * Compute the decay-aware effective mastery.
 *
 * Returns `pKnown` unchanged when `lastPracticedAt` is undefined (no practice recorded),
 * or when the elapsed time is zero.
 */
export function applyDecay(input: DecayInput): number {
  const { pKnown, lastPracticedAt, now, decayDays } = input;

  if (lastPracticedAt === undefined) {
    // No practice recorded — no decay applied (pristine state).
    return pKnown;
  }

  const elapsedMs = now - lastPracticedAt;
  if (elapsedMs <= 0) {
    // Practiced right now (or in the future) — no decay.
    return pKnown;
  }

  // Clamp decayDays to >= 1 to avoid division-by-zero / negative-inf.
  const safeDays = Math.max(1, decayDays);
  const elapsedDays = elapsedMs / 86_400_000;

  const factor = Math.exp(-elapsedDays / safeDays);
  // clamp to [0..1] for safety (exp should stay in range, but float arithmetic can drift)
  return Math.min(1, Math.max(0, pKnown * factor));
}

/** Same as `applyDecay` but takes a `Date` for `now` (test convenience). */
export function applyDecayAt(
  args: Omit<DecayInput, "now"> & { lastPracticedAt: number | undefined; now: Date },
): number {
  return applyDecay({
    pKnown: args.pKnown,
    lastPracticedAt: args.lastPracticedAt,
    now: args.now.getTime(),
    decayDays: args.decayDays,
  });
}
