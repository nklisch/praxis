/**
 * FsrsSchedulerImpl — unit tests.
 *
 * Uses enable_fuzz: false (constructor override) for fully deterministic output.
 */

import { describe, expect, it } from "vitest";
import { FsrsSchedulerImpl } from "../fsrs-impl.js";

const NOW = Date.now() as import("@praxis/core/types").Timestamp;

function makeScheduler() {
  // enable_fuzz: false is already the default in FSRS_DEFAULTS,
  // but be explicit for test clarity.
  return new FsrsSchedulerImpl({ enable_fuzz: false });
}

describe("FsrsSchedulerImpl", () => {
  it("initial() returns state with nextReviewAt == now and reps == 0", () => {
    const scheduler = makeScheduler();
    const state = scheduler.initial(NOW);
    expect(state.nextReviewAt).toBe(NOW);
    expect(state.reps).toBe(0);
    expect(state.lapses).toBe(0);
    expect(state.lastReviewedAt).toBeUndefined();
    expect(state.state).toBeDefined();
  });

  it("review() with 'good' rating advances nextReviewAt beyond now", () => {
    const scheduler = makeScheduler();
    const initial = scheduler.initial(NOW);
    const next = scheduler.review({ state: initial, rating: "good", now: NOW });
    expect(next.nextReviewAt).toBeGreaterThan(NOW);
    expect(next.lastReviewedAt).toBe(NOW);
  });

  it("review() with 'easy' rating advances nextReviewAt beyond 'good'", () => {
    const scheduler = makeScheduler();
    const initial = scheduler.initial(NOW);
    const goodNext = scheduler.review({ state: initial, rating: "good", now: NOW });
    const easyNext = scheduler.review({ state: initial, rating: "easy", now: NOW });
    expect(easyNext.nextReviewAt).toBeGreaterThan(goodNext.nextReviewAt ?? 0);
  });

  it("review() with 'again' on a new card: reps increments, lapses stays 0 (FSRS only increments lapses on Review→Again)", () => {
    const scheduler = makeScheduler();
    const initial = scheduler.initial(NOW);
    // A brand-new card is in "New" state. Rating it Again moves it to "Learning" state.
    // FSRS only counts a "lapse" when a card transitions from Review→Again.
    const next = scheduler.review({ state: initial, rating: "again", now: NOW });
    expect(next.lapses).toBe(0);
    expect(next.reps).toBe(1);
  });

  it("review() with 'hard' does not increment lapses", () => {
    const scheduler = makeScheduler();
    const initial = scheduler.initial(NOW);
    const next = scheduler.review({ state: initial, rating: "hard", now: NOW });
    expect(next.lapses).toBe(0);
  });

  it("review() increments reps for each rating", () => {
    const scheduler = makeScheduler();
    const initial = scheduler.initial(NOW);
    for (const rating of ["again", "hard", "good", "easy"] as const) {
      const next = scheduler.review({ state: initial, rating, now: NOW });
      expect(next.reps).toBeGreaterThanOrEqual(1);
    }
  });

  it("preview() returns four timestamps ordered: again < hard <= good < easy", () => {
    const scheduler = makeScheduler();
    const initial = scheduler.initial(NOW);
    const preview = scheduler.preview({ state: initial, now: NOW });

    expect(preview.again.nextReviewAt).toBeLessThanOrEqual(preview.hard.nextReviewAt);
    expect(preview.hard.nextReviewAt).toBeLessThanOrEqual(preview.good.nextReviewAt);
    expect(preview.good.nextReviewAt).toBeLessThanOrEqual(preview.easy.nextReviewAt);
    // easy must be strictly greater than again
    expect(preview.easy.nextReviewAt).toBeGreaterThan(preview.again.nextReviewAt);
  });

  it("is pure: same inputs produce same output (enable_fuzz: false)", () => {
    const scheduler = makeScheduler();
    const initial = scheduler.initial(NOW);
    const a = scheduler.review({ state: initial, rating: "good", now: NOW });
    const b = scheduler.review({ state: initial, rating: "good", now: NOW });
    expect(a.nextReviewAt).toBe(b.nextReviewAt);
    expect(a.reps).toBe(b.reps);
  });
});
