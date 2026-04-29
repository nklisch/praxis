import { describe, expect, it } from "vitest";
import { applyDecay, applyDecayAt } from "../decay.js";

const NOW = new Date("2025-06-01T12:00:00Z").getTime();
const DAY_MS = 86_400_000;

describe("applyDecay", () => {
  it("no decay when lastPracticedAt is undefined", () => {
    const lastPracticedAt: number | undefined = undefined;
    const result = applyDecay({ pKnown: 0.5, lastPracticedAt, now: NOW, decayDays: 14 });
    expect(result).toBe(0.5);
  });

  it("no decay when lastPracticedAt === now", () => {
    const result = applyDecay({ pKnown: 1, lastPracticedAt: NOW, now: NOW, decayDays: 14 });
    expect(result).toBeCloseTo(1, 10);
  });

  it("after decayDays, result is approximately 1/e of original", () => {
    const result = applyDecay({
      pKnown: 1,
      lastPracticedAt: NOW - 14 * DAY_MS,
      now: NOW,
      decayDays: 14,
    });
    // 1/e ≈ 0.3679
    expect(result).toBeCloseTo(1 / Math.E, 3);
  });

  it("after 2x decayDays, result is approximately 1/e^2", () => {
    const result = applyDecay({
      pKnown: 1,
      lastPracticedAt: NOW - 28 * DAY_MS,
      now: NOW,
      decayDays: 14,
    });
    expect(result).toBeCloseTo(1 / (Math.E * Math.E), 3);
  });

  it("is monotonically decreasing as elapsed time increases", () => {
    const values = [1, 7, 14, 21, 28].map((days) =>
      applyDecay({ pKnown: 1, lastPracticedAt: NOW - days * DAY_MS, now: NOW, decayDays: 14 }),
    );
    for (let i = 1; i < values.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: index within bounds
      expect(values[i]!).toBeLessThan(values[i - 1]!);
    }
  });

  it("clamps decayDays to >= 1 (no division by zero with decayDays=0)", () => {
    expect(() =>
      applyDecay({ pKnown: 0.5, lastPracticedAt: NOW - DAY_MS, now: NOW, decayDays: 0 }),
    ).not.toThrow();
  });

  it("stays in [0..1] for large elapsed time", () => {
    const result = applyDecay({
      pKnown: 1,
      lastPracticedAt: NOW - 10_000 * DAY_MS,
      now: NOW,
      decayDays: 14,
    });
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it("preserves pKnown=0 regardless of elapsed time", () => {
    const result = applyDecay({
      pKnown: 0,
      lastPracticedAt: NOW - 14 * DAY_MS,
      now: NOW,
      decayDays: 14,
    });
    expect(result).toBe(0);
  });
});

describe("applyDecayAt", () => {
  it("accepts a Date for now", () => {
    const now = new Date(NOW);
    const lastPracticedAt: number | undefined = NOW - 14 * DAY_MS;
    const result = applyDecayAt({ pKnown: 1, lastPracticedAt, now, decayDays: 14 });
    expect(result).toBeCloseTo(1 / Math.E, 3);
  });
});
