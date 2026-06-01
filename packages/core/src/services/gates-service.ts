import { gates as gatesTable, gateUnlockEvents } from "@praxis/artifacts/schema";
import { GateEvaluatorImpl } from "@praxis/curriculum/gates";
import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  ConfiguratorId,
  CourseId,
  Gate,
  GateId,
  GateState,
  GateTarget,
  GateView,
  GradeReader,
  Logger,
  MasteryReader,
  StudentId,
  SuccessCriteria,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import { loadOrThrow } from "./db-helpers.js";

export interface GatesServiceDeps {
  db: PraxisDb;
  log: Logger;
  /** Phase 9: Injected by buildServices — same instance as MemoryServiceImpl. */
  masteryReader: MasteryReader;
  /** Phase 9: Injected by buildServices — same instance as AssignmentServiceImpl. */
  gradeReader: GradeReader;
}

/**
 * GatesServiceImpl — all gate-domain reads and writes extracted from
 * ArtifactsServiceImpl as part of the artifacts-service domain decomposition.
 *
 * Handles: gate CRUD, gate evaluation + persistence, gate unlock events,
 * and gate upsert (snapshot-restore).
 */
export class GatesServiceImpl {
  constructor(private readonly deps: GatesServiceDeps) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  async gates(courseId: CourseId): Promise<Gate[]> {
    const rows = this.deps.db
      .select()
      .from(gatesTable)
      .where(eq(gatesTable.courseId, courseId))
      .all();
    return rows.map(rowToGate);
  }

  // ── Phase 9: Gate methods ────────────────────────────────────────────────

  /**
   * Computed enriched view of all gates for a course.
   * Pure read — runs the evaluator against current state but does NOT persist.
   */
  async gateView(input: { studentId: StudentId; courseId: CourseId }): Promise<GateView[]> {
    const gatesList = await this.gates(input.courseId);
    if (gatesList.length === 0) return [];

    const evaluator = new GateEvaluatorImpl();
    const result = await evaluator.evaluate({
      studentId: input.studentId,
      gates: gatesList,
      masteryReader: this.deps.masteryReader,
      gradeReader: this.deps.gradeReader,
      now: Date.now() as Timestamp,
      log: this.deps.log,
    });

    // Identify the active gate: first locked gate whose prerequisites are all unlocked.
    // A gate is "active" when it's the one the student is currently working toward.
    let activeGateIdx = -1;
    for (const [i, e] of result.perGate.entries()) {
      const isLocked = e.afterState.kind === "locked";
      // Active = locked and NOT blocked by prerequisite gates (i.e., its prereqs are all unlocked).
      const blockedByPrereqs =
        isLocked &&
        (e.afterState as Extract<typeof e.afterState, { kind: "locked" }>).missingPrerequisites
          .length > 0;
      if (isLocked && !blockedByPrereqs) {
        activeGateIdx = i;
        break;
      }
    }

    return result.perGate.map((entry, i) => {
      const gate = gatesList[i];
      if (!gate) throw new Error(`Gate evaluation missing gate at index ${i}`);
      return {
        gate,
        summaryText: entry.summaryText,
        lockReason: entry.lockReason,
        progress: entry.progress,
        isActive: i === activeGateIdx,
      };
    });
  }

  /**
   * Run gate evaluation for the course, persist transitions atomically,
   * write gate_unlock_events for newly-unlocked gates.
   * Returns the unlocked gate IDs from this evaluation.
   * Idempotent: evaluating the same state twice produces no new transitions.
   */
  async evaluateAndPersistGates(input: {
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<{ unlockedGateIds: GateId[] }> {
    const gatesList = await this.gates(input.courseId);
    if (gatesList.length === 0) return { unlockedGateIds: [] };

    const evaluator = new GateEvaluatorImpl();
    const result = await evaluator.evaluate({
      studentId: input.studentId,
      gates: gatesList,
      masteryReader: this.deps.masteryReader,
      gradeReader: this.deps.gradeReader,
      now: Date.now() as Timestamp,
      log: this.deps.log,
    });

    if (result.transitions.length === 0) {
      // No-op: no state changes — avoid unnecessary writes.
      return { unlockedGateIds: [] };
    }

    // Atomic write: all state changes + unlock event rows in one transaction.
    return this.deps.db.transaction((tx) => {
      const unlockedGateIds: GateId[] = [];
      const unlockTransitions = new Map(
        result.transitions
          .filter((transition) => transition.kind === "unlocked")
          .map((transition) => [transition.gateId, transition]),
      );

      // Update gate state rows that changed.
      for (const entry of result.perGate) {
        if (entry.beforeState.kind === entry.afterState.kind) continue;

        const current = tx
          .select({ stateJson: gatesTable.stateJson })
          .from(gatesTable)
          .where(eq(gatesTable.id, entry.gateId))
          .get();
        const currentState = current?.stateJson as GateState | undefined;
        if (currentState?.kind !== entry.beforeState.kind) continue;

        const updateResult = tx
          .update(gatesTable)
          .set({ stateJson: entry.afterState })
          .where(eq(gatesTable.id, entry.gateId))
          .run();
        if (updateResult.changes === 0) continue;

        const transition = unlockTransitions.get(entry.gateId);
        if (!transition) continue;

        const existingEvent = tx
          .select({ id: gateUnlockEvents.id })
          .from(gateUnlockEvents)
          .where(
            and(
              eq(gateUnlockEvents.studentId, input.studentId),
              eq(gateUnlockEvents.courseId, input.courseId),
              eq(gateUnlockEvents.gateId, transition.gateId),
            ),
          )
          .get();
        if (existingEvent) continue;

        tx.insert(gateUnlockEvents)
          .values({
            id: uuidv7(),
            studentId: input.studentId,
            courseId: input.courseId,
            gateId: transition.gateId,
            unlockedAt: new Date(transition.at),
            evidenceJson: transition.evidence as Array<{
              kind: "event" | "assignment" | "manual";
              id: string;
            }>,
          })
          .run();
        unlockedGateIds.push(transition.gateId);
      }

      return { unlockedGateIds };
    });
  }

  /**
   * Mark all unviewed unlock events for a (student, course) pair as viewed.
   * Used by the courses-list UI to clear the "newly unlocked" badge.
   */
  async markGatesViewed(input: { studentId: StudentId; courseId: CourseId }): Promise<void> {
    this.deps.db
      .update(gateUnlockEvents)
      .set({ viewedAt: new Date() })
      .where(
        and(
          eq(gateUnlockEvents.studentId, input.studentId),
          eq(gateUnlockEvents.courseId, input.courseId),
          isNull(gateUnlockEvents.viewedAt),
        ),
      )
      .run();
  }

  /**
   * Count of unlock events for a course that the student hasn't viewed yet.
   * Returns 0 when all events have been viewed or none exist.
   */
  async newlyUnlockedCount(input: { studentId: StudentId; courseId: CourseId }): Promise<number> {
    const rows = this.deps.db
      .select()
      .from(gateUnlockEvents)
      .where(
        and(
          eq(gateUnlockEvents.studentId, input.studentId),
          eq(gateUnlockEvents.courseId, input.courseId),
          isNull(gateUnlockEvents.viewedAt),
        ),
      )
      .all();
    return rows.length;
  }

  // ── Phase 11: Configurator write methods ─────────────────────────────────

  /**
   * Create a gate with an initial `locked` state.
   */
  async createGate(input: {
    courseId: CourseId;
    guards: GateTarget;
    prerequisites: GateId[];
    successCriteria: SuccessCriteria;
  }): Promise<Gate> {
    const id = uuidv7();
    const initialState: GateState = {
      kind: "locked",
      missingPrerequisites: input.prerequisites,
    };
    this.deps.db
      .insert(gatesTable)
      .values({
        id,
        courseId: input.courseId,
        guardsJson: input.guards,
        prerequisitesJson: input.prerequisites,
        successCriteriaJson: input.successCriteria,
        stateJson: initialState,
        evidenceJson: [],
      })
      .run();
    return loadOrThrow(
      async () => {
        const row = this.deps.db.select().from(gatesTable).where(eq(gatesTable.id, id)).get();
        return row ? rowToGate(row) : null;
      },
      { entity: "gate", op: "create", id, log: this.deps.log },
    );
  }

  /**
   * Patch a gate's guards, prerequisites, or successCriteria.
   * Preserves existing state and evidence.
   */
  async updateGate(input: {
    gateId: GateId;
    patch: Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">>;
    reason?: string;
  }): Promise<Gate> {
    this.deps.db
      .update(gatesTable)
      .set({
        ...(input.patch.guards !== undefined && { guardsJson: input.patch.guards }),
        ...(input.patch.prerequisites !== undefined && {
          prerequisitesJson: input.patch.prerequisites,
        }),
        ...(input.patch.successCriteria !== undefined && {
          successCriteriaJson: input.patch.successCriteria,
        }),
      })
      .where(eq(gatesTable.id, input.gateId))
      .run();
    return loadOrThrow(
      async () => {
        const row = this.deps.db
          .select()
          .from(gatesTable)
          .where(eq(gatesTable.id, input.gateId))
          .get();
        return row ? rowToGate(row) : null;
      },
      { entity: "gate", op: "update", id: input.gateId, log: this.deps.log },
    );
  }

  /**
   * Delete a gate. gate_unlock_events rows cascade via FK.
   */
  async deleteGate(input: { gateId: GateId; reason?: string }): Promise<void> {
    this.deps.db.delete(gatesTable).where(eq(gatesTable.id, input.gateId)).run();
  }

  /**
   * Override a gate's state to `"overridden"`. Also writes a gate_unlock_events
   * row so the audit trail captures the override (same semantics as Phase 9's
   * `evaluateAndPersistGates`).
   *
   * Atomic: state update + event row in one transaction.
   */
  async overrideGate(input: {
    gateId: GateId;
    reason: string;
    configuratorId: ConfiguratorId;
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<Gate> {
    const now = Date.now() as Timestamp;
    const newState: GateState = {
      kind: "overridden",
      by: input.configuratorId,
      reason: input.reason,
      at: now,
    };

    this.deps.db.transaction((tx) => {
      tx.update(gatesTable)
        .set({ stateJson: newState })
        .where(eq(gatesTable.id, input.gateId))
        .run();

      // Audit row — matches Phase 9's gate_unlock_events schema.
      tx.insert(gateUnlockEvents)
        .values({
          id: uuidv7(),
          studentId: input.studentId,
          courseId: input.courseId,
          gateId: input.gateId,
          unlockedAt: new Date(now),
          evidenceJson: [{ kind: "manual", id: `override:${input.configuratorId}` }],
        })
        .run();
    });

    return loadOrThrow(
      async () => {
        const row = this.deps.db
          .select()
          .from(gatesTable)
          .where(eq(gatesTable.id, input.gateId))
          .get();
        return row ? rowToGate(row) : null;
      },
      { entity: "gate", op: "override", id: input.gateId, log: this.deps.log },
    );
  }

  // ── Snapshot-restore helpers ─────────────────────────────────────────────

  async getGate(gateId: GateId): Promise<Gate | null> {
    const row = this.deps.db.select().from(gatesTable).where(eq(gatesTable.id, gateId)).get();
    return row ? rowToGate(row) : null;
  }

  /**
   * Upsert a gate to an exact prior shape. Used by restoreAction.
   */
  async upsertGate(gate: Gate): Promise<void> {
    this.deps.db
      .insert(gatesTable)
      .values({
        id: gate.id,
        courseId: gate.courseId,
        guardsJson: gate.guards,
        prerequisitesJson: gate.prerequisites,
        successCriteriaJson: gate.successCriteria,
        stateJson: gate.state,
        evidenceJson: gate.evidence,
      })
      .onConflictDoUpdate({
        target: gatesTable.id,
        set: {
          courseId: gate.courseId,
          guardsJson: gate.guards,
          prerequisitesJson: gate.prerequisites,
          successCriteriaJson: gate.successCriteria,
          stateJson: gate.state,
          evidenceJson: gate.evidence,
        },
      })
      .run();
  }
}

// ── Row-to-domain helpers ──────────────────────────────────────────────────────

function rowToGate(row: typeof gatesTable.$inferSelect): Gate {
  const gateIdBrand = (id: string) => brandId<"GateId">(id);
  return {
    id: gateIdBrand(row.id),
    courseId: brandId<"CourseId">(row.courseId),
    guards: row.guardsJson as GateTarget,
    prerequisites: (row.prerequisitesJson as string[]).map(gateIdBrand) as GateId[],
    successCriteria: row.successCriteriaJson as SuccessCriteria,
    state: row.stateJson as GateState,
    evidence: row.evidenceJson as Array<{ kind: "event" | "assignment" | "manual"; id: string }>,
  };
}
