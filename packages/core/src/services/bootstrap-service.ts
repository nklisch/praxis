import { courses, documentChunks, gates, lessons } from "@praxis/artifacts/schema";
import { runConceptExtractor } from "@praxis/curriculum/bootstrap";
import { conceptGraphs, concepts, prerequisiteEdges } from "@praxis/curriculum/schema";
import { inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  BootstrapService,
  CourseId,
  DocumentId,
  DraftCourseState,
  DraftEditOp,
  DraftSummary,
  Engine,
  LessonId,
  Logger,
  ProposeDraftInput,
  ProposedCourse,
  StudentId,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";

const DRAFT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface BootstrapServiceDeps {
  db: PraxisDb;
  log: Logger;
  /** Resolves to the user's currently selected engine. Same pattern as visionResolver. */
  engineResolver: () => Engine;
  /** Sweep period for expired drafts. Defaults to 60 seconds. */
  sweepIntervalMs?: number;
}

/**
 * BootstrapServiceImpl — owns the in-memory draft cache and the
 * `confirmDraft` transactional persist.
 *
 * Drafts live 2 hours after last access and are dropped on process exit.
 * Recovery is "re-run propose_draft against the same documents."
 *
 * This class is mode-agnostic — it does not know whether the caller is in
 * bootstrap mode or configure mode. Methods accept inputs, return outputs.
 */
export class BootstrapServiceImpl implements BootstrapService {
  private readonly drafts = new Map<string, DraftCourseState>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: BootstrapServiceDeps) {
    const period = deps.sweepIntervalMs ?? 60_000;
    this.sweepTimer = setInterval(() => {
      this.sweepExpired();
    }, period);
    // unref so this timer doesn't keep the process alive.
    this.sweepTimer.unref?.();
  }

  async proposeDraft(
    input: ProposeDraftInput,
  ): Promise<{ draft: DraftCourseState; summary: DraftSummary }> {
    // 1. Read the document chunks for the requested documents.
    const chunks = this.readChunksFor(input.documentIds);
    if (chunks.length === 0) {
      throw new Error(
        `No chunks found for the given documentIds. Did the documents finish ingesting? documentIds: ${input.documentIds.join(", ")}`,
      );
    }

    // 2. Run the extractor — fresh one-shot session, isolated from the live tutoring session.
    const engine = this.deps.engineResolver();
    const proposed: ProposedCourse = await runConceptExtractor({
      engine,
      chunks,
      courseTitle: input.courseTitle,
      subject: input.subject,
      gradeLevel: input.gradeLevel,
      log: this.deps.log,
    });

    // 3. Validate post-conditions; throw with a helpful message on bad LLM output.
    validateProposed(proposed);

    // 4. Cache the draft.
    const now = Date.now() as Timestamp;
    const draft: DraftCourseState = {
      draftId: uuidv7(),
      studentId: input.studentId,
      documentIds: input.documentIds,
      proposed,
      createdAt: now,
      lastTouchedAt: now,
      expiresAt: (now + DRAFT_TTL_MS) as Timestamp,
    };
    this.drafts.set(draft.draftId, draft);
    return { draft, summary: buildSummary(draft) };
  }

  async showDraft(draftId: string): Promise<DraftCourseState | null> {
    const d = this.drafts.get(draftId);
    if (!d) return null;
    if (d.expiresAt <= Date.now()) {
      this.drafts.delete(draftId);
      return null;
    }
    d.lastTouchedAt = Date.now() as Timestamp;
    d.expiresAt = (d.lastTouchedAt + DRAFT_TTL_MS) as Timestamp;
    return d;
  }

  async editDraft(input: { draftId: string; op: DraftEditOp }): Promise<DraftCourseState> {
    const d = await this.showDraft(input.draftId);
    if (!d) throw new Error(`Draft not found or expired: ${input.draftId}`);
    d.proposed = applyEdit(d.proposed, input.op);
    d.lastTouchedAt = Date.now() as Timestamp;
    return d;
  }

  async confirmDraft(input: {
    draftId: string;
    studentId: StudentId;
  }): Promise<{ courseId: CourseId; lessonIds: LessonId[]; conceptGraphId: string }> {
    const d = await this.showDraft(input.draftId);
    if (!d) throw new Error(`Draft not found or expired: ${input.draftId}`);
    if (d.studentId !== input.studentId) {
      throw new Error(`Draft owner mismatch: draft belongs to a different student`);
    }

    const result = persistDraft({ db: this.deps.db, draft: d, now: new Date() });
    this.drafts.delete(input.draftId);
    return result;
  }

  async discardDraft(draftId: string): Promise<void> {
    this.drafts.delete(draftId);
  }

  /** Test/observability handle: count active (non-expired) drafts. */
  size(): number {
    return this.drafts.size;
  }

  /** Cleanup helper for host shutdown. */
  shutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.drafts.clear();
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [id, d] of this.drafts) {
      if (d.expiresAt <= now) {
        this.drafts.delete(id);
      }
    }
  }

  private readChunksFor(documentIds: DocumentId[]): ReadonlyArray<{
    documentId: string;
    chunkIndex: number;
    text: string;
    locator: { page?: number; section?: string };
  }> {
    if (documentIds.length === 0) return [];
    const rows = this.deps.db
      .select()
      .from(documentChunks)
      .where(inArray(documentChunks.documentId, documentIds))
      .all();
    return rows.map((r) => ({
      documentId: r.documentId,
      chunkIndex: r.chunkIndex,
      text: r.text,
      locator: r.locatorJson as { page?: number; section?: string },
    }));
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function buildSummary(d: DraftCourseState): DraftSummary {
  const p = d.proposed;
  return {
    draftId: d.draftId,
    title: p.title,
    lessonCount: p.proposedLessons.length,
    conceptCount: p.proposedConcepts.length,
    edgeCount: p.proposedEdges.length,
    firstLessons: p.proposedLessons.slice(0, 5).map((l) => ({
      title: l.title,
      conceptCount: l.conceptNames.length,
    })),
  };
}

function validateProposed(p: ProposedCourse): void {
  if (!p.title?.trim()) throw new Error("Extractor produced empty course title");
  if (p.proposedLessons.length === 0) throw new Error("Extractor produced 0 lessons");
  if (p.proposedConcepts.length === 0) throw new Error("Extractor produced 0 concepts");
  const known = new Set(p.proposedConcepts.map((c) => c.name));
  for (const lesson of p.proposedLessons) {
    for (const cn of lesson.conceptNames) {
      if (!known.has(cn)) {
        throw new Error(
          `Lesson "${lesson.title}" references unknown concept "${cn}" — extractor output inconsistent`,
        );
      }
    }
  }
  for (const e of p.proposedEdges) {
    if (!known.has(e.fromName) || !known.has(e.toName)) {
      throw new Error(
        `Edge ${e.fromName}→${e.toName} references unknown concept — extractor output inconsistent`,
      );
    }
  }
}

/**
 * Apply a single edit operation to a ProposedCourse (pure function).
 * Exhaustive switch — TypeScript will error if a new DraftEditOp variant is
 * added without adding a branch here.
 */
function applyEdit(p: ProposedCourse, op: DraftEditOp): ProposedCourse {
  switch (op.kind) {
    case "rename-course":
      return { ...p, title: op.title };

    case "rename-lesson": {
      const ls = [...p.proposedLessons];
      const target = ls[op.lessonIndex];
      if (!target) throw new Error(`Lesson index out of bounds: ${op.lessonIndex}`);
      ls[op.lessonIndex] = { ...target, title: op.title };
      return { ...p, proposedLessons: ls };
    }

    case "reorder-lessons": {
      if (op.newOrder.length !== p.proposedLessons.length) {
        throw new Error(
          `reorder-lessons: newOrder length ${op.newOrder.length} !== lesson count ${p.proposedLessons.length}`,
        );
      }
      return {
        ...p,
        proposedLessons: op.newOrder.map((i) => {
          const l = p.proposedLessons[i];
          if (!l) throw new Error(`reorder-lessons: index ${i} out of bounds`);
          return l;
        }),
      };
    }

    case "remove-lesson": {
      const ls = p.proposedLessons.filter((_, i) => i !== op.lessonIndex);
      return { ...p, proposedLessons: ls };
    }

    case "add-lesson": {
      const newLesson = {
        draftLessonId: `lesson-${Date.now()}`,
        title: op.title,
        conceptNames: op.conceptNames,
        references: [],
        suggestedStrategy: brandId<"StrategyId">("worked-examples"),
        estimatedMinutes: 45,
      };
      const ls = [...p.proposedLessons];
      ls.splice(op.afterIndex + 1, 0, newLesson);
      return { ...p, proposedLessons: ls };
    }

    case "rename-concept": {
      // Update the concept list and all lesson conceptNames references.
      const cs = p.proposedConcepts.map((c) =>
        c.name === op.conceptName ? { ...c, name: op.newName } : c,
      );
      const ls = p.proposedLessons.map((l) => ({
        ...l,
        conceptNames: l.conceptNames.map((n) => (n === op.conceptName ? op.newName : n)),
      }));
      const es = p.proposedEdges.map((e) => ({
        ...e,
        fromName: e.fromName === op.conceptName ? op.newName : e.fromName,
        toName: e.toName === op.conceptName ? op.newName : e.toName,
      }));
      return { ...p, proposedConcepts: cs, proposedLessons: ls, proposedEdges: es };
    }

    case "remove-concept": {
      const cs = p.proposedConcepts.filter((c) => c.name !== op.conceptName);
      const ls = p.proposedLessons.map((l) => ({
        ...l,
        conceptNames: l.conceptNames.filter((n) => n !== op.conceptName),
      }));
      const es = p.proposedEdges.filter(
        (e) => e.fromName !== op.conceptName && e.toName !== op.conceptName,
      );
      return { ...p, proposedConcepts: cs, proposedLessons: ls, proposedEdges: es };
    }

    case "add-concept": {
      const known = new Set(p.proposedConcepts.map((c) => c.name));
      if (known.has(op.name)) {
        // Design says: silently merge (no error) for duplicate name — just skip adding.
        return p;
      }
      const newConcept = { name: op.name, description: op.description, evidence: [] };
      const cs = [...p.proposedConcepts, newConcept];
      const ls = [...p.proposedLessons];
      const lessonTarget = ls[op.lessonIndex];
      if (!lessonTarget)
        throw new Error(`add-concept: lessonIndex ${op.lessonIndex} out of bounds`);
      const names = [...lessonTarget.conceptNames];
      const insertAt = op.afterConceptIndex !== undefined ? op.afterConceptIndex + 1 : names.length;
      names.splice(insertAt, 0, op.name);
      ls[op.lessonIndex] = { ...lessonTarget, conceptNames: names };
      return { ...p, proposedConcepts: cs, proposedLessons: ls };
    }

    case "set-thresholds":
      return { ...p, thresholds: op.thresholds };

    default: {
      // Exhaustiveness check: TypeScript will error here if a new op.kind is added
      // without a case above.
      const _exhaustive: never = op;
      throw new Error(`Unknown DraftEditOp kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

interface PersistDraftArgs {
  db: PraxisDb;
  draft: DraftCourseState;
  now: Date;
}

/**
 * Write the confirmed draft to DB in a single synchronous Drizzle transaction.
 * Better-sqlite3 transactions are synchronous; the surrounding async wrapper
 * just satisfies the Promise shape the rest of the codebase expects.
 */
function persistDraft(args: PersistDraftArgs): {
  courseId: CourseId;
  lessonIds: LessonId[];
  conceptGraphId: string;
} {
  const { db, draft, now } = args;

  return db.transaction((tx) => {
    // 1. ConceptGraph row.
    const conceptGraphId = uuidv7();
    tx.insert(conceptGraphs)
      .values({
        id: conceptGraphId,
        source: "extracted",
        name: `${draft.proposed.title} graph`,
        version: "1",
        createdAt: now,
      })
      .run();

    // 2. Concept rows — assign stable UUIDs keyed by name.
    const conceptIdByName = new Map<string, string>();
    const conceptRowValues = draft.proposed.proposedConcepts.map((c) => {
      const id = uuidv7();
      conceptIdByName.set(c.name, id);
      return {
        id,
        graphId: conceptGraphId,
        name: c.name,
        description: c.description,
        aliasesJson: [] as string[],
        standardsTagsJson: [] as string[],
      };
    });
    if (conceptRowValues.length > 0) {
      tx.insert(concepts).values(conceptRowValues).run();
    }

    // 3. Prerequisite edge rows.
    const edgeRowValues = draft.proposed.proposedEdges.map((e) => ({
      // biome-ignore lint/style/noNonNullAssertion: edge names validated against conceptIdByName in validateProposed
      fromId: conceptIdByName.get(e.fromName)!,
      // biome-ignore lint/style/noNonNullAssertion: edge names validated against conceptIdByName in validateProposed
      toId: conceptIdByName.get(e.toName)!,
      strengthMilli: Math.round(Math.max(0, Math.min(1, e.strength)) * 1000),
      source: "extracted" as const,
    }));
    if (edgeRowValues.length > 0) {
      tx.insert(prerequisiteEdges).values(edgeRowValues).run();
    }

    // 4. Course row.
    const courseId = uuidv7();
    tx.insert(courses)
      .values({
        id: courseId,
        studentId: draft.studentId,
        title: draft.proposed.title,
        subject: draft.proposed.subject,
        gradeLevel: draft.proposed.gradeLevel,
        sourceJson: { kind: "bootstrapped", sourceMaterials: draft.documentIds },
        conceptGraphId,
        thresholdsJson: draft.proposed.thresholds,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // 5. Lesson rows — preserve declared order.
    const lessonRowValues = draft.proposed.proposedLessons.map((l, i) => ({
      id: uuidv7(),
      courseId,
      title: l.title,
      orderIndex: i,
      // biome-ignore lint/style/noNonNullAssertion: concept names validated against conceptIdByName in validateProposed
      conceptIdsJson: l.conceptNames.map((n) => conceptIdByName.get(n)!),
      referencesJson: l.references,
      suggestedStrategy: l.suggestedStrategy,
      estimatedMinutes: l.estimatedMinutes,
    }));
    if (lessonRowValues.length > 0) {
      tx.insert(lessons).values(lessonRowValues).run();
    }

    // 6. Skeleton gates — one per lesson, chained, all initially locked.
    //    Phase 9 overwrites with proper gate evaluation. Phase 6 just persists
    //    rows so future code can find them.
    const gateIds = lessonRowValues.map(() => uuidv7());
    const gateRowValues = lessonRowValues.map((l, i) => ({
      // biome-ignore lint/style/noNonNullAssertion: gateIds is same-length as lessonRowValues; i is a valid index
      id: gateIds[i]!,
      courseId,
      guardsJson: { kind: "lesson", lessonId: l.id },
      // biome-ignore lint/style/noNonNullAssertion: gateIds[i-1] exists for i > 0
      prerequisitesJson: i > 0 ? [gateIds[i - 1]!] : [],
      successCriteriaJson: {
        kind: "mastery-threshold",
        conceptIds: l.conceptIdsJson,
        minScore: draft.proposed.thresholds.conceptMastery,
      },
      stateJson: {
        kind: "locked",
        // biome-ignore lint/style/noNonNullAssertion: gateIds[i-1] exists for i > 0
        missingPrerequisites: i > 0 ? [gateIds[i - 1]!] : [],
      },
      evidenceJson: [],
    }));
    if (gateRowValues.length > 0) {
      tx.insert(gates).values(gateRowValues).run();
    }

    return {
      courseId: brandId<"CourseId">(courseId),
      lessonIds: lessonRowValues.map((r) => brandId<"LessonId">(r.id)),
      conceptGraphId,
    };
  });
}
