import { requireMode } from "@praxis/curriculum/modes";
import { sessions, tabs } from "@praxis/memory/schema";
import { and, asc, desc, eq, isNull, max } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  Logger,
  SessionId,
  StudentId,
  TabId,
  TabSummary,
  TabsService,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface TabsServiceDeps {
  readonly db: PraxisDb;
  readonly log: Logger;
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
  if (opts.modeId === "bootstrap") return `${displayName} · new course`;
  return `${displayName} · session`;
}

/** Shape of the joined select result for tab + session columns. */
interface TabSelectRow {
  id: string;
  sessionId: string;
  title: string;
  sortOrder: number;
  openedAt: Date;
  lastSeenAt: Date;
  closedAt: Date | null;
  modeId: string;
  courseId: string | null;
  assignmentId: string | null;
}

function rowToSummary(row: TabSelectRow): TabSummary {
  return {
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

export class TabsServiceImpl implements TabsService {
  constructor(private readonly deps: TabsServiceDeps) {}

  async listOpen(studentId: StudentId): Promise<TabSummary[]> {
    const rows = this.deps.db
      .select({
        id: tabs.id,
        sessionId: tabs.sessionId,
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
      .innerJoin(sessions, eq(tabs.sessionId, sessions.id))
      .where(and(eq(tabs.studentId, studentId), isNull(tabs.closedAt)))
      .orderBy(asc(tabs.sortOrder))
      .all();
    return rows.map(rowToSummary);
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
        sessionId: tabs.sessionId,
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
      .innerJoin(sessions, eq(tabs.sessionId, sessions.id))
      .where(where)
      .orderBy(desc(tabs.lastSeenAt))
      .limit(limit)
      .all();
    return rows.map(rowToSummary);
  }

  async get(tabId: TabId): Promise<TabSummary | null> {
    const row = this.deps.db
      .select({
        id: tabs.id,
        sessionId: tabs.sessionId,
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
      .innerJoin(sessions, eq(tabs.sessionId, sessions.id))
      .where(eq(tabs.id, tabId))
      .get();
    return row ? rowToSummary(row) : null;
  }

  async open(input: {
    studentId: StudentId;
    sessionId: SessionId;
    courseTitle?: string;
  }): Promise<TabSummary> {
    // Look up the session to get modeId.
    const sessionRow = this.deps.db
      .select({ modeId: sessions.modeId, courseId: sessions.courseId })
      .from(sessions)
      .where(eq(sessions.id, input.sessionId))
      .get();

    if (!sessionRow) {
      throw new Error(`TabsService.open: session not found: ${input.sessionId}`);
    }

    // Compute next sortOrder (max existing + 1, or 0 if none).
    const maxResult = this.deps.db
      .select({ maxOrder: max(tabs.sortOrder) })
      .from(tabs)
      .where(eq(tabs.studentId, input.studentId))
      .get();
    const nextOrder = (maxResult?.maxOrder ?? -1) + 1;

    const title = generateTitle({
      modeId: sessionRow.modeId,
      ...(input.courseTitle !== undefined && { courseTitle: input.courseTitle }),
    });

    const id = uuidv7();
    const now = new Date();

    this.deps.db
      .insert(tabs)
      .values({
        id,
        studentId: input.studentId,
        sessionId: input.sessionId,
        title,
        sortOrder: nextOrder,
        openedAt: now,
        lastSeenAt: now,
        closedAt: null,
      })
      .run();

    const created = await this.get(brandId<"TabId">(id));
    if (!created) {
      throw new Error(`TabsService.open: tab not found after insert: ${id}`);
    }
    return created;
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

    const updated = await this.get(tabId);
    if (!updated) {
      throw new Error(`TabsService.reopen: tab not found after update: ${tabId}`);
    }
    return updated;
  }

  async close(tabId: TabId): Promise<void> {
    this.deps.db.update(tabs).set({ closedAt: new Date() }).where(eq(tabs.id, tabId)).run();
  }

  async touch(tabId: TabId): Promise<void> {
    this.deps.db.update(tabs).set({ lastSeenAt: new Date() }).where(eq(tabs.id, tabId)).run();
  }

  async rename(tabId: TabId, title: string): Promise<TabSummary> {
    this.deps.db.update(tabs).set({ title }).where(eq(tabs.id, tabId)).run();

    const updated = await this.get(tabId);
    if (!updated) {
      throw new Error(`TabsService.rename: tab not found after update: ${tabId}`);
    }
    return updated;
  }
}

// Export generateTitle for tests.
export { generateTitle };
