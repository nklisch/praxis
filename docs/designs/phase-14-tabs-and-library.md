# Design: Phase 14 — Tabs + Library

## Overview

Phase 14 is the IA shift. Two major changes that depend on each other:

1. **Multi-session tabs** in the chat workspace. Each tab is a live session of any mode
   (teach, bootstrap, quiz, homework, exam, configure). Multiple sessions run in parallel;
   switching is instant. Open tabs survive app restart.
2. **Library** at `/` — the new front door. A single editorial table-of-contents listing
   courses (in progress, available), packs (with a one-click "Use this pack"), documents,
   and recent sessions. Replaces the `/courses` + `/packs` trinity.

These together unlock the "named arcs, not infinite chat" experience. The student stops
thinking *I'm in chat* and starts thinking *I'm working on algebra and have calc-bootstrap
humming in another tab.*

Each tab still uses today's chat shape inside (message log + composer + ModeHeader). The
per-modality bodies (quiz = flashcards, exam = proctored, etc.) land in Phase 16 — the
tab dispatch infrastructure built here is what Phase 16 plugs into.

**Out of scope:**
- Per-modality tab bodies — Phase 16.
- Sketching inside tabs — Phase 15.
- Multi-window or detachable tabs — never.
- Tab groups, pinning, color labels — bloat for now.

## Decisions baked into this design

These are decisions I'm committing to unless explicitly overridden — flagged here so the
implementer doesn't have to guess.

| Decision | Choice | Why |
|---|---|---|
| Front door | `/` → Library; chat moves to `/chat[/$tabId]` | Auto-mounting a teach session at `/` made sense for v1 single-session; with tabs it's wrong. Library-first lets the student CHOOSE what to work on. |
| Tab strip location | Inside `/chat` workspace only; not app-wide | Matches the user's framing ("tabs of different modes open in chat"). Keeps Library and other routes uncluttered. |
| Closing a tab | Sets `closedAt` on the `tabs` row; does NOT call `session.end` | Reopenable from Library archive. Sessions only end via explicit submission (assignments) or "end session" action. |
| Old `/courses`, `/packs` | Permanent redirects to `/library` | Old bookmarks still work. |
| Course detail/map URLs | Stay as `/courses/$courseId` and `/courses/$courseId/map` | Back-compat for bookmarks; Library links to them. |
| Tab URL | `/chat/$tabId` | Deep-linkable. Bare `/chat` shows a tab picker. |
| Documents sidebar | Stays in `/chat` workspace | Global to workspace, not per-tab. Same shape as today. |
| Auto-summary for archived sessions | Heuristic (first user message truncated + mode/course context) | LLM summaries are slow and expensive; defer. |
| TabsService location | `@praxis/core` backend service with SQLite persistence | Matches every other Praxis service; persists across restarts and (eventually) hosted. |
| Soft tab limit | None for v1 | The strip wraps to a second row beyond ~6 tabs. Hard limits are bloat. |
| Default focused tab on restart | Last-focused (tracked via `lastSeenAt`) | Resume where you left off. |

---

## Implementation Units

### Unit 1: `tabs` table schema + migration

**File**: `packages/memory/src/schema.ts` (modify existing)

Add the new table alongside `sessions`:

```typescript
export const tabs = sqliteTable(
  "tabs",
  {
    id: text("id").primaryKey(), // uuidv7
    studentId: text("student_id").notNull(),
    /** The session this tab is bound to. Cascade-delete if the session is deleted. */
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** Auto-generated display title, e.g. "algebra · fractions, redux" or "teach · new chat". */
    title: text("title").notNull(),
    /** Visual ordering — higher = further right in the strip. */
    sortOrder: integer("sort_order").notNull(),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
    /** Updated each time the tab is focused. Used to restore the last-focused tab on reload. */
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    /** Set when the user closes the tab. Closed tabs vanish from the strip but stay in the archive. */
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    studentOpenIdx: index("tabs_student_open_idx").on(t.studentId, t.closedAt, t.sortOrder),
    sessionIdx: index("tabs_session_idx").on(t.sessionId),
  }),
);
```

Add to the schema barrel export at the bottom of the file alongside `sessions`.

**File**: `drizzle/0006_tabs.sql` (new — generated, then committed)

Run `pnpm db:generate` to produce the migration. The implementer should commit the
generated SQL file; do NOT hand-write it.

**Implementation Notes**:
- The `studentOpenIdx` includes `closedAt` so the "open tabs" query (`WHERE student_id = ? AND closed_at IS NULL ORDER BY sort_order`) is fully indexed.
- `sortOrder` is an integer; new tabs get `MAX(sort_order) + 1`. Reordering is by re-assigning sort_order values (not implemented in v1 — tabs stay in open-order).
- Cascade on session delete is correct: if a session is hard-deleted (rare), its tab disappears too.

**Acceptance Criteria**:
- [ ] `tabs` table exists in the SQLite schema after migration.
- [ ] `pnpm db:show` lists `tabs` with the expected columns.
- [ ] Drizzle infers the row type as `typeof tabs.$inferSelect` correctly (test by importing in a TS file that uses the type).

---

### Unit 2: `TabsService` interface + `TabRow` types

**File**: `packages/core/src/types/tabs.ts` (new)

```typescript
import type { SessionId, StudentId, Timestamp } from "./common.js";

export type TabId = string & { readonly __brand: "TabId" };

/** Returned by TabsService.list/listOpen — derived from the DB row plus session metadata. */
export interface TabSummary {
  readonly id: TabId;
  readonly sessionId: SessionId;
  readonly modeId: string;
  /** Auto-generated display title (e.g. "algebra · fractions, redux"). */
  readonly title: string;
  /** Optional courseId from the underlying session (if the tab is course-bound). */
  readonly courseId?: string;
  readonly sortOrder: number;
  readonly openedAt: Timestamp;
  readonly lastSeenAt: Timestamp;
  /** Null when the tab is open; set when archived. */
  readonly closedAt: Timestamp | null;
}

export interface TabsService {
  /** All open tabs for the student, sorted by sortOrder ascending. */
  listOpen(studentId: StudentId): Promise<TabSummary[]>;

  /**
   * All tabs for the student including closed ones. Used by the Library archive.
   * Ordered by lastSeenAt descending (most recently active first).
   * `limit` defaults to 50.
   */
  list(studentId: StudentId, opts?: { limit?: number; includeClosed?: boolean }): Promise<TabSummary[]>;

  /** Look up one tab by id. Returns null if not found or closed-and-purged. */
  get(tabId: TabId): Promise<TabSummary | null>;

  /**
   * Open a new tab bound to an existing session. Used after `session.start` succeeds —
   * the renderer calls `session.start` then `tabs.open` with the resulting sessionId.
   * Auto-generates the title from session metadata + mode.
   */
  open(input: { studentId: StudentId; sessionId: SessionId }): Promise<TabSummary>;

  /**
   * Reopen a previously-closed tab. Clears `closedAt`, re-assigns sortOrder to the end.
   * Returns the refreshed TabSummary. Throws if the tab doesn't exist or its session is gone.
   */
  reopen(tabId: TabId): Promise<TabSummary>;

  /**
   * Close a tab — sets `closedAt` to now. Does NOT end the underlying session.
   * The tab vanishes from the strip but stays in the archive (Library section).
   */
  close(tabId: TabId): Promise<void>;

  /**
   * Touch a tab as last-focused — bumps `lastSeenAt` to now. Called on tab activation
   * so restoring the workspace can land on the right tab.
   */
  touch(tabId: TabId): Promise<void>;

  /** Rename a tab. Used by Library context menu. */
  rename(tabId: TabId, title: string): Promise<TabSummary>;
}
```

**File**: `packages/core/src/types/index.ts` (modify existing) — add `export type { TabId, TabSummary, TabsService } from "./tabs.js";`

**Acceptance Criteria**:
- [ ] `TabId` is a branded string; `brandId<"TabId">` produces it (existing brandId helper).
- [ ] `TabSummary.closedAt` is `Timestamp | null` (not `undefined`) so the JSON wire format is stable.
- [ ] All methods are async — never throw synchronously; SDK-style error envelopes are unnecessary here (errors are exceptional, not control flow).

---

### Unit 3: `TabsServiceImpl`

**File**: `packages/core/src/services/tabs-service.ts` (new)

```typescript
import { v7 as uuidv7 } from "uuid";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { sessions } from "@praxis/memory/schema";
import { tabs } from "@praxis/memory/schema";
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
import type { PraxisDb } from "../db/index.js";
import { loadOrThrow } from "./load-or-throw.js";

export interface TabsServiceDeps {
  readonly db: PraxisDb;
  readonly log: Logger;
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
      })
      .from(tabs)
      .innerJoin(sessions, eq(tabs.sessionId, sessions.id))
      .where(and(eq(tabs.studentId, studentId), isNull(tabs.closedAt)))
      .orderBy(asc(tabs.sortOrder))
      .all();
    return rows.map((r) => this.rowToSummary(r));
  }

  async list(
    studentId: StudentId,
    opts?: { limit?: number; includeClosed?: boolean },
  ): Promise<TabSummary[]> { /* ... */ }

  async get(tabId: TabId): Promise<TabSummary | null> { /* ... */ }

  async open(input: { studentId: StudentId; sessionId: SessionId }): Promise<TabSummary> {
    // 1. Look up the session to get modeId + courseId for title generation.
    // 2. Compute sortOrder = (max existing sortOrder for this student) + 1.
    // 3. Generate title via generateTitle(session, ...). For v1: "<modeId> · <courseTitle?>".
    // 4. Insert. loadOrThrow round-trip.
    // 5. Return TabSummary.
    /* ... */
  }

  async reopen(tabId: TabId): Promise<TabSummary> { /* ... */ }
  async close(tabId: TabId): Promise<void> { /* ... */ }
  async touch(tabId: TabId): Promise<void> { /* ... */ }
  async rename(tabId: TabId, title: string): Promise<TabSummary> { /* ... */ }

  private rowToSummary(row: { /* select-shape */ }): TabSummary {
    return {
      id: brandId<"TabId">(row.id),
      sessionId: brandId<"SessionId">(row.sessionId),
      modeId: row.modeId,
      title: row.title,
      ...(row.courseId !== null && { courseId: row.courseId }),
      sortOrder: row.sortOrder,
      openedAt: row.openedAt.getTime() as Timestamp,
      lastSeenAt: row.lastSeenAt.getTime() as Timestamp,
      closedAt: row.closedAt ? (row.closedAt.getTime() as Timestamp) : null,
    };
  }
}

/**
 * Auto-generate a tab title from session metadata.
 * Examples:
 *   - teach session, no course   → "teach · new chat"
 *   - teach session, course      → "algebra · teach"
 *   - bootstrap, no course       → "bootstrap · new course"
 *   - quiz, course + assignment  → "algebra · quiz"
 */
function generateTitle(opts: {
  modeId: string;
  courseTitle?: string;
}): string {
  if (opts.courseTitle) {
    return `${opts.courseTitle.toLowerCase()} · ${opts.modeId}`;
  }
  if (opts.modeId === "teach") return "teach · new chat";
  if (opts.modeId === "bootstrap") return "bootstrap · new course";
  return `${opts.modeId} · session`;
}
```

**Implementation Notes**:
- Use `loadOrThrow` (existing pattern in `@praxis/core/services/load-or-throw.ts`) for write paths to keep error format consistent.
- `sortOrder` increments monotonically per-student; query `MAX(sort_order)` first then insert. Race conditions are non-issue (single-process desktop).
- `generateTitle` does NOT call the LLM — pure function, fast. LLM-driven titles can land in a future phase as `tabs.regenerateTitle(tabId)`.
- For `open`, look up the session's courseId; if non-null, look up the course's title via `artifacts` (or pass it in — see `open()` signature evolution decision below).

**Decision on courseTitle lookup in `open`**: rather than have `TabsService` reach into `artifacts`, the **caller** passes `courseTitle` if known. The renderer almost always knows it (it just clicked "Start session" on a course detail page). When called from a route that doesn't know it (raw `/chat?session=X` deep link), the title falls back to `<modeId> · session` and can be regenerated later. Keeps `TabsService` dependency-free.

Updated `open` signature:
```typescript
open(input: {
  studentId: StudentId;
  sessionId: SessionId;
  /** Optional: caller passes the course title if known, used for the auto-generated tab title. */
  courseTitle?: string;
}): Promise<TabSummary>;
```

**Acceptance Criteria**:
- [ ] `listOpen` returns only tabs where `closedAt IS NULL`, ordered by `sortOrder`.
- [ ] `list` returns archived tabs too when `includeClosed: true`, ordered by `lastSeenAt DESC`.
- [ ] `open` inserts with `sortOrder = MAX(existing) + 1`.
- [ ] `close` sets `closedAt`; subsequent `listOpen` doesn't include it; `get` still returns it.
- [ ] `reopen` clears `closedAt` and pushes `sortOrder` to the end.
- [ ] `touch` updates `lastSeenAt` to now.
- [ ] `rename` updates `title`.
- [ ] `generateTitle` produces stable strings for the documented input matrix.

---

### Unit 4: Wire `TabsServiceImpl` into the service composition root

**File**: `packages/desktop/electron/main/services.ts` (modify existing)

Three additive changes — same pattern as `ClaudeAuthServiceImpl` from the auth phase:

1. Import: add `TabsServiceImpl` to the existing `from "@praxis/core/services"` import.
2. Add to `Services` interface: `tabs: TabsServiceImpl;` (place after `claudeAuth`).
3. Construct in `buildServices`: `const tabsService = new TabsServiceImpl({ db, log });` near where `lockService` is constructed.
4. Add to the returned object: `tabs: tabsService,`.

Do NOT add to `ServiceDeps.toolServices` — no tool handler needs it.

**Acceptance Criteria**:
- [ ] `services.tabs` is accessible after `buildServices` returns.
- [ ] No other service signatures change.

---

### Unit 5: Add `SessionService.list()` for archive + Library

**File**: `packages/core/src/types/client.ts` (modify the existing `SessionService` interface)

Add a `list` method:

```typescript
export interface SessionService {
  // existing: start, send, end, active
  /**
   * List sessions for the student. Used by the Library archive section and the
   * tab-restoration logic. Ordered by `startedAt` descending.
   *
   * @param opts.includeEnded - when true, includes sessions with `endedAt` set. Default true.
   * @param opts.limit - default 100.
   */
  list(opts?: {
    includeEnded?: boolean;
    limit?: number;
  }): Promise<SessionSummary[]>;
}
```

Where `SessionSummary` is a new type alongside the existing `SessionHandle` — it differs by including the timestamps and a count of episodic events:

```typescript
export interface SessionSummary {
  readonly sessionId: SessionId;
  readonly modeId: string;
  readonly courseId?: CourseId;
  readonly assignmentId?: AssignmentId;
  readonly startedAt: Timestamp;
  /** Null when the session is still open. */
  readonly endedAt: Timestamp | null;
  /** First user message, truncated to 60 chars. Used as a deck line in Library. */
  readonly firstUserMessage?: string;
}
```

(There's already a `SessionSummary` type from earlier — rename to `SessionEndSummary` if it conflicts, or extend the existing one. Implementer should check `packages/core/src/types/client.ts` for the existing definition before deciding.)

**File**: `packages/core/src/services/session-service.ts` (modify)

Add the method to `SessionServiceImpl`:

```typescript
async list(opts?: { includeEnded?: boolean; limit?: number }): Promise<SessionSummary[]> {
  const studentId = getOrCreateDefaultStudentId(this.deps.db);
  const limit = opts?.limit ?? 100;
  const includeEnded = opts?.includeEnded ?? true;

  const where = includeEnded
    ? eq(sessions.studentId, studentId)
    : and(eq(sessions.studentId, studentId), isNull(sessions.endedAt));

  const rows = this.deps.db
    .select(/* ... */)
    .from(sessions)
    .where(where)
    .orderBy(desc(sessions.startedAt))
    .limit(limit)
    .all();

  // For each row, fetch the first user message via episodic_events lookup.
  // Implementation note: do this in a single batch query, not N+1.
  /* ... */

  return rows.map((r) => /* shape */);
}
```

**Implementation Notes**:
- The `firstUserMessage` lookup needs care — episodic_events is large. Use a CTE or subquery to fetch the first event per session in one round trip. Alternatively, denormalize the first user message onto the `sessions` table at session-end. **For v1, take the simpler path**: query episodic_events for the first user_message event per listed session (N round trips for N sessions, capped by `limit`); revisit if Library load gets slow.
- Truncate `firstUserMessage` to ~60 chars with ellipsis if longer.

**Acceptance Criteria**:
- [ ] `client.session.list()` returns sessions for the active student, ordered by start time desc.
- [ ] `includeEnded: false` filters to only open sessions.
- [ ] `firstUserMessage` is set when the session has at least one user message; absent otherwise.

---

### Unit 6: IPC handlers for tabs

**File**: `packages/desktop/electron/main/ipc-server.ts` (modify existing)

Add a new section after the auth handlers:

```typescript
// ── Tabs ─────────────────────────────────────────────────────────────────

handle("praxis.tabs.listOpen", async () => {
  const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
  return services.tabs.listOpen(studentId);
});

handle("praxis.tabs.list", async (_event, opts: { limit?: number; includeClosed?: boolean }) => {
  const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
  return services.tabs.list(studentId, opts);
});

handle("praxis.tabs.get", async (_event, tabId: string) => {
  return services.tabs.get(tabId as TabId);
});

handle(
  "praxis.tabs.open",
  async (_event, opts: { sessionId: string; courseTitle?: string }) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.tabs.open({
      studentId,
      sessionId: opts.sessionId as SessionId,
      ...(opts.courseTitle !== undefined && { courseTitle: opts.courseTitle }),
    });
  },
);

handle("praxis.tabs.reopen", async (_event, tabId: string) => {
  return services.tabs.reopen(tabId as TabId);
});

handle("praxis.tabs.close", async (_event, tabId: string) => {
  return services.tabs.close(tabId as TabId);
});

handle("praxis.tabs.touch", async (_event, tabId: string) => {
  return services.tabs.touch(tabId as TabId);
});

handle(
  "praxis.tabs.rename",
  async (_event, opts: { tabId: string; title: string }) => {
    return services.tabs.rename(opts.tabId as TabId, opts.title);
  },
);

// ── Sessions: list (the existing session.start/send/end/active handlers stay) ─

handle(
  "praxis.session.list",
  async (_event, opts: { includeEnded?: boolean; limit?: number }) => {
    return services.session.list(opts);
  },
);
```

**Acceptance Criteria**:
- [ ] All 8 tab channels + 1 session channel respond to invokes.
- [ ] Channel naming follows `praxis.tabs.<verb>` convention.
- [ ] No streaming channels needed — tabs are CRUD, not events.

---

### Unit 7: `TabsClient` + `PraxisClient` wiring

**File**: `packages/client/src/services/tabs-client.ts` (new)

```typescript
import type { SessionId, TabId, TabSummary, TabsService } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = "praxis.tabs" as const;

export class TabsClient implements TabsService {
  constructor(private readonly transport: ClientTransport) {}

  listOpen(): Promise<TabSummary[]> {
    return this.transport.invoke<TabSummary[]>(`${C}.listOpen`);
  }
  list(_studentId: never, opts?: { limit?: number; includeClosed?: boolean }): Promise<TabSummary[]> {
    // _studentId is intentionally not transmitted — the server resolves it from the active student.
    return this.transport.invoke<TabSummary[]>(`${C}.list`, opts ?? {});
  }
  get(tabId: TabId): Promise<TabSummary | null> {
    return this.transport.invoke<TabSummary | null>(`${C}.get`, tabId);
  }
  open(input: { sessionId: SessionId; courseTitle?: string }): Promise<TabSummary> {
    return this.transport.invoke<TabSummary>(`${C}.open`, input);
  }
  reopen(tabId: TabId): Promise<TabSummary> {
    return this.transport.invoke<TabSummary>(`${C}.reopen`, tabId);
  }
  close(tabId: TabId): Promise<void> {
    return this.transport.invoke<void>(`${C}.close`, tabId);
  }
  touch(tabId: TabId): Promise<void> {
    return this.transport.invoke<void>(`${C}.touch`, tabId);
  }
  rename(tabId: TabId, title: string): Promise<TabSummary> {
    return this.transport.invoke<TabSummary>(`${C}.rename`, { tabId, title });
  }
}
```

**Note on `studentId` ergonomics**: the server-side `TabsService` interface takes `studentId` because it's framework-shaped. The renderer-side `TabsClient` doesn't pass `studentId` because the server resolves it from the active session. To make this clean without a divergent interface, the client takes the same shape but ignores `studentId` (the underscore-prefixed param above). Implementer can choose to either (a) make the interface params optional, (b) define a parallel `TabsClientApi` interface with the studentId stripped — pick whichever feels cleaner; document the choice.

**File**: `packages/core/src/types/client.ts` (modify) — add `tabs: TabsService;` to the `PraxisClient` interface (required, not optional).

**File**: `packages/client/src/client.ts` (modify) — add to the constructed object:
```typescript
tabs: new TabsClient(transport),
```

**Acceptance Criteria**:
- [ ] `client.tabs.listOpen()` round-trips through IPC.
- [ ] `client.session.list()` round-trips through IPC.
- [ ] No existing client method signatures changed.

---

### Unit 8: `useTabs` hook

**File**: `packages/ui/src/hooks/use-tabs.ts` (new)

The renderer state machine on top of `client.tabs.*`. Manages the open-tabs list, the
active tab, and the actions to open/close/switch/rename.

```typescript
import type { SessionId, TabId, TabSummary } from "@praxis/core/types";

export interface UseTabsResult {
  /** Open tabs, sorted by sortOrder. */
  readonly openTabs: ReadonlyArray<TabSummary>;
  /** The currently focused tab id, or null when no tabs are open. */
  readonly activeTabId: TabId | null;
  readonly loading: boolean;
  readonly error: string | null;

  /** Refresh the open-tabs list from the server. */
  refresh(): Promise<void>;

  /** Open a tab for an existing session and focus it. Returns the new tab. */
  openTab(input: { sessionId: SessionId; courseTitle?: string }): Promise<TabSummary>;

  /** Reopen an archived tab and focus it. */
  reopenTab(tabId: TabId): Promise<TabSummary>;

  /** Close a tab. If it was the active tab, focus shifts to the most-recently-active remaining tab (or null). */
  closeTab(tabId: TabId): Promise<void>;

  /** Switch focus. Calls `tabs.touch` server-side. */
  switchTo(tabId: TabId): Promise<void>;

  /** Rename a tab. Updates local state optimistically; reverts on error. */
  renameTab(tabId: TabId, title: string): Promise<void>;
}

export function useTabs(): UseTabsResult;
```

**Implementation Notes**:
- Loads `client.tabs.listOpen()` on mount; sets `activeTabId` to the tab with the latest `lastSeenAt` (last-focused on previous session).
- Local state: `openTabs: TabSummary[]`, `activeTabId: TabId | null`, `loading`, `error`.
- All mutations (`openTab`, `closeTab`, etc.) update local state optimistically AND call the server; on error revert.
- `closeTab` of the active tab: pick the most-recently-active remaining open tab as the new focus, or null if none.
- Use the existing `useResource` pattern as inspiration; don't shoehorn it (this hook has more state than `useResource` provides).

**Acceptance Criteria**:
- [ ] On mount, loads open tabs and focuses the most-recently-active one.
- [ ] `openTab` adds the new tab and focuses it.
- [ ] `closeTab` removes the tab from `openTabs`; if it was active, focus shifts; if no tabs remain, `activeTabId === null`.
- [ ] `switchTo` calls `tabs.touch` and updates `activeTabId`.
- [ ] `renameTab` is optimistic (UI updates before server replies); reverts on error.

---

### Unit 9: `<TabStrip />` component

**File**: `packages/ui/src/components/tab-strip.tsx` (new)

Editorial-style tab strip. Each tab shows the mode ornament + title; the active tab's
hairline is colored with the mode tint. Right-click for context menu (rename, close).

```typescript
import type { TabId, TabSummary } from "@praxis/core/types";

export interface TabStripProps {
  tabs: ReadonlyArray<TabSummary>;
  activeTabId: TabId | null;
  onSwitch: (tabId: TabId) => void;
  onClose: (tabId: TabId) => void;
  /** Called when the user clicks the "+" affordance. Parent shows the new-tab picker. */
  onNew: () => void;
}

export function TabStrip(props: TabStripProps): JSX.Element;
```

**File**: `packages/ui/src/components/tab-strip.module.css` (new)

```css
.strip {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
  padding: 0 0.5rem;
}

.tab {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.65rem 0.55rem;
  position: relative;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  border-radius: 0;
  /* The active-tab hairline */
}

.tab::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: 1px;
  background: transparent;
  transition: background-color 0.18s ease;
}

.tab:hover:not(.active) {
  color: var(--color-text);
}

.active {
  color: var(--color-text);
}
.active::after {
  background-color: var(--mode-tint, var(--color-accent));
}

.ornament {
  font-family: var(--font-display);
  font-size: 1rem;
  line-height: 1;
  color: var(--mode-tint, var(--color-text-muted));
  transform: translateY(-1px);
}

.title {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 0.92rem;
  letter-spacing: 0;
  text-transform: none;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 16ch;
}

.close {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  padding: 0 0.15rem;
  border-radius: 2px;
  opacity: 0;
  transition: opacity 0.12s ease, color 0.12s ease;
}

.tab:hover .close,
.active .close {
  opacity: 0.6;
}

.close:hover {
  color: var(--color-text);
  opacity: 1;
}

.newButton {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  padding: 0.45rem 0.75rem;
  cursor: pointer;
  border-radius: 0;
  position: relative;
}
.newButton:hover {
  color: var(--color-text);
}
```

**Implementation Notes**:
- Each tab has `style={{ "--mode-tint": getModeMeta(tab.modeId).tint }}` so the existing mode-tint system flows through.
- The "x" close affordance is hidden until hover (or active) to keep the strip quiet.
- Middle-click closes the tab (browser convention). Implement with `onMouseDown` and `e.button === 1`.
- Right-click opens a context menu (rename / close / archive). For v1, a simple `<select>`-style overlay is fine; can elaborate later.
- `onNew` is the "+" tab; parent owns the picker UI.

**Acceptance Criteria**:
- [ ] Renders one `.tab` per element of `tabs` with the mode ornament + title.
- [ ] The active tab has the `.active` class and the colored hairline.
- [ ] Clicking a tab calls `onSwitch(tabId)`.
- [ ] Clicking the close button calls `onClose(tabId)`; click does NOT also call `onSwitch`.
- [ ] Middle-click on a tab calls `onClose(tabId)`.
- [ ] Clicking "+" calls `onNew`.

---

### Unit 10: `<NewTabPicker />` component

**File**: `packages/ui/src/components/new-tab-picker.tsx` (new)

Modal-style picker shown when the user clicks "+". Choose a mode (and optional course).
Wraps `client.session.start` + `client.tabs.open` in one action.

```typescript
export interface NewTabPickerProps {
  onClose: () => void;
  /** Called after the new tab is opened, with its TabId. Parent navigates to it. */
  onOpened: (tabId: TabId) => void;
}

export function NewTabPicker(props: NewTabPickerProps): JSX.Element;
```

**Implementation Notes**:
- UI: same modal pattern as `<UnlockModal />` and `<ClaudeAuthModal />` — backdrop + centered card + escape closes.
- Picker fields:
  - **Mode** — radio group of all modes (teach, bootstrap, quiz, homework, exam, configure)
  - **Course** — optional dropdown of courses (loads via `client.artifacts.courses`); some modes (configure) don't take a course; quiz/homework/exam need an assignment which the picker doesn't handle (defer to entry from the assignment surface — Library or course-detail)
- "Open" button: calls `client.session.start({ modeId, courseId? })` then `client.tabs.open({ sessionId, courseTitle? })`, then `onOpened(tab.id)`.
- Editorial typography for the modal title.

**Acceptance Criteria**:
- [ ] Renders the mode radio group + optional course dropdown.
- [ ] Submitting calls `session.start` then `tabs.open`; on success, `onOpened` fires with the new tab id.
- [ ] Errors render inline (no toast); modal stays open so the user can retry.
- [ ] ESC and backdrop click close.

---

### Unit 11: Refactor `chat.tsx` into ChatRoute shell + ChatTabBody

**File**: `packages/ui/src/routes/chat.tsx` (modify existing — substantial refactor)

Current shape: `ChatRoute` is one big component holding session state, message log, composer, sidebar, etc.

New shape:

```typescript
// chat.tsx — top-level shell. Owns: tab strip, sidebar, picker. Renders the active
// tab's body inside a container.

export function ChatRoute() {
  const { tabId } = useParams({ from: '/chat/$tabId' }); // optional — null when bare /chat
  const { openTabs, activeTabId, openTab, closeTab, switchTo, refresh } = useTabs();
  const [showPicker, setShowPicker] = useState(false);

  // Sync route param ↔ active tab
  useEffect(() => {
    if (tabId && tabId !== activeTabId) switchTo(tabId as TabId);
  }, [tabId]);

  // When activeTabId changes (e.g. closing the active tab), navigate to it
  useEffect(() => {
    if (activeTabId && activeTabId !== tabId) {
      navigate({ to: '/chat/$tabId', params: { tabId: activeTabId } });
    }
  }, [activeTabId]);

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  return (
    <div className={styles.workspace}>
      <ChatSidebar /> {/* documents — unchanged */}
      <div className={styles.main}>
        <TabStrip
          tabs={openTabs}
          activeTabId={activeTabId}
          onSwitch={switchTo}
          onClose={closeTab}
          onNew={() => setShowPicker(true)}
        />
        {activeTab ? (
          <ChatTabBody key={activeTab.id} tab={activeTab} />
        ) : (
          <EmptyTabsState onNew={() => setShowPicker(true)} />
        )}
      </div>
      {showPicker && (
        <NewTabPicker
          onClose={() => setShowPicker(false)}
          onOpened={(newTabId) => {
            setShowPicker(false);
            navigate({ to: '/chat/$tabId', params: { tabId: newTabId } });
          }}
        />
      )}
    </div>
  );
}
```

**File**: `packages/ui/src/components/chat-tab-body.tsx` (new)

Holds the per-tab session state: the existing `ModeHeader`, message log, composer, etc.
Most of the current `ChatRoute` body moves here.

```typescript
export interface ChatTabBodyProps {
  tab: TabSummary;
}

export function ChatTabBody({ tab }: ChatTabBodyProps): JSX.Element;
```

Each `ChatTabBody` owns its own:
- `useStreamedSend(client)` hook (per-tab message log)
- ModeHeader instance
- Auth banner + ClaudeAuthModal (per-tab — auth state can shift between tabs)
- Composer + ComposerVerbs

Switching tabs unmounts one `ChatTabBody` and mounts another (the `key={activeTab.id}` in the shell). Per-tab in-memory message state is lost on switch — the next time the user comes back to a tab they see a fresh chat. **This is acceptable for v1** — episodic events are persisted server-side, so when Phase 14.x adds "restore message history on tab focus" it's a `useEffect` that loads from `client.session.list`/episodic. Not in v1 scope; flag in the design as a future polish.

Actually — that's not great UX. Let me rethink.

**Decision: ChatTabBody preserves message state across tab switches.**

Option (a): use `key={activeTab.id}` + lose state. Simplest.
Option (b): keep all `ChatTabBody` instances mounted but only show the active one (CSS visibility). Preserves React state.
Option (c): use a single `ChatTabBody` and pass `tab` as a prop; manage per-tab state in a parent reducer keyed by tabId.

**Pick (b).** Rationale: simplest preservation, no message-state shoehorning into a global store. Mount all open `ChatTabBody` components inside the workspace container; show only the active one via `display: none` on the rest. Memory cost is small (text + React state); the alternative of unmounting/remounting destroys streaming connections in flight.

Updated:

```tsx
{openTabs.map((t) => (
  <div
    key={t.id}
    style={{ display: t.id === activeTabId ? 'block' : 'none' }}
    className={styles.tabBodyMount}
  >
    <ChatTabBody tab={t} />
  </div>
))}
{openTabs.length === 0 && <EmptyTabsState onNew={() => setShowPicker(true)} />}
```

**File**: `packages/ui/src/components/empty-tabs-state.tsx` (new)

Simple editorial empty state shown when there are no open tabs.

```tsx
export function EmptyTabsState({ onNew }: { onNew: () => void }) {
  return (
    <div className={styles.empty}>
      <span className={styles.ornament}>·</span>
      <p className={styles.line}>{COPY.empty.tabs}</p>
      <button onClick={onNew}>Open a session</button>
    </div>
  );
}
```

Add `tabs: "No tabs open. Choose a session from your library, or open a new one."` to `COPY.empty`.

**Implementation Notes**:
- The `useStreamedSend` hook today is tied to a single `PraxisClient`; with multiple `ChatTabBody` instances, each calls `useStreamedSend(client)` independently. Verify the hook doesn't share state across instances (it's currently `useState`-based, so each instance is isolated — good).
- The auth banner + ClaudeAuthModal stays per-tab. If the user is signed out, every tab body shows the banner. Acceptable.
- The documents sidebar stays in the workspace shell (not per-tab). It's global state.

**Acceptance Criteria**:
- [ ] `/chat` (no tabId) shows `<EmptyTabsState />` when no open tabs, or auto-navigates to the most-recently-active tab if any.
- [ ] `/chat/$tabId` shows the ChatTabBody for that tab; if the tabId doesn't exist or is closed, redirect to bare `/chat`.
- [ ] Switching tabs preserves the message log of each tab (verified by sending a message in tab A, switching to B, switching back, message still there).
- [ ] Closing the active tab navigates to the next-most-recent open tab (or bare `/chat` if none).
- [ ] Documents sidebar remains visible across all tabs.

---

### Unit 12: Library route + data hook

**File**: `packages/ui/src/hooks/use-library.ts` (new)

Aggregates the four data sources:

```typescript
export interface LibraryData {
  readonly courses: ReadonlyArray<CourseSummary>;
  readonly packs: ReadonlyArray<PackSummaryClient>;
  readonly documents: ReadonlyArray<DocumentMeta>;
  readonly recentSessions: ReadonlyArray<SessionSummary>;
}

export interface UseLibraryResult {
  readonly data: LibraryData | undefined;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
}

export function useLibrary(): UseLibraryResult;
```

Loads all four in parallel via `Promise.all`. Failure of one doesn't block the others —
each section has its own loading/error state internally; `useLibrary` exposes the worst.

**File**: `packages/ui/src/routes/library.tsx` (new)

Route component. Uses `<RouteHeader />` (Phase 13) at top + four section components.

```tsx
export function LibraryRoute() {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useLibrary();
  const client = usePraxisClient();
  const { openTab } = useTabs();

  const handleOpenInTab = async (input: { sessionId: SessionId; courseTitle?: string }) => {
    const tab = await openTab(input);
    navigate({ to: '/chat/$tabId', params: { tabId: tab.id } });
  };

  return (
    <div className={styles.layout}>
      <RouteHeader
        ornament="⁂"
        kicker="LIBRARY"
        title="your library"
        deck="what you have to work with"
      />
      <div className={styles.sections}>
        <CoursesSection courses={data?.courses} loading={loading} onOpenInTab={handleOpenInTab} />
        <PacksSection packs={data?.packs} loading={loading} onUsePack={...} />
        <DocumentsSection documents={data?.documents} loading={loading} />
        <RecentSessionsSection sessions={data?.recentSessions} loading={loading} onOpenInTab={handleOpenInTab} />
      </div>
    </div>
  );
}
```

**Section components** (one file each in `packages/ui/src/components/library/`):
- `courses-section.tsx` — list of courses in progress; "Continue" CTA opens a teach tab via the course
- `packs-section.tsx` — list of available packs with "Use this pack" — calls `course.use_canonical_pack` (existing tool path) then opens a teach tab on the new course
- `documents-section.tsx` — list of documents; "+ Add" opens existing ingestion flow
- `recent-sessions-section.tsx` — list of recent sessions (open + closed) with deck = first user message; clicking reopens the tab

Each section uses the editorial typography system (kicker + ornament + listings as
table-of-contents items, NOT cards).

**Implementation Notes**:
- All four sections render NULL or an editorial empty-state when their slice is empty (use the COPY module).
- `handleOpenInTab` lives in the route, not in each section, so the routing effect is consistent.
- "Use this pack" needs to call the `course.use_canonical_pack` tool — but the tool runs inside an agent session. v1 can take a shortcut: call `client.packs.import(packId)` directly (which already creates a course via `BootstrapServiceImpl.createCourseFromPack`), bypassing the agent. That gives one-click pack-to-course without bootstrap chat. **Implementer should verify**: read `packages/curriculum/src/packs/import-service.ts` line ~144 for the existing `createCourseFromPack` flow. If it produces a course directly, wire it; if not, scope the v1 "Use this pack" to opening a bootstrap tab pre-populated with "use the pack <packId>" so the agent does the rest.

**Acceptance Criteria**:
- [ ] `/library` renders the four sections with live data.
- [ ] Each section shows an editorial empty state when its slice is empty.
- [ ] Clicking "Continue" on a course opens a teach tab on that course and navigates to `/chat/$tabId`.
- [ ] Clicking "Use this pack" creates a course from the pack and opens a teach tab.
- [ ] Clicking a recent session reopens its tab (or focuses an existing open tab for that session).

---

### Unit 13: Router updates + redirects

**File**: `packages/ui/src/router.tsx` (modify existing)

Changes:

1. **Add `/library` route** pointing to `<LibraryRoute />`.
2. **Change `/` from chat to library** — root route's component is library.
3. **Add `/chat` and `/chat/$tabId` routes** pointing to the chat workspace.
4. **Redirect `/courses` → `/library`** and **`/packs` → `/library`** using TanStack Router's `redirect` loader.

```typescript
const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LibraryRoute,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat",
  component: ChatRoute,
});

const chatTabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$tabId",
  component: ChatRoute,
});

const coursesRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses",
  beforeLoad: () => { throw redirect({ to: "/library" }); },
});

const packsRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/packs",
  beforeLoad: () => { throw redirect({ to: "/library" }); },
});

// course-detail and course-map keep their /courses/$courseId paths — verify TanStack
// Router doesn't conflict with the /courses redirect (a redirect on the parent
// shouldn't intercept children). If it does, restructure: move course-detail to
// /library/courses/$courseId.
```

**Implementation Notes**:
- The /courses redirect is at the LEAF level — it shouldn't intercept `/courses/$courseId` because TanStack matches more-specific routes first. Test this; if it conflicts, change the redirect path to `/courses/$` (only matches bare /courses).
- The chat route component renders the same thing whether or not `tabId` is in the path; only the tab-sync effect cares.

**Acceptance Criteria**:
- [ ] Visiting `/` shows the Library, NOT chat.
- [ ] Visiting `/chat` shows the chat workspace; if no open tabs, shows EmptyTabsState.
- [ ] Visiting `/chat/$tabId` focuses that tab (or redirects to `/chat` if invalid).
- [ ] Visiting `/courses` redirects to `/library`.
- [ ] Visiting `/packs` redirects to `/library`.
- [ ] Visiting `/courses/$courseId` still shows the course detail page.

---

### Unit 14: Update `<Nav />` for new IA

**File**: `packages/ui/src/components/nav.tsx` (modify existing)

Replace the current "Chat / Courses / Packs / Workspace / Configure / Settings" link list with:
- **Library** (`/`) — primary nav, first link
- **Chat** (`/chat`) — second link
- **Workspace** (`/workspace`) — keeps its position
- **Configure** (`/configure`) — keeps its position (lock-gated)
- **Settings** (`/settings`) — keeps its position
- Drop the standalone "Courses" and "Packs" links (they redirect to /library now).

Keep the editorial language — uppercase mono labels, hairline-underlined hover.

**Acceptance Criteria**:
- [ ] Nav lists exactly these links: Library, Chat, Workspace, Configure, Settings.
- [ ] No "Courses" or "Packs" links remain.
- [ ] Active state highlights via the existing `activeProps` pattern.

---

### Unit 15: Update entry-point affordances throughout the app

Anywhere in the UI where the user could previously start a session and land in the
default `/chat` (auto-mounting) flow, the affordance now needs to:
1. Call `client.session.start(...)` to get a sessionId
2. Call `client.tabs.open({ sessionId, courseTitle? })` to open a tab
3. Navigate to `/chat/$tabId`

Files to update:

| File | Affordance | Action |
|---|---|---|
| `routes/course-detail.tsx` | "Start session" button | Replace `navigate({ to: "/", search: { sessionId } })` with the open-tab + navigate-to-tabId flow |
| `routes/courses.tsx` | (route is going away — handled by redirect) | n/a |
| `components/library/courses-section.tsx` | "Continue" | Same flow |
| `components/library/packs-section.tsx` | "Use this pack" | Pack import → course → open teach tab |
| `components/library/recent-sessions-section.tsx` | Click to reopen | Find existing tab for sessionId or open new one + navigate |
| Anywhere else that calls `client.session.start` | | Same flow |

A small helper makes this clean:

**File**: `packages/ui/src/lib/open-session-in-tab.ts` (new)

```typescript
export async function openSessionInTab(opts: {
  client: PraxisClient;
  navigate: NavigateFn;
  startOpts: { modeId: string; courseId?: CourseId; assignmentId?: AssignmentId };
  courseTitle?: string;
}): Promise<TabId> {
  const handle = await opts.client.session.start(opts.startOpts);
  const tab = await opts.client.tabs.open({
    sessionId: handle.sessionId,
    ...(opts.courseTitle !== undefined && { courseTitle: opts.courseTitle }),
  });
  await opts.navigate({ to: "/chat/$tabId", params: { tabId: tab.id } });
  return tab.id;
}
```

Use this everywhere instead of inlining the three steps.

**Acceptance Criteria**:
- [ ] Every entry point that used to land in `/` now lands in `/chat/$tabId` with a fresh tab.
- [ ] Course-detail "Start session" creates a tab and switches to it.
- [ ] Library "Continue" / "Use this pack" / "Reopen recent session" all use the helper.

---

## Implementation Order

Backend before UI; foundational before consuming. Each phase is independently shippable.

1. **Unit 1** — `tabs` table schema + migration.
2. **Unit 2** — `TabsService` interface + `TabSummary` types in core.
3. **Unit 3** — `TabsServiceImpl`.
4. **Unit 5** — `SessionService.list()` extension (independent of Tabs; could land before).
5. **Unit 4** — Wire `TabsServiceImpl` into Services + buildServices.
6. **Unit 6** — IPC handlers for tabs + session.list.
7. **Unit 7** — `TabsClient` + `PraxisClient` wiring.
8. **Unit 13** — Router updates (add /library + /chat routes; do NOT remove old route components yet — keep them rendering until Library is built and section components exist).
9. **Unit 8** — `useTabs` hook.
10. **Unit 9** — `<TabStrip />`.
11. **Unit 10** — `<NewTabPicker />`.
12. **Unit 11** — Refactor `chat.tsx` into ChatRoute shell + ChatTabBody + EmptyTabsState.
13. **Unit 12** — `<LibraryRoute />` + `useLibrary` + section components.
14. **Unit 15** — Migrate entry-point affordances to use the openSessionInTab helper.
15. **Unit 14** — Update `<Nav />`. Land last so navigation reflects the final IA.

Stop points:
- After **Unit 7**: backend complete; you can manually exercise tabs CRUD via main-process scripts.
- After **Unit 11**: chat workspace works end-to-end with tabs (Library not yet built; / still shows old chat for now).
- After **Unit 12**: Library is real; you can browse and open tabs from it.
- After **Unit 14**: everything ships.

---

## Testing

### Unit 1 (schema) — verify migration applies and the `tabs` table exists
- After `pnpm db:migrate`, `pnpm db:show` lists `tabs`.

### Unit 3 (TabsServiceImpl) — `packages/core/src/services/__tests__/tabs-service.test.ts`
- `useTempDb` for an isolated SQLite instance.
- `open` then `listOpen` returns the tab.
- `close` then `listOpen` does NOT return it; `list({ includeClosed: true })` does.
- `reopen` clears `closedAt` and pushes sortOrder to the end.
- `touch` updates `lastSeenAt`.
- `rename` updates `title`.
- `generateTitle` produces stable strings for the documented input matrix.
- Two students' tabs are isolated (don't leak across).

### Unit 5 (SessionService.list) — extend `packages/core/src/services/__tests__/session-service.test.ts`
- After starting 3 sessions, `list()` returns 3, sorted by startedAt desc.
- After ending one, `list({ includeEnded: false })` returns 2.
- `firstUserMessage` is set when the session has user messages; absent otherwise.

### Unit 7 (TabsClient) — extend `packages/client/src/__tests__/client.test.ts`
- `client.tabs.listOpen()` invokes `praxis.tabs.listOpen`.
- `client.tabs.open(...)` invokes `praxis.tabs.open` with the args.
- `client.session.list()` invokes `praxis.session.list`.

### Unit 8 (useTabs) — `packages/ui/src/__tests__/use-tabs.test.tsx`
- Mounts and loads open tabs; sets active to most-recently-active.
- `openTab` adds + focuses.
- `closeTab` of active shifts focus.
- `switchTo` calls `tabs.touch`.
- Optimistic rename reverts on error.

### Unit 9 (TabStrip) — `packages/ui/src/__tests__/tab-strip.test.tsx`
- Renders one tab per element with mode ornament + title.
- Clicking a tab fires `onSwitch`.
- Clicking close fires `onClose` and NOT `onSwitch`.
- Middle-click fires `onClose`.
- "+" fires `onNew`.

### Unit 10 (NewTabPicker) — `packages/ui/src/__tests__/new-tab-picker.test.tsx`
- Renders mode radio + course dropdown.
- Submitting calls `session.start` then `tabs.open`; on success `onOpened` fires.
- Errors render inline; modal stays open.

### Unit 11 (ChatRoute refactor) — extend `packages/ui/src/__tests__/chat-route.test.tsx`
- Tab-aware: rendering with tabId param shows that tab's body.
- Switching tabs preserves message log (mount, send, switch away, switch back).
- No tabs → EmptyTabsState renders.
- Clicking "Open a session" in EmptyTabsState mounts NewTabPicker.

### Unit 12 (LibraryRoute) — `packages/ui/src/__tests__/library-route.test.tsx`
- Renders four sections with editorial headers.
- Empty slices show editorial copy.
- "Continue" calls openSessionInTab.
- "Use this pack" calls the pack import + opens a teach tab.

### Unit 13 (router) — `packages/ui/src/__tests__/router.test.tsx` (new) or in route-specific tests
- `/` shows Library.
- `/courses` redirects to `/library`.
- `/packs` redirects to `/library`.
- `/courses/abc` still shows course detail.

### Unit 15 (openSessionInTab helper) — `packages/ui/src/__tests__/open-session-in-tab.test.tsx`
- Calls `session.start` → `tabs.open` → `navigate` in order.
- Returns the new tabId.

---

## Verification Checklist

```bash
cd /home/nathan/dev/praxis
pnpm db:migrate   # applies the new tabs migration
pnpm --filter @praxis/memory test
pnpm --filter @praxis/core test
pnpm --filter @praxis/client test
pnpm --filter @praxis/ui test
pnpm --filter @praxis/desktop typecheck
npx tsgo --noEmit
```

Manual smoke (after Unit 14):

1. `pnpm dev` → app opens at `/` → Library renders with all four sections.
2. Click "Continue" on a course → chat opens at `/chat/$tabId` with a teach tab.
3. Tab strip shows the tab with the mode ornament and title.
4. Click "+" → NewTabPicker opens; pick "bootstrap" + a course → new tab opens beside the first.
5. Switch between tabs — message logs are preserved per-tab.
6. Close a tab via the X — focus shifts to the other tab.
7. Restart the app — both tabs are restored, last-focused one is active.
8. Visit `/courses` → redirects to `/library`.
9. Visit `/courses/<id>` → still shows course detail.
10. Library "Recent sessions" section shows the closed sessions; click to reopen.

---

## Risks and Open Questions

1. **Cascade-delete semantics on session delete.** The `tabs.session_id` foreign key uses
   `ON DELETE CASCADE` — if a session row is hard-deleted, its tab disappears. Today nothing
   hard-deletes sessions; future Memory-export-then-delete features (Phase 17?) will. Worth
   noting so they don't break tabs unexpectedly.

2. **Tab title regeneration after course rename.** Tab titles are denormalized at open
   time. If the user renames a course, existing tabs keep the old title. Acceptable for v1;
   add `tabs.regenerateTitle(tabId)` later if it's annoying.

3. **All ChatTabBody instances mounted at once (display: none for inactive).** Memory
   pressure with many tabs. Each instance holds its message log + active EngineSession in
   the renderer. With 5 tabs of 100 messages each, this is fine (~few MB). With 50 tabs of
   1000 messages, less so. Soft cap of ~10 open tabs is implicit; revisit if users open
   way more.

4. **Streaming continues in inactive tabs.** If you start a chat in tab A, switch to tab B,
   tab A's stream continues filling its message log. The student returns to a finished
   reply. **This is good** — matches browser-tab expectations. Verify the `useStreamedSend`
   hook keeps streaming even when the tab body is `display: none`. (CSS hidden does NOT
   pause React state updates.)

5. **Multi-instance auth modal.** If Claude is signed out, every tab body shows the auth
   banner. If the user signs in via tab A's modal, tabs B and C still show their banners
   until they retry. **Acceptable but not great**. v1 accepts; Phase 14.x could add a
   global auth-state listener that all banners watch.

6. **The /courses redirect could swallow /courses/$courseId.** TanStack Router prefers
   more-specific matches but verify. If it doesn't, restructure the redirect (e.g. only
   match `/courses` exactly with no children pattern).

7. **Pack import in Library skips the bootstrap conversation.** "Use this pack" creates
   a course directly via `BootstrapServiceImpl.createCourseFromPack` — no agent involvement.
   This is faster but loses the conversational tailoring. The bootstrap-chat path remains
   available via "+" → bootstrap mode. Document the trade-off in the Library section's
   help text.
