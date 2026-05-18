import { writeFile } from "node:fs/promises";
import { basename, resolve as pathResolve } from "node:path";
import {
  affectiveSamples,
  episodicEvents,
  misconceptions,
  proceduralStrategies,
  studentMastery,
} from "@praxis/memory/schema";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import type { Logger, TimeRange, Timestamp } from "../../types/common.js";
import type { MasteryReader } from "../../types/gate.js";
import type {
  ConceptId,
  MisconceptionId,
  SessionId,
  StrategyId,
  StudentId,
} from "../../types/ids.js";
import { brandId } from "../../types/index.js";
import type {
  AffectiveModel,
  AffectSample,
  ConceptMastery,
  EpisodicEvent,
  MasterySignal,
  MemoryExport,
  Misconception,
  ProceduralModel,
  StrategyPreference,
  StudentModel,
} from "../../types/memory.js";
// Import server-side MemoryService (with studentId params) directly from tool.ts.
import type { MemoryService } from "../../types/tool.js";
import { applySignalsToConcept } from "../indexers/mastery-indexer.js";
import { upsertMisconception as indexerUpsertMisconception } from "../indexers/misconception-indexer.js";
import { bktInitial } from "./bkt.js";
import { applyDecay } from "./decay.js";

export interface MemoryServiceDeps {
  db: PraxisDb;
  log: Logger;
  /**
   * Resolves the decay constant for a concept at read time.
   * Phase 7: returns the active course's `decayDays` if available; falls back to 14.
   * Injected by buildServices so this service stays free of ArtifactsService dependency.
   */
  decayDaysFor: (conceptId: ConceptId) => number;
}

export class MemoryServiceImpl implements MemoryService, MasteryReader {
  constructor(private readonly deps: MemoryServiceDeps) {}

  // ── studentModel ─────────────────────────────────────────────────────────────

  async studentModel(studentId: StudentId): Promise<StudentModel> {
    const rows = this.deps.db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, studentId))
      .all();

    const now = Date.now();
    const conceptMastery = new Map<ConceptId, ConceptMastery>();
    let latestUpdated: number | null = null;

    for (const row of rows) {
      const conceptId = brandId<"ConceptId">(row.conceptId);
      const pKnown = row.pKnown / 1000;
      const uncertainty = row.uncertainty / 1000;
      const lastPracticedAt: Timestamp | undefined = row.lastPracticedAt
        ? (row.lastPracticedAt.getTime() as Timestamp)
        : undefined;

      const decayDays = this.deps.decayDaysFor(conceptId);
      const effectivePKnown = applyDecay({
        pKnown,
        lastPracticedAt: lastPracticedAt as number | undefined,
        now,
        decayDays,
      });

      const evidence = (row.evidenceJson as string[]).map((id) => brandId<"EventId">(id));

      const masteryEntry: ConceptMastery = {
        conceptId,
        pKnown,
        uncertainty,
        ...(lastPracticedAt !== undefined && { lastPracticedAt }),
        effectivePKnown,
        evidence,
      };
      conceptMastery.set(conceptId, masteryEntry);

      const updatedMs = row.updatedAt.getTime();
      if (latestUpdated === null || updatedMs > latestUpdated) {
        latestUpdated = updatedMs;
      }
    }

    return {
      studentId,
      conceptMastery,
      lastUpdated: (latestUpdated ?? now) as Timestamp,
    };
  }

  // ── misconceptions ────────────────────────────────────────────────────────────

  async misconceptions(studentId: StudentId): Promise<Misconception[]> {
    const rows = this.deps.db
      .select()
      .from(misconceptions)
      .where(eq(misconceptions.studentId, studentId))
      // active first, then by lastObservedAt desc
      .orderBy(asc(misconceptions.status), desc(misconceptions.lastObservedAt))
      .all();

    return rows.map((r) => ({
      id: brandId<"MisconceptionId">(r.id),
      studentId,
      conceptId: brandId<"ConceptId">(r.conceptId),
      description: r.description,
      errorForm: r.errorForm,
      remediation: r.remediationJson as { strategyId: StrategyId; rationale: string },
      evidence: (r.evidenceJson as string[]).map((id) => brandId<"EventId">(id)),
      status: r.status as "active" | "remediated" | "manually-cleared",
      firstObservedAt: r.firstObservedAt.getTime() as Timestamp,
      lastObservedAt: r.lastObservedAt.getTime() as Timestamp,
    }));
  }

  // ── procedural ────────────────────────────────────────────────────────────────

  async procedural(studentId: StudentId): Promise<ProceduralModel> {
    const rows = this.deps.db
      .select()
      .from(proceduralStrategies)
      .where(eq(proceduralStrategies.studentId, studentId))
      .all();

    const strategies = new Map<StrategyId, StrategyPreference>();
    for (const r of rows) {
      const id = brandId<"StrategyId">(r.strategyId);
      strategies.set(id, {
        strategyId: id,
        preference: r.preferenceMilli / 1000, // -1..1
        evidenceCount: r.evidenceCount,
      });
    }

    return { studentId, strategies };
  }

  // ── affective ─────────────────────────────────────────────────────────────────

  async affective(studentId: StudentId): Promise<AffectiveModel> {
    const RECENT_LIMIT = 20;
    const BASELINE_WINDOW = 50;

    const recentRows = this.deps.db
      .select()
      .from(affectiveSamples)
      .where(eq(affectiveSamples.studentId, studentId))
      .orderBy(desc(affectiveSamples.ts))
      .limit(RECENT_LIMIT)
      .all();

    // Baseline: pull the last BASELINE_WINDOW rows (a superset of recent),
    // then average the milli-fields and convert back to 0..1 floats.
    const baselineRows = this.deps.db
      .select()
      .from(affectiveSamples)
      .where(eq(affectiveSamples.studentId, studentId))
      .orderBy(desc(affectiveSamples.ts))
      .limit(BASELINE_WINDOW)
      .all();

    if (baselineRows.length === 0) {
      // Empty state: return the neutral default — same as the previous Phase 14
      // stub so existing callers see no behavior change.
      return {
        studentId,
        recent: [],
        baseline: { engagement: 0.5, frustration: 0.5, confidence: 0.5 },
      };
    }

    const sum = (key: "engagementMilli" | "frustrationMilli" | "confidenceMilli") =>
      baselineRows.reduce((acc, r) => acc + r[key], 0);

    const baseline = {
      engagement: sum("engagementMilli") / baselineRows.length / 1000,
      frustration: sum("frustrationMilli") / baselineRows.length / 1000,
      confidence: sum("confidenceMilli") / baselineRows.length / 1000,
    };

    const recent: AffectSample[] = recentRows.map((r) => ({
      ts: r.ts.getTime() as Timestamp,
      source: r.source,
      engagement: r.engagementMilli / 1000,
      frustration: r.frustrationMilli / 1000,
      confidence: r.confidenceMilli / 1000,
    }));

    return { studentId, recent, baseline };
  }

  // ── episodic ─────────────────────────────────────────────────────────────────

  async *episodic(opts: {
    studentId: StudentId;
    sessionId?: SessionId;
    range?: TimeRange;
  }): AsyncIterable<EpisodicEvent> {
    const { studentId, sessionId, range } = opts;

    // Build the where conditions
    const conditions = [
      eq(episodicEvents.studentId, studentId),
      // Skip redacted rows
      isNull(episodicEvents.redactedAt),
    ];

    if (sessionId !== undefined) {
      conditions.push(eq(episodicEvents.sessionId, sessionId));
    }
    if (range !== undefined) {
      conditions.push(gte(episodicEvents.ts, new Date(range.fromMs)));
      conditions.push(lte(episodicEvents.ts, new Date(range.toMs)));
    }

    const BATCH_SIZE = 1000;
    let offset = 0;

    while (true) {
      const batch = this.deps.db
        .select()
        .from(episodicEvents)
        .where(and(...conditions))
        .orderBy(asc(episodicEvents.turnIndex), asc(episodicEvents.ts))
        .limit(BATCH_SIZE)
        .offset(offset)
        .all();

      for (const row of batch) {
        yield {
          id: brandId<"EventId">(row.id),
          sessionId: brandId<"SessionId">(row.sessionId),
          studentId,
          ts: row.ts.getTime() as Timestamp,
          source: {
            engineId: row.engineId,
            modeId: row.modeId,
            turnIndex: row.turnIndex,
          },
          event: row.eventJson as EpisodicEvent["event"],
          ...(row.artifactSnapshotIdsJson !== null && {
            // biome-ignore lint/suspicious/noExplicitAny: JSON column; shape is string[]
            artifactSnapshotIds: (row.artifactSnapshotIdsJson as any[]).map((id) =>
              brandId<"ArtifactSnapshotId">(String(id)),
            ),
          }),
        };
      }

      if (batch.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }
  }

  // ── export ─────────────────────────────────────────────────────────────────────

  async export(studentId: StudentId): Promise<MemoryExport> {
    const [model, misconceptionList, proceduralModel, affectiveModel] = await Promise.all([
      this.studentModel(studentId),
      this.misconceptions(studentId),
      this.procedural(studentId),
      this.affective(studentId),
    ]);

    const episodicList: EpisodicEvent[] = [];
    for await (const ev of this.episodic({ studentId })) {
      episodicList.push(ev);
    }

    return {
      studentId,
      episodic: episodicList,
      studentModel: model,
      procedural: proceduralModel,
      affective: affectiveModel,
      misconceptions: misconceptionList,
      exportedAt: Date.now() as Timestamp,
      formatVersion: "1.0",
    };
  }

  // ── applySignal ───────────────────────────────────────────────────────────────

  applySignal(opts: {
    studentId: StudentId;
    conceptId: ConceptId;
    signals: MasterySignal[];
  }): void {
    applySignalsToConcept(this.deps, opts.studentId, opts.conceptId, opts.signals);
  }

  // ── recordMisconception ────────────────────────────────────────────────────────

  recordMisconception(opts: {
    studentId: StudentId;
    conceptId: ConceptId;
    description: string;
    errorForm: string;
    remediation: { strategyId: string; rationale: string };
    evidenceEventIds: string[];
  }): { misconceptionId: string; merged: boolean } {
    return indexerUpsertMisconception(this.deps.db, opts.studentId, {
      conceptId: opts.conceptId,
      description: opts.description,
      errorForm: opts.errorForm,
      remediation: opts.remediation,
      evidenceEventIds: opts.evidenceEventIds,
    });
  }

  // ── Phase 11: Configurator write methods ─────────────────────────────────────

  /**
   * Reset a concept to initial BKT state ("as if never observed").
   * Upserts the student_mastery row with prior probabilities from bktInitial(),
   * clears evidenceJson and lastPracticedAt.
   */
  async resetConcept(input: {
    studentId: StudentId;
    conceptId: ConceptId;
    reason: string;
  }): Promise<void> {
    const initialState = bktInitial();
    const now = new Date();
    this.deps.db
      .insert(studentMastery)
      .values({
        studentId: input.studentId,
        conceptId: input.conceptId,
        pKnown: Math.round(initialState.pKnown * 1000),
        uncertainty: Math.round(initialState.uncertainty * 1000),
        effectivePKnown: Math.round(initialState.pKnown * 1000),
        lastPracticedAt: null,
        evidenceJson: [],
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [studentMastery.studentId, studentMastery.conceptId],
        set: {
          pKnown: Math.round(initialState.pKnown * 1000),
          uncertainty: Math.round(initialState.uncertainty * 1000),
          effectivePKnown: Math.round(initialState.pKnown * 1000),
          lastPracticedAt: null,
          evidenceJson: [],
          updatedAt: now,
        },
      })
      .run();
    this.deps.log.info("memory.concept_reset", {
      conceptId: input.conceptId,
      reason: input.reason,
    });
  }

  /**
   * Flip a misconception's status to "manually-cleared".
   * Updates lastObservedAt to now (documents when it was cleared).
   */
  async clearMisconception(input: {
    misconceptionId: MisconceptionId;
    reason: string;
  }): Promise<void> {
    const now = new Date();
    this.deps.db
      .update(misconceptions)
      .set({ status: "manually-cleared", lastObservedAt: now })
      .where(eq(misconceptions.id, input.misconceptionId))
      .run();
    this.deps.log.info("memory.misconception_cleared", {
      misconceptionId: input.misconceptionId,
      reason: input.reason,
    });
  }

  /**
   * Export memory to a file at `targetPath`.
   * Wraps the existing `export()` method; converts Maps → entry arrays for JSON
   * serialization (consistent with Phase 7's IPC export pattern).
   * Returns `{ ok: true, bytesWritten }`.
   */
  async exportToFile(input: {
    studentId: StudentId;
    targetPath: string;
  }): Promise<{ ok: true; bytesWritten: number }> {
    const exportData = await this.export(input.studentId);
    const serializable = {
      ...exportData,
      studentModel: {
        ...exportData.studentModel,
        // Map is not JSON-serializable; convert to [key, value] entries array.
        conceptMastery: Array.from(exportData.studentModel.conceptMastery.entries()),
      },
      // ProceduralModel.strategies is also a Map.
      procedural: {
        ...exportData.procedural,
        strategies: Array.from(exportData.procedural.strategies.entries()),
      },
    };
    const json = JSON.stringify(serializable, null, 2);
    const bytes = Buffer.byteLength(json, "utf-8");

    // Path validation: canonicalise and refuse dangerous patterns before
    // writing. This runs in @praxis/core (no Electron dependency), so we
    // cannot call app.getPath(). We apply two portable checks instead:
    //   1. Refuse paths whose raw segments include `..` — catches traversal
    //      attempts before resolution (e.g. "/downloads/../../../etc/passwd").
    //      Checked on the raw input so the intent is unambiguous even after
    //      pathResolve would otherwise silently absorb the traversal.
    //   2. Refuse paths whose basename starts with `.` — prevents dropping
    //      hidden files (.envrc, .bashrc, etc.) that could affect shell or
    //      tool behaviour.
    // These are defence-in-depth controls; the renderer is already isolated
    // via contextIsolation. The IPC handler in ipc-server.ts is the primary
    // enforcement point; this layer prevents abuse if the handler is relaxed.
    const rawSegments = input.targetPath.split(/[/\\]/);
    if (rawSegments.includes("..")) {
      throw new Error(
        `exportMemory: targetPath must not contain '..' segments: ${input.targetPath}`,
      );
    }
    const resolvedPath = pathResolve(input.targetPath);
    if (basename(resolvedPath).startsWith(".")) {
      throw new Error(
        `exportMemory: targetPath basename must not start with '.': ${basename(resolvedPath)}`,
      );
    }

    await writeFile(resolvedPath, json, "utf-8");
    return { ok: true, bytesWritten: bytes };
  }

  // ── Snapshot-restore helpers ─────────────────────────────────────────────────

  async getMastery(input: {
    studentId: StudentId;
    conceptId: ConceptId;
  }): Promise<import("../../types/memory.js").ConceptMastery | null> {
    const row = this.deps.db
      .select()
      .from(studentMastery)
      .where(
        and(
          eq(studentMastery.studentId, input.studentId),
          eq(studentMastery.conceptId, input.conceptId),
        ),
      )
      .get();
    if (!row) return null;

    const pKnown = row.pKnown / 1000;
    const uncertainty = row.uncertainty / 1000;
    const effectivePKnown = row.effectivePKnown / 1000;
    const lastPracticedAt: import("../../types/common.js").Timestamp | undefined =
      row.lastPracticedAt
        ? (row.lastPracticedAt.getTime() as import("../../types/common.js").Timestamp)
        : undefined;
    const conceptId = brandId<"ConceptId">(row.conceptId);
    const evidence = (row.evidenceJson as string[]).map((id) => brandId<"EventId">(id));

    return {
      conceptId,
      pKnown,
      uncertainty,
      effectivePKnown,
      ...(lastPracticedAt !== undefined && { lastPracticedAt }),
      evidence,
    };
  }

  async upsertMastery(input: {
    studentId: StudentId;
    conceptId: ConceptId;
    mastery: import("../../types/memory.js").ConceptMastery | null;
  }): Promise<void> {
    if (input.mastery === null) {
      // Restore "never seen" state by deleting the row.
      this.deps.db
        .delete(studentMastery)
        .where(
          and(
            eq(studentMastery.studentId, input.studentId),
            eq(studentMastery.conceptId, input.conceptId),
          ),
        )
        .run();
      return;
    }
    const m = input.mastery;
    const now = new Date();
    this.deps.db
      .insert(studentMastery)
      .values({
        studentId: input.studentId,
        conceptId: input.conceptId,
        pKnown: Math.round(m.pKnown * 1000),
        uncertainty: Math.round(m.uncertainty * 1000),
        effectivePKnown: Math.round(m.effectivePKnown * 1000),
        lastPracticedAt: m.lastPracticedAt ? new Date(m.lastPracticedAt) : null,
        evidenceJson: m.evidence,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [studentMastery.studentId, studentMastery.conceptId],
        set: {
          pKnown: Math.round(m.pKnown * 1000),
          uncertainty: Math.round(m.uncertainty * 1000),
          effectivePKnown: Math.round(m.effectivePKnown * 1000),
          lastPracticedAt: m.lastPracticedAt ? new Date(m.lastPracticedAt) : null,
          evidenceJson: m.evidence,
          updatedAt: now,
        },
      })
      .run();
  }

  async getMisconception(
    misconceptionId: MisconceptionId,
  ): Promise<import("../../types/memory.js").Misconception | null> {
    const r = this.deps.db
      .select()
      .from(misconceptions)
      .where(eq(misconceptions.id, misconceptionId))
      .get();
    if (!r) return null;
    return {
      id: brandId<"MisconceptionId">(r.id),
      studentId: brandId<"StudentId">(r.studentId),
      conceptId: brandId<"ConceptId">(r.conceptId),
      description: r.description,
      errorForm: r.errorForm,
      remediation: r.remediationJson as { strategyId: StrategyId; rationale: string },
      evidence: (r.evidenceJson as string[]).map((id) => brandId<"EventId">(id)),
      status: r.status as "active" | "remediated" | "manually-cleared",
      firstObservedAt: r.firstObservedAt.getTime() as import("../../types/common.js").Timestamp,
      lastObservedAt: r.lastObservedAt.getTime() as import("../../types/common.js").Timestamp,
    };
  }

  async upsertMisconception(m: import("../../types/memory.js").Misconception): Promise<void> {
    this.deps.db
      .insert(misconceptions)
      .values({
        id: m.id,
        studentId: m.studentId,
        conceptId: m.conceptId,
        description: m.description,
        errorForm: m.errorForm,
        remediationJson: m.remediation,
        evidenceJson: m.evidence,
        status: m.status,
        firstObservedAt: new Date(m.firstObservedAt),
        lastObservedAt: new Date(m.lastObservedAt),
      })
      .onConflictDoUpdate({
        target: misconceptions.id,
        set: {
          studentId: m.studentId,
          conceptId: m.conceptId,
          description: m.description,
          errorForm: m.errorForm,
          remediationJson: m.remediation,
          evidenceJson: m.evidence,
          status: m.status,
          firstObservedAt: new Date(m.firstObservedAt),
          lastObservedAt: new Date(m.lastObservedAt),
        },
      })
      .run();
  }

  // ── MasteryReader.read (Phase 9) ──────────────────────────────────────────────

  /**
   * MasteryReader port implementation. Returns decay-aware effectivePKnown for a
   * concept, or 0 when no record exists. Fail-safe: never throws for unknown concepts.
   */
  async read(input: { studentId: StudentId; conceptId: ConceptId }): Promise<number> {
    const row = this.deps.db
      .select()
      .from(studentMastery)
      .where(
        and(
          eq(studentMastery.studentId, input.studentId),
          eq(studentMastery.conceptId, input.conceptId),
        ),
      )
      .get();
    if (!row) return 0;
    const pKnown = row.pKnown / 1000;
    const lastPracticedAt = row.lastPracticedAt?.getTime();
    const decayDays = this.deps.decayDaysFor(input.conceptId);
    return applyDecay({ pKnown, lastPracticedAt, now: Date.now(), decayDays });
  }

  // ── delete ─────────────────────────────────────────────────────────────────────

  async delete(opts: { studentId: StudentId; confirm: true }): Promise<void> {
    const { studentId } = opts;
    const now = new Date();

    this.deps.db.transaction((tx) => {
      // Wipe projection tables for this student.
      tx.delete(studentMastery).where(eq(studentMastery.studentId, studentId)).run();
      tx.delete(misconceptions).where(eq(misconceptions.studentId, studentId)).run();
      tx.delete(proceduralStrategies).where(eq(proceduralStrategies.studentId, studentId)).run();
      tx.delete(affectiveSamples).where(eq(affectiveSamples.studentId, studentId)).run();

      // Soft-delete episodic: mark as redacted but do NOT delete the rows.
      tx.update(episodicEvents)
        .set({ redactedAt: now })
        .where(and(eq(episodicEvents.studentId, studentId), isNull(episodicEvents.redactedAt)))
        .run();
    });
  }
}
