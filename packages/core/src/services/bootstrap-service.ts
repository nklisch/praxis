import { courses, gates, lessons } from "@praxis/artifacts/schema";
import { conceptGraphs, concepts, prerequisiteEdges } from "@praxis/curriculum/schema";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  BootstrapService,
  ConceptGraphId,
  CourseDocumentsService,
  CourseId,
  DocumentId,
  DraftCourseState,
  DraftEditOp,
  DraftSummary,
  Engine,
  LessonId,
  Logger,
  ProposedCourse,
  Reference,
  StrategyId,
  StudentId,
  ThresholdConfig,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface Issue {
  kind: string;
  message: string;
}

const DRAFT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface BootstrapServiceDeps {
  db: PraxisDb;
  log: Logger;
  /** Resolves to the user's currently selected engine. Same pattern as visionResolver. */
  engineResolver: () => Engine;
  /** Phase 16: course ↔ document attachment — used by confirmDraft to attach source docs. */
  courseDocuments: CourseDocumentsService;
  /** Sweep period for expired drafts. Defaults to 60 seconds. */
  sweepIntervalMs?: number;
}

/**
 * BootstrapServiceImpl — owns the in-memory draft cache and the
 * `confirmDraft` transactional persist.
 *
 * Drafts live 2 hours after last access and are dropped on process exit.
 * Recovery is "re-run start_exploration against the same documents."
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

  /**
   * Phase 16: create a new draft up-front (before the explorer has any concepts
   * to add). Used by the explorer's draft_init tool.
   */
  async initDraft(input: {
    studentId: StudentId;
    documentIds: DocumentId[];
    courseTitle: string;
    subject: string;
    gradeLevel: string;
  }): Promise<{ draftId: string }> {
    const now = Date.now() as Timestamp;
    const draft: DraftCourseState = {
      draftId: uuidv7(),
      studentId: input.studentId,
      documentIds: input.documentIds,
      proposed: {
        title: input.courseTitle,
        subject: input.subject,
        gradeLevel: input.gradeLevel,
        thresholds: {
          conceptMastery: 0.7,
          examPass: 0.7,
          allowRetake: true,
          decayDays: 14,
        },
        proposedConcepts: [],
        proposedEdges: [],
        proposedLessons: [],
      },
      createdAt: now,
      lastTouchedAt: now,
      expiresAt: (now + DRAFT_TTL_MS) as Timestamp,
    };
    this.drafts.set(draft.draftId, draft);
    return { draftId: draft.draftId };
  }

  /**
   * Phase 16: incremental concept addition. Validates uniqueness (case-insensitive)
   * and rejects duplicates. Returns ok:false as data so the model can react.
   */
  async addConcept(input: {
    draftId: string;
    name: string;
    description: string;
  }): Promise<{ ok: true; conceptCount: number } | { ok: false; reason: string }> {
    const d = await this.showDraft(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const lower = input.name.trim().toLowerCase();
    if (d.proposed.proposedConcepts.some((c) => c.name.trim().toLowerCase() === lower)) {
      return { ok: false, reason: `concept "${input.name}" already exists` };
    }
    d.proposed.proposedConcepts.push({
      name: input.name.trim(),
      description: input.description.trim(),
      evidence: [],
    });
    d.lastTouchedAt = Date.now() as Timestamp;
    return { ok: true, conceptCount: d.proposed.proposedConcepts.length };
  }

  /** Phase 16: remove a concept (and all edges + lesson references to it). */
  async removeConcept(input: {
    draftId: string;
    name: string;
  }): Promise<{ ok: boolean; reason?: string }> {
    const d = await this.showDraft(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const lower = input.name.trim().toLowerCase();
    const before = d.proposed.proposedConcepts.length;
    d.proposed.proposedConcepts = d.proposed.proposedConcepts.filter(
      (c) => c.name.trim().toLowerCase() !== lower,
    );
    if (d.proposed.proposedConcepts.length === before) {
      return { ok: false, reason: `concept "${input.name}" not found` };
    }
    // Remove edges referencing this concept.
    d.proposed.proposedEdges = d.proposed.proposedEdges.filter(
      (e) => e.fromName.trim().toLowerCase() !== lower && e.toName.trim().toLowerCase() !== lower,
    );
    // Remove concept from lessons.
    d.proposed.proposedLessons = d.proposed.proposedLessons.map((l) => ({
      ...l,
      conceptNames: l.conceptNames.filter((n) => n.trim().toLowerCase() !== lower),
    }));
    d.lastTouchedAt = Date.now() as Timestamp;
    return { ok: true };
  }

  /** Phase 16: add a prerequisite edge between two existing concepts. */
  async addEdge(input: {
    draftId: string;
    fromName: string;
    toName: string;
    strength: number;
    rationale: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    const d = await this.showDraft(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const known = new Set(d.proposed.proposedConcepts.map((c) => c.name.trim().toLowerCase()));
    const fromLower = input.fromName.trim().toLowerCase();
    const toLower = input.toName.trim().toLowerCase();
    if (!known.has(fromLower)) return { ok: false, reason: `concept "${input.fromName}" not found` };
    if (!known.has(toLower)) return { ok: false, reason: `concept "${input.toName}" not found` };
    if (fromLower === toLower) return { ok: false, reason: "self-edges are not allowed" };
    // Check duplicate edge.
    const exists = d.proposed.proposedEdges.some(
      (e) =>
        e.fromName.trim().toLowerCase() === fromLower && e.toName.trim().toLowerCase() === toLower,
    );
    if (exists) return { ok: false, reason: "edge already exists" };
    d.proposed.proposedEdges.push({
      fromName: input.fromName.trim(),
      toName: input.toName.trim(),
      strength: Math.max(0, Math.min(1, input.strength)),
      rationale: input.rationale.trim(),
    });
    d.lastTouchedAt = Date.now() as Timestamp;
    return { ok: true };
  }

  /** Phase 16: add a lesson. All conceptNames must reference existing concepts. */
  async addLesson(input: {
    draftId: string;
    title: string;
    conceptNames: string[];
    references: ReadonlyArray<Reference>;
    suggestedStrategy?: StrategyId;
    estimatedMinutes?: number;
  }): Promise<{ ok: true; lessonIndex: number } | { ok: false; reason: string }> {
    const d = await this.showDraft(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const known = new Set(d.proposed.proposedConcepts.map((c) => c.name.trim().toLowerCase()));
    for (const cn of input.conceptNames) {
      if (!known.has(cn.trim().toLowerCase())) {
        return { ok: false, reason: `concept "${cn}" not found — add it first` };
      }
    }
    const newLesson = {
      draftLessonId: `lesson-${uuidv7()}`,
      title: input.title.trim(),
      conceptNames: input.conceptNames.map((n) => n.trim()),
      references: input.references as Reference[],
      suggestedStrategy: input.suggestedStrategy ?? brandId<"StrategyId">("worked-examples"),
      estimatedMinutes: input.estimatedMinutes ?? 45,
    };
    d.proposed.proposedLessons.push(newLesson);
    d.lastTouchedAt = Date.now() as Timestamp;
    return { ok: true, lessonIndex: d.proposed.proposedLessons.length - 1 };
  }

  /** Phase 16: remove a lesson by index. */
  async removeLesson(input: {
    draftId: string;
    lessonIndex: number;
  }): Promise<{ ok: boolean; reason?: string }> {
    const d = await this.showDraft(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    if (input.lessonIndex < 0 || input.lessonIndex >= d.proposed.proposedLessons.length) {
      return { ok: false, reason: `lesson index ${input.lessonIndex} out of bounds` };
    }
    d.proposed.proposedLessons.splice(input.lessonIndex, 1);
    d.lastTouchedAt = Date.now() as Timestamp;
    return { ok: true };
  }

  /** Phase 16: update draft title/subject/gradeLevel/thresholds. */
  async setMetadata(input: {
    draftId: string;
    title?: string;
    subject?: string;
    gradeLevel?: string;
    thresholds?: Partial<ThresholdConfig>;
  }): Promise<{ ok: boolean; reason?: string }> {
    const d = await this.showDraft(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    if (input.title !== undefined) d.proposed.title = input.title.trim();
    if (input.subject !== undefined) d.proposed.subject = input.subject.trim();
    if (input.gradeLevel !== undefined) d.proposed.gradeLevel = input.gradeLevel.trim();
    if (input.thresholds !== undefined) {
      d.proposed.thresholds = { ...d.proposed.thresholds, ...input.thresholds };
    }
    d.lastTouchedAt = Date.now() as Timestamp;
    return { ok: true };
  }

  /**
   * Phase 16: validates the draft and returns a DraftSummary on success, or a
   * structured issues list on failure. No throws on validation failure — returns
   * errors as data so the model can read and react.
   */
  async finalizeDraft(input: { draftId: string }): Promise<
    { ok: true; summary: DraftSummary } | { ok: false; issues: ReadonlyArray<Issue> }
  > {
    const d = await this.showDraft(input.draftId);
    if (!d)
      return {
        ok: false,
        issues: [{ kind: "draft_missing", message: "draft expired or not found" }],
      };
    const issues = validateProposed(d.proposed);
    if (issues.length > 0) return { ok: false, issues };
    return { ok: true, summary: buildSummary(d) };
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

    // Phase 16: attach source documents to the new course.
    if (d.documentIds.length > 0) {
      try {
        await this.deps.courseDocuments.attachMany({
          courseId: result.courseId,
          documentIds: d.documentIds,
          source: "bootstrap",
        });
      } catch (err) {
        this.deps.log.warn("confirmDraft.attachMany_failed", {
          courseId: result.courseId,
          err: String(err),
        });
        // Non-fatal: course is persisted; user can manually attach.
      }
    }

    this.drafts.delete(input.draftId);
    return result;
  }

  async discardDraft(draftId: string): Promise<void> {
    this.drafts.delete(draftId);
  }

  /**
   * Phase 10: Create a course directly from an imported canonical pack.
   * Reads concepts from the already-imported conceptGraphId, groups them into
   * lessons (one per 5-8 sequential concepts in pack order), and inserts a
   * course + lessons + skeleton gates in a single transaction.
   */
  async createCourseFromPack(input: {
    studentId: StudentId;
    packId: string;
    conceptGraphId: ConceptGraphId;
    courseTitle: string;
    gradeLevel: string;
  }): Promise<{ courseId: string; conceptCount: number }> {
    // Read all concepts for the given graph in order (ordered by id — pack order preserved
    // via lexicographic concept ids which encode pack sequence).
    const conceptRows = this.deps.db
      .select()
      .from(concepts)
      .where(eq(concepts.graphId, input.conceptGraphId))
      .all();

    if (conceptRows.length === 0) {
      throw new Error(
        `cannot create course from pack: no concepts found for conceptGraphId '${input.conceptGraphId}'. Has pack '${input.packId}' been imported?`,
      );
    }

    const now = new Date();
    const LESSON_SIZE = 7; // target ~7 concepts per lesson (5-8 range)

    const result = this.deps.db.transaction((tx) => {
      // 1. Course row.
      const courseId = uuidv7();
      tx.insert(courses)
        .values({
          id: courseId,
          studentId: input.studentId,
          title: input.courseTitle,
          subject: input.packId, // pack id used as subject key
          gradeLevel: input.gradeLevel,
          sourceJson: { kind: "canonical_pack", packId: input.packId },
          conceptGraphId: input.conceptGraphId,
          thresholdsJson: {
            conceptMastery: 0.8,
            lessonMastery: 0.75,
            decayDays: 14,
          },
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // 2. Group concepts into lessons (flat sequential grouping).
      const groups: (typeof conceptRows)[] = [];
      for (let i = 0; i < conceptRows.length; i += LESSON_SIZE) {
        groups.push(conceptRows.slice(i, i + LESSON_SIZE));
      }

      const lessonRowValues = groups.map((group, i) => {
        const firstConcept = group[0];
        return {
          id: uuidv7(),
          courseId,
          title: firstConcept ? `Lesson ${i + 1}: ${firstConcept.name}` : `Lesson ${i + 1}`,
          orderIndex: i,
          conceptIdsJson: group.map((c) => c.id),
          referencesJson: [] as string[],
          suggestedStrategy: brandId<"StrategyId">("worked-examples"),
          estimatedMinutes: group.length * 10,
        };
      });

      if (lessonRowValues.length > 0) {
        tx.insert(lessons).values(lessonRowValues).run();
      }

      // 3. Skeleton gates — one per lesson, chained.
      const gateIds = lessonRowValues.map(() => uuidv7());
      const gateRowValues = lessonRowValues.map((l, i) => ({
        // biome-ignore lint/style/noNonNullAssertion: gateIds is same-length as lessonRowValues
        id: gateIds[i]!,
        courseId,
        guardsJson: { kind: "lesson", lessonId: l.id },
        // biome-ignore lint/style/noNonNullAssertion: gateIds[i-1] exists for i > 0
        prerequisitesJson: i > 0 ? [gateIds[i - 1]!] : [],
        successCriteriaJson: {
          kind: "mastery-threshold",
          conceptIds: l.conceptIdsJson,
          minScore: 0.8,
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

      return { courseId, conceptCount: conceptRows.length };
    });

    return {
      courseId: result.courseId,
      conceptCount: result.conceptCount,
    };
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

function validateProposed(p: ProposedCourse): Issue[] {
  const issues: Issue[] = [];
  if (!p.title?.trim()) {
    issues.push({ kind: "empty_title", message: "course title is empty" });
  }
  if (p.proposedConcepts.length === 0) {
    issues.push({ kind: "no_concepts", message: "draft has no concepts" });
  }
  if (p.proposedLessons.length === 0) {
    issues.push({ kind: "no_lessons", message: "draft has no lessons" });
  }
  const known = new Set(p.proposedConcepts.map((c) => c.name));
  for (const lesson of p.proposedLessons) {
    for (const cn of lesson.conceptNames) {
      if (!known.has(cn)) {
        issues.push({
          kind: "unknown_concept_in_lesson",
          message: `lesson "${lesson.title}" references unknown concept "${cn}"`,
        });
      }
    }
  }
  for (const e of p.proposedEdges) {
    if (!known.has(e.fromName) || !known.has(e.toName)) {
      issues.push({
        kind: "unknown_concept_in_edge",
        message: `edge ${e.fromName}→${e.toName} references unknown concept`,
      });
    }
  }
  return issues;
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
