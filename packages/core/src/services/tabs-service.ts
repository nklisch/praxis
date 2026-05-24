import { requireMode } from "@praxis/curriculum/modes";
import { sessions, tabs } from "@praxis/memory/schema";
import { and, asc, desc, eq, isNull, max, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  DocumentId,
  DocumentTabSummary,
  Logger,
  SessionId,
  SessionTabSummary,
  StudentId,
  TabId,
  TabSummary,
  TabsService,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import { loadOrThrow } from "./db-helpers.js";
import type { SessionPromotionRegistry } from "./session/session-promotion-registry.js";

export interface TabsServiceDeps {
  readonly db: PraxisDb;
  readonly log: Logger;
  /**
   * empty-session-cleanup: the `sessions` row for a newly-started session is
   * not written until the first `send()` call (lazy-persist). UI opens a tab
   * immediately after `session.start`, so `open()` would otherwise throw
   * "session not found". Pass a thunk returning the live promotion registry
   * so `open()` can fall back to its in-memory state. Lazy thunk because
   * the registry is constructed AFTER `TabsServiceImpl` in the orchestrator's
   * step ordering (workspace step 8 → session precursors step 9).
   */
  readonly sessionPromotionRegistry?: () => SessionPromotionRegistry | undefined;
}

/**
 * Auto-generate a tab title from session metadata.
 * Examples:
 *   - teach session, no course   → "teach · new chat"
 *   - teach session, course      → "algebra · teach"
 *   - bootstrap, no course       → "course design · new course"
 *   - quiz, course + assignment  → "algebra · quiz"
 */
function generateTitle(opts: { modeId: string; courseTitle?: string }): string {
  const displayName = requireMode(opts.modeId).displayName;
  if (opts.courseTitle) {
    return `${opts.courseTitle.toLowerCase()} · ${displayName}`;
  }
  if (opts.modeId === "teach") return `${displayName} · new chat`;
  if (opts.modeId === "course-create") return `${displayName} · new course`;
  return `${displayName} · session`;
}

/** Shape of the joined select result for a session tab (inner join with sessions). */
interface SessionTabSelectRow {
  id: string;
  kind: string;
  sessionId: string;
  documentId: string | null;
  title: string;
  sortOrder: number;
  openedAt: Date;
  lastSeenAt: Date;
  closedAt: Date | null;
  modeId: string;
  courseId: string | null;
  assignmentId: string | null;
}

/** Shape of the select result for a document tab (no join needed). */
interface DocumentTabSelectRow {
  id: string;
  kind: string;
  sessionId: string | null;
  documentId: string;
  title: string;
  sortOrder: number;
  openedAt: Date;
  lastSeenAt: Date;
  closedAt: Date | null;
}

/** Full row from a left-joined query — used by listOpen/list/get. */
interface AnyTabSelectRow {
  id: string;
  kind: string;
  sessionId: string | null;
  documentId: string | null;
  title: string;
  sortOrder: number;
  openedAt: Date;
  lastSeenAt: Date;
  closedAt: Date | null;
  modeId: string | null;
  courseId: string | null;
  assignmentId: string | null;
}

function sessionRowToSummary(row: SessionTabSelectRow): SessionTabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">(row.id),
    sessionId: brandId<"SessionId">(row.sessionId),
    modeId: row.modeId,
    title: row.title,
    ...(row.courseId !== null && row.courseId !== undefined && { courseId: row.courseId }),
    ...(row.assignmentId !== null &&
      row.assignmentId !== undefined && { assignmentId: row.assignmentId }),
    sortOrder: row.sortOrder,
    openedAt: row.openedAt.getTime() as Timestamp,
    lastSeenAt: row.lastSeenAt.getTime() as Timestamp,
    closedAt: row.closedAt ? (row.closedAt.getTime() as Timestamp) : null,
  };
}

function documentRowToSummary(row: DocumentTabSelectRow): DocumentTabSummary {
  return {
    kind: "document",
    id: brandId<"TabId">(row.id),
    documentId: brandId<"DocumentId">(row.documentId),
    title: row.title,
    sortOrder: row.sortOrder,
    openedAt: row.openedAt.getTime() as Timestamp,
    lastSeenAt: row.lastSeenAt.getTime() as Timestamp,
    closedAt: row.closedAt ? (row.closedAt.getTime() as Timestamp) : null,
  };
}

/**
 * Map a left-joined tab row to a `TabSummary`. For session tabs whose
 * `sessions` row has not yet been written (lazy-persist path), fall back to
 * the in-memory promotion registry to fill in modeId / courseId / assignmentId.
 */
function anyRowToSummary(
  row: AnyTabSelectRow,
  registry?: SessionPromotionRegistry | undefined,
): TabSummary {
  if (row.kind === "document") {
    if (!row.documentId) {
      throw new Error(`TabsService: document tab ${row.id} has no documentId`);
    }
    return documentRowToSummary({
      id: row.id,
      kind: row.kind,
      sessionId: null,
      documentId: row.documentId,
      title: row.title,
      sortOrder: row.sortOrder,
      openedAt: row.openedAt,
      lastSeenAt: row.lastSeenAt,
      closedAt: row.closedAt,
    });
  }
  // Default: "session" kind
  if (!row.sessionId) {
    throw new Error(`TabsService: session tab ${row.id} has no sessionId`);
  }
  let modeId = row.modeId;
  let courseId = row.courseId;
  let assignmentId = row.assignmentId;
  if (modeId === null) {
    const unpromoted = registry?.get(brandId<"SessionId">(row.sessionId)) ?? null;
    if (!unpromoted) {
      throw new Error(`TabsService: session tab ${row.id} has no modeId`);
    }
    modeId = unpromoted.modeId;
    courseId = unpromoted.courseId ?? null;
    assignmentId = unpromoted.assignmentId ?? null;
  }
  return sessionRowToSummary({
    id: row.id,
    kind: row.kind,
    sessionId: row.sessionId,
    documentId: null,
    title: row.title,
    sortOrder: row.sortOrder,
    openedAt: row.openedAt,
    lastSeenAt: row.lastSeenAt,
    closedAt: row.closedAt,
    modeId,
    courseId,
    assignmentId,
  });
}

export class TabsServiceImpl implements TabsService {
  constructor(private readonly deps: TabsServiceDeps) {}

  /** Resolve the live promotion registry, if one is wired. */
  private get registry(): SessionPromotionRegistry | undefined {
    return this.deps.sessionPromotionRegistry?.();
  }

  async listOpen(studentId: StudentId): Promise<TabSummary[]> {
    const rows = this.deps.db
      .select({
        id: tabs.id,
        kind: tabs.kind,
        sessionId: tabs.sessionId,
        documentId: tabs.documentId,
        title: tabs.title,
        sortOrder: tabs.sortOrder,
        openedAt: tabs.openedAt,
        lastSeenAt: tabs.lastSeenAt,
        closedAt: tabs.closedAt,
        modeId: sessions.modeId,
        courseId: sessions.courseId,
        assignmentId: sessions.assignmentId,
      })
      .from(tabs)
      .leftJoin(sessions, sql`${tabs.sessionId} = ${sessions.id}`)
      .where(and(eq(tabs.studentId, studentId), isNull(tabs.closedAt)))
      .orderBy(asc(tabs.sortOrder))
      .all();
    const registry = this.registry;
    return rows.map((r) => anyRowToSummary(r, registry));
  }

  async list(
    studentId: StudentId,
    opts?: { limit?: number; includeClosed?: boolean },
  ): Promise<TabSummary[]> {
    const limit = opts?.limit ?? 50;
    const includeClosed = opts?.includeClosed ?? false;

    const where = includeClosed
      ? eq(tabs.studentId, studentId)
      : and(eq(tabs.studentId, studentId), isNull(tabs.closedAt));

    const rows = this.deps.db
      .select({
        id: tabs.id,
        kind: tabs.kind,
        sessionId: tabs.sessionId,
        documentId: tabs.documentId,
        title: tabs.title,
        sortOrder: tabs.sortOrder,
        openedAt: tabs.openedAt,
        lastSeenAt: tabs.lastSeenAt,
        closedAt: tabs.closedAt,
        modeId: sessions.modeId,
        courseId: sessions.courseId,
        assignmentId: sessions.assignmentId,
      })
      .from(tabs)
      .leftJoin(sessions, sql`${tabs.sessionId} = ${sessions.id}`)
      .where(where)
      .orderBy(desc(tabs.lastSeenAt))
      .limit(limit)
      .all();
    const registry = this.registry;
    return rows.map((r) => anyRowToSummary(r, registry));
  }

  async get(tabId: TabId): Promise<TabSummary | null> {
    const row = this.deps.db
      .select({
        id: tabs.id,
        kind: tabs.kind,
        sessionId: tabs.sessionId,
        documentId: tabs.documentId,
        title: tabs.title,
        sortOrder: tabs.sortOrder,
        openedAt: tabs.openedAt,
        lastSeenAt: tabs.lastSeenAt,
        closedAt: tabs.closedAt,
        modeId: sessions.modeId,
        courseId: sessions.courseId,
        assignmentId: sessions.assignmentId,
      })
      .from(tabs)
      .leftJoin(sessions, sql`${tabs.sessionId} = ${sessions.id}`)
      .where(eq(tabs.id, tabId))
      .get();
    return row ? anyRowToSummary(row, this.registry) : null;
  }

  async open(input: {
    studentId: StudentId;
    sessionId: SessionId;
    courseTitle?: string;
  }): Promise<SessionTabSummary> {
    // Resolve the session's modeId. Sessions are lazy-persisted: the row may
    // not yet exist in the DB when the UI opens a tab right after
    // `session.start`. Check the DB first, then fall back to the in-memory
    // promotion registry.
    let resolvedModeId: string;
    const sessionRow = this.deps.db
      .select({ modeId: sessions.modeId, courseId: sessions.courseId })
      .from(sessions)
      .where(eq(sessions.id, input.sessionId))
      .get();

    if (sessionRow) {
      resolvedModeId = sessionRow.modeId;
    } else {
      const unpromoted = this.deps.sessionPromotionRegistry?.()?.get(input.sessionId) ?? null;
      if (!unpromoted) {
        throw new Error(`TabsService.open: session not found: ${input.sessionId}`);
      }
      resolvedModeId = unpromoted.modeId;
    }

    // Compute next sortOrder (max existing + 1, or 0 if none).
    const maxResult = this.deps.db
      .select({ maxOrder: max(tabs.sortOrder) })
      .from(tabs)
      .where(eq(tabs.studentId, input.studentId))
      .get();
    const nextOrder = (maxResult?.maxOrder ?? -1) + 1;

    const title = generateTitle({
      modeId: resolvedModeId,
      ...(input.courseTitle !== undefined && { courseTitle: input.courseTitle }),
    });

    const id = uuidv7();
    const now = new Date();

    this.deps.db
      .insert(tabs)
      .values({
        id,
        studentId: input.studentId,
        kind: "session",
        sessionId: input.sessionId,
        documentId: null,
        title,
        sortOrder: nextOrder,
        openedAt: now,
        lastSeenAt: now,
        closedAt: null,
      })
      .run();

    return loadOrThrow(
      async () => {
        const t = await this.get(brandId<"TabId">(id));
        return t && t.kind === "session" ? t : null;
      },
      { entity: "tab", op: "create", id, log: this.deps.log },
    );
  }

  async openDocument(input: {
    studentId: StudentId;
    documentId: DocumentId;
    title: string;
  }): Promise<DocumentTabSummary> {
    // Compute next sortOrder (max existing + 1, or 0 if none).
    const maxResult = this.deps.db
      .select({ maxOrder: max(tabs.sortOrder) })
      .from(tabs)
      .where(eq(tabs.studentId, input.studentId))
      .get();
    const nextOrder = (maxResult?.maxOrder ?? -1) + 1;

    const id = uuidv7();
    const now = new Date();

    this.deps.db
      .insert(tabs)
      .values({
        id,
        studentId: input.studentId,
        kind: "document",
        sessionId: null,
        documentId: input.documentId,
        title: input.title,
        sortOrder: nextOrder,
        openedAt: now,
        lastSeenAt: now,
        closedAt: null,
      })
      .run();

    return loadOrThrow(
      async () => {
        const t = await this.get(brandId<"TabId">(id));
        return t && t.kind === "document" ? t : null;
      },
      { entity: "tab", op: "create", id, log: this.deps.log },
    );
  }

  async reopen(tabId: TabId): Promise<TabSummary> {
    const existing = this.deps.db
      .select({ studentId: tabs.studentId })
      .from(tabs)
      .where(eq(tabs.id, tabId))
      .get();

    if (!existing) {
      throw new Error(`TabsService.reopen: tab not found: ${tabId}`);
    }

    // Re-assign sortOrder to the end.
    const maxResult = this.deps.db
      .select({ maxOrder: max(tabs.sortOrder) })
      .from(tabs)
      .where(eq(tabs.studentId, existing.studentId))
      .get();
    const nextOrder = (maxResult?.maxOrder ?? -1) + 1;

    const now = new Date();
    this.deps.db
      .update(tabs)
      .set({ closedAt: null, sortOrder: nextOrder, lastSeenAt: now })
      .where(eq(tabs.id, tabId))
      .run();

    return loadOrThrow(() => this.get(tabId), {
      entity: "tab",
      op: "update",
      id: tabId,
      log: this.deps.log,
    });
  }

  async close(tabId: TabId): Promise<void> {
    this.deps.db.update(tabs).set({ closedAt: new Date() }).where(eq(tabs.id, tabId)).run();
  }

  async touch(tabId: TabId): Promise<void> {
    this.deps.db.update(tabs).set({ lastSeenAt: new Date() }).where(eq(tabs.id, tabId)).run();
  }

  async rename(tabId: TabId, title: string): Promise<TabSummary> {
    this.deps.db.update(tabs).set({ title }).where(eq(tabs.id, tabId)).run();

    return loadOrThrow(() => this.get(tabId), {
      entity: "tab",
      op: "update",
      id: tabId,
      log: this.deps.log,
    });
  }
}

// Export generateTitle for tests.
export { generateTitle };
