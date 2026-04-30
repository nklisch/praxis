/**
 * GateEvaluatorImpl — pure logic over a list of gates.
 * Takes readers as parameters; does no DB writes.
 * Lives in @praxis/curriculum because gate evaluation is curriculum logic.
 */
import type {
  Gate,
  GateEvaluation,
  GateEvaluationEntry,
  GateEvaluator,
  GateEvaluatorInput,
  GateState,
  GateTransition,
  SuccessCriteria,
} from "@praxis/core/types";
import { evaluateSuccessCriteria } from "./criteria.js";

export class GateEvaluatorImpl implements GateEvaluator {
  async evaluate(input: GateEvaluatorInput): Promise<GateEvaluation> {
    const evaluations = new Map<string, GateEvaluationEntry>();

    // Topological iteration: prerequisites must be evaluated before dependents.
    // We approximate via repeated passes. Safety counter prevents infinite loops
    // from cyclic prerequisites.
    let changed = true;
    let safety = input.gates.length + 1;

    while (changed && safety-- > 0) {
      changed = false;
      for (const gate of input.gates) {
        if (evaluations.has(gate.id)) continue;
        // All prerequisites must have been evaluated.
        if (!gate.prerequisites.every((p) => evaluations.has(p))) continue;

        const entry = await this.evaluateGate(gate, evaluations, input);
        evaluations.set(gate.id, entry);
        changed = true;
      }
    }

    if (evaluations.size !== input.gates.length) {
      input.log?.warn("gate.evaluator.cycle_or_missing_prereq", {
        evaluated: evaluations.size,
        total: input.gates.length,
      });
    }

    const perGate = input.gates
      .map((g) => evaluations.get(g.id))
      .filter((e): e is GateEvaluationEntry => e !== undefined);

    const transitions: GateTransition[] = [];
    for (const e of perGate) {
      if (e.beforeState.kind !== "unlocked" && e.afterState.kind === "unlocked") {
        transitions.push({
          kind: "unlocked",
          gateId: e.gateId,
          at: input.now,
          evidence: (e.afterState as Extract<GateState, { kind: "unlocked" }>).evidence,
        });
      }
      // re-locked transitions are not produced in v1.
    }

    return { perGate, transitions };
  }

  private async evaluateGate(
    gate: Gate,
    priorEvaluations: Map<string, GateEvaluationEntry>,
    input: GateEvaluatorInput,
  ): Promise<GateEvaluationEntry> {
    // Already overridden? Treat as unlocked, never change.
    if (gate.state.kind === "overridden") {
      return {
        gateId: gate.id,
        beforeState: gate.state,
        afterState: gate.state,
        progress: 1,
        lockReason: "",
        summaryText: "(manually overridden)",
      };
    }

    // Already unlocked? Stay unlocked. (No re-locking in v1.)
    if (gate.state.kind === "unlocked") {
      return {
        gateId: gate.id,
        beforeState: gate.state,
        afterState: gate.state,
        progress: 1,
        lockReason: "",
        summaryText: this.summarizeCriteria(gate.successCriteria),
      };
    }

    // Currently locked. Check prerequisites first.
    const missingPrereqs = gate.prerequisites.filter((p) => {
      const prior = priorEvaluations.get(p);
      return !prior || prior.afterState.kind !== "unlocked";
    });

    if (missingPrereqs.length > 0) {
      const after: GateState = { kind: "locked", missingPrerequisites: missingPrereqs };
      return {
        gateId: gate.id,
        beforeState: gate.state,
        afterState: after,
        progress: 0,
        lockReason: `prerequisite gates not yet unlocked (${missingPrereqs.length})`,
        summaryText: this.summarizeCriteria(gate.successCriteria),
      };
    }

    // Prerequisites OK — evaluate the success criteria.
    const ev = await evaluateSuccessCriteria(
      gate.successCriteria,
      input.studentId,
      input.masteryReader,
      input.gradeReader,
    );

    if (ev.satisfied) {
      const after: GateState = {
        kind: "unlocked",
        unlockedAt: input.now,
        evidence: this.collectEvidence(gate.successCriteria),
      };
      return {
        gateId: gate.id,
        beforeState: gate.state,
        afterState: after,
        progress: 1,
        lockReason: "",
        summaryText: ev.summary,
      };
    }

    return {
      gateId: gate.id,
      beforeState: gate.state,
      afterState: { kind: "locked", missingPrerequisites: [] },
      progress: ev.progress,
      lockReason: ev.unsatisfiedReason,
      summaryText: ev.summary,
    };
  }

  /**
   * Lightweight pre-eval summary that doesn't need readers.
   * Used as fallback for already-unlocked gates.
   */
  private summarizeCriteria(c: SuccessCriteria): string {
    switch (c.kind) {
      case "mastery-threshold":
        return `mastery ≥ ${c.minScore.toFixed(2)} on ${c.conceptIds.length} concept${c.conceptIds.length === 1 ? "" : "s"}`;
      case "exam-pass":
        return `exam pass ≥ ${c.minScore.toFixed(2)}`;
      case "and":
        return c.criteria.map((s) => this.summarizeCriteria(s)).join(" AND ");
      case "or":
        return c.criteria.map((s) => this.summarizeCriteria(s)).join(" OR ");
    }
  }

  /**
   * Walk the SuccessCriteria tree and collect evidence references.
   * Phase 14 may add concept-event evidence; v1 only collects assignment evidence.
   */
  private collectEvidence(
    c: SuccessCriteria,
  ): Array<{ kind: "event" | "assignment" | "manual"; id: string }> {
    switch (c.kind) {
      case "mastery-threshold":
        // Phase 14 may add concept-event evidence; v1 leaves empty.
        return [];
      case "exam-pass":
        return [{ kind: "assignment" as const, id: c.assignmentId }];
      case "and":
      case "or":
        return c.criteria.flatMap((s) => this.collectEvidence(s));
    }
  }
}
