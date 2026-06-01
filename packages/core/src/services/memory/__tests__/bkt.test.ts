import { describe, expect, it } from "vitest";
import { bktInitial, bktUpdate, DEFAULT_BKT, signalToObservation } from "../bkt.js";

describe("bktInitial", () => {
  it("starts at pL0 with uncertainty 0.5", () => {
    const state = bktInitial();
    expect(state.pKnown).toBe(DEFAULT_BKT.pL0);
    expect(state.uncertainty).toBe(0.5);
  });

  it("respects custom pL0", () => {
    const state = bktInitial({ pL0: 0.4, pT: 0.1, pG: 0.2, pS: 0.1 });
    expect(state.pKnown).toBeCloseTo(0.4);
  });
});

describe("signalToObservation", () => {
  it("correct → correct=true, weight=1", () => {
    expect(signalToObservation("correct")).toEqual({ correct: true, weight: 1 });
  });
  it("incorrect → correct=false, weight=1", () => {
    expect(signalToObservation("incorrect")).toEqual({ correct: false, weight: 1 });
  });
  it("slip → correct=false, weight<1", () => {
    const o = signalToObservation("slip");
    expect(o.correct).toBe(false);
    expect(o.weight).toBeLessThan(1);
  });
  it("hint_requested → correct=false, weight<1", () => {
    const o = signalToObservation("hint_requested");
    expect(o.correct).toBe(false);
    expect(o.weight).toBeLessThan(1);
  });
  it("timeout → correct=false, weight<1", () => {
    const o = signalToObservation("timeout");
    expect(o.correct).toBe(false);
    expect(o.weight).toBeLessThan(1);
  });
  it("exam_pass → correct=true, weight=2", () => {
    expect(signalToObservation("exam_pass")).toEqual({ correct: true, weight: 2 });
  });
  it("exam_fail → correct=false, weight=2", () => {
    expect(signalToObservation("exam_fail")).toEqual({ correct: false, weight: 2 });
  });
});

describe("bktUpdate — core acceptance criteria", () => {
  const initial = bktInitial();

  it("correct signal increases pKnown", () => {
    const updated = bktUpdate(initial, "correct");
    expect(updated.pKnown).toBeGreaterThan(initial.pKnown);
  });

  it("incorrect signal decreases pKnown", () => {
    const updated = bktUpdate(initial, "incorrect");
    expect(updated.pKnown).toBeLessThan(initial.pKnown);
  });

  it("slip falls strictly between incorrect and correct updates", () => {
    const afterCorrect = bktUpdate(initial, "correct").pKnown;
    const afterIncorrect = bktUpdate(initial, "incorrect").pKnown;
    const afterSlip = bktUpdate(initial, "slip").pKnown;
    expect(afterSlip).toBeGreaterThan(afterIncorrect);
    expect(afterSlip).toBeLessThan(afterCorrect);
  });

  it("pKnown=1 + incorrect does not produce pKnown < 0", () => {
    const state = { pKnown: 1, uncertainty: 0 };
    const updated = bktUpdate(state, "incorrect");
    expect(updated.pKnown).toBeGreaterThanOrEqual(0);
  });

  it("pKnown=0 + correct does not produce pKnown > 1", () => {
    const state = { pKnown: 0, uncertainty: 0.5 };
    const updated = bktUpdate(state, "correct");
    expect(updated.pKnown).toBeLessThanOrEqual(1);
  });

  it("5 consecutive correct signals → pKnown >= 0.7", () => {
    let state = bktInitial();
    for (let i = 0; i < 5; i++) {
      state = bktUpdate(state, "correct");
    }
    expect(state.pKnown).toBeGreaterThanOrEqual(0.7);
  });

  it("uncertainty shrinks after more observations", () => {
    const s1 = bktUpdate(initial, "correct");
    const s2 = bktUpdate(s1, "correct");
    const s3 = bktUpdate(s2, "correct");
    // uncertainty should approach 0 as pKnown approaches 1
    expect(s3.uncertainty).toBeLessThan(initial.uncertainty);
  });

  it("exam_pass has double impact vs a single correct", () => {
    const afterExam = bktUpdate(initial, "exam_pass").pKnown;
    const afterOneCorrect = bktUpdate(initial, "correct").pKnown;
    expect(afterExam).toBeGreaterThan(afterOneCorrect);
  });

  it("exam_pass matches two repeated correct updates instead of linear extrapolation", () => {
    const afterExam = bktUpdate(initial, "exam_pass").pKnown;
    const afterTwoCorrect = bktUpdate(bktUpdate(initial, "correct"), "correct").pKnown;
    expect(afterExam).toBeCloseTo(afterTwoCorrect);
  });

  it("weighted updates stay finite and below 1 for mid-prior correct evidence", () => {
    const updated = bktUpdate({ pKnown: 0.6, uncertainty: 0.5 }, "exam_pass");
    expect(Number.isFinite(updated.pKnown)).toBe(true);
    expect(updated.pKnown).toBeLessThan(1);
  });

  it("stays in [0..1] for repeated incorrect on already-low state", () => {
    let state = { pKnown: 0.05, uncertainty: 0.5 };
    for (let i = 0; i < 10; i++) {
      state = bktUpdate(state, "incorrect");
      expect(state.pKnown).toBeGreaterThanOrEqual(0);
      expect(state.pKnown).toBeLessThanOrEqual(1);
    }
  });
});
