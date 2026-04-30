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
import type { ConceptId, SessionId, StrategyId, StudentId } from "../../types/ids.js";
import { brandId } from "../../types/index.js";
import type {
  AffectiveModel,
  ConceptMastery,
  EpisodicEvent,
  MasterySignal,
  MemoryExport,
  Misconception,
  ProceduralModel,
  StudentModel,
} from "../../types/memory.js";
// Import server-side MemoryService (with studentId params) directly from tool.ts.
import type { MemoryService } from "../../types/tool.js";
import type { MasteryReader } from "../../types/gate.js";
import { applySignalsToConcept } from "../indexers/mastery-indexer.js";
import { upsertMisconception } from "../indexers/misconception-indexer.js";
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

  // ── procedural (Phase 14 stub) ────────────────────────────────────────────────

  async procedural(studentId: StudentId): Promise<ProceduralModel> {
    return { studentId, strategies: new Map() };
  }

  // ── affective (Phase 14 stub) ─────────────────────────────────────────────────

  async affective(studentId: StudentId): Promise<AffectiveModel> {
    return {
      studentId,
      recent: [],
      baseline: { engagement: 0.5, frustration: 0.5, confidence: 0.5 },
    };
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
    return upsertMisconception(this.deps.db, opts.studentId, {
      conceptId: opts.conceptId,
      description: opts.description,
      errorForm: opts.errorForm,
      remediation: opts.remediation,
      evidenceEventIds: opts.evidenceEventIds,
    });
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
