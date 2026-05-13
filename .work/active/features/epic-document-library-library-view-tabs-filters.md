---
id: epic-document-library-library-view-tabs-filters
kind: feature
stage: implementing
tags: [ui, documents]
parent: epic-document-library
depends_on: [epic-document-library-scopes-primitive]
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Library route with scope tabs and filters

## Brief

Today the global "all my documents" surface — to the extent it exists —
is a flat list. Once a user has more than a handful of attached documents
spanning multiple courses and bootstrap sessions, the list becomes
useless: there's no way to ask "show me docs from THIS course" or "show
me docs that were attached during THIS bootstrap session but never
promoted" without manually scanning.

This feature promotes the global doc view into a **library route** with
tabs that pivot by scope: "All," "This course" (when in a course
context), "This session" (when in a bootstrap context), "Orphaned" (docs
with no scope rows, or only rows pointing at deleted scopes), and
filters within each tab (file type, ingestion source, date range). Tabs
anchor the common pivots; filters refine within a tab. The tabs and
filters all read through the `document_scopes` primitive — this feature
is the realization of "scope-aware navigation" at the global level,
complementing the scope-aware sidebar that ships in
`viewer-tab-scoped-sidebar`.

## Epic context

- Parent epic: `epic-document-library`
- Position in epic: consumer of the new scoping primitive; wave 2
  alongside `bootstrap-session-scoped-attachment` and
  `viewer-tab-scoped-sidebar`.

## Foundation references

- `docs/ARCHITECTURE.md` "Document scoping" section + "Student surface"

## Anchors

- Today's library entry point — `packages/ui/src/components/add-document-button.tsx`
  (mounted in current library surface)
- TanStack Router routes — `packages/ui/src/routes/` (add `/library` or
  similar; coordinate with existing route conventions)
- Document scopes service (new) —
  `DocumentScopesServiceImpl` from the primitive feature; needs query
  helpers like `listAll`, `listByScope`, `listOrphaned`
- Editorial primitives — `RouteHeader`, `LibrarySection`, `EmptyState`,
  `LoadingState` (per `editorial-ui-primitives` pattern)

## Design notes for feature-design

- Tab definition: which scope tabs are always visible, which are
  context-dependent ("This course" only when a course is active)?
- "Orphaned" definition (resolved): a document surfaces under Orphaned
  if it has **no `document_scopes` rows at all**, OR all its scope rows
  point at scopes that are inactive (e.g., a bootstrap session that was
  never confirmed and has been abandoned). Feature-design pass picks the
  detection mechanism — flag on `sessions` for abandoned/unconfirmed
  state, or a derived check via a join against the parent. The literal
  database-only definition ("no rows at all") is too strict because
  abandoned-bootstrap docs would silently disappear from the library;
  the user explicitly wants them findable under Orphaned (see
  `bootstrap-session-scoped-attachment` for the matching GC decision).
- Filters: file type (from `documents.mimeType`), ingestion source
  (`source` column on scope row), date range (`attached_at` or
  `documents.ingestedAt`?).
- Bulk affordances (resolved): **out of scope** for v1. Library v1 =
  tabs + filters + open-in-viewer. No multi-select rescope/move/detach.
  When actual need surfaces, scope a follow-up story for whichever
  bulk op users ask for first.
- Interaction with the document viewer tab from
  `viewer-tab-scoped-sidebar` — clicking a row should `openDocumentInTab`
  using the same helper.

## Architectural choice

**Extend `<DocumentsSection>` (in the existing `/library` route) with scope tabs + filter controls; backend gets new service queries.** The `/library` route already exists; this feature redesigns the documents section's content surface, not the route itself. Tabs and filters are client-side state; the data fetches happen via the existing `documentScopes` client with new helper methods on the server.

Two alternatives rejected:
- *Brand-new `/library/documents` route.* Adds nav cost for a feature that's a section-level redesign. The existing `/library` already aggregates courses, packs, sessions, and documents — keeping documents in the same route honors the user's "my stuff" mental model.
- *Pure client-side filtering of `documents.list()`.* Works for filters but not for the Orphaned tab (needs a JOIN against scopes table) or the "This course/session" tabs (needs scope-filtered listing). Server-side queries via `documentScopes` keep the contract clean.

## Design decisions (resolved by autopilot)

- **Tab set**:
  - **All** — always visible. Lists every doc in the student's library (uses `documents.list()`).
  - **This course** — visible only when a `courseId` is in route context. Uses `documentScopes.listForScopeDetailed({ kind: "course", id })`.
  - **This session** — visible only when an active bootstrap session is in context (via a new client-side hook that derives current bootstrap-session from open tabs). Uses `documentScopes.listForScopeDetailed({ kind: "session", id })`.
  - **Orphaned** — always visible. Uses a new server method `documentScopes.listOrphaned(studentId)` (defined below).
- **Orphaned definition (v1)**: a document is orphaned when EITHER (a) it has zero `document_scopes` rows, OR (b) all its scope rows point at non-existent parent entities (course deleted, session deleted). Implementation: a single SQL query with LEFT JOINs that returns documents where every related scope row's parent is missing. No `sessions.abandoned_at` flag for v1 — keep the definition database-only and simple. If a "never confirmed bootstrap" surface is wanted later, that's a v2 extension.
- **Filters (within a tab)**: file type (`documents.mimeType`), ingestion source (`document_scopes.source` — bootstrap/manual/ingestion), date range (`document_scopes.attachedAt` for scope-attached views, `documents.ingestedAt` for the All tab). Filters are AND-composed.
- **Filter persistence**: filters are LIVE state, not URL-encoded. Switching tabs RESETS filters. Switching back doesn't restore. v1 simplicity over deep-linking.
- **Bulk affordances (v1)**: NONE. Read-only library view with single-doc-click (opens preview/viewer per existing behavior).
- **Click-to-open behavior**: in this feature, click opens the existing modal preview (today's behavior). When `viewer-tab-scoped-sidebar` lands (sibling wave-2 feature, no dep order between us), it adds `openDocumentInTab`; this feature's click handler should call a thin helper that falls back to modal-preview if the tab type isn't registered. The wave-2 sibling extends the helper without breaking this feature.
- **Empty states**: each tab has its own `EmptyState` via the `editorial-ui-primitives` pattern. "No documents in this course yet"; "This session hasn't attached any documents"; "No orphaned documents — your library is tidy"; "Your library is empty".
- **Loading**: per-tab `useResource(loader)` (per `use-resource-hook` pattern). Tab switch triggers a fresh load (or hits the resource cache if recently fetched).
- **Server-side new query: `documentScopes.listOrphaned(studentId)`**: ADD method to `DocumentScopesService`. Returns documents owned by the student whose scope set is empty or all-dangling. SQL via a LEFT JOIN against `documents` joined to `document_scopes` aggregating per document; either zero scopes OR all scopes have no matching parent in `courses`/`sessions`.

## Anchors (verified)

- `/library` route — `packages/ui/src/routes/library.tsx` (exists)
- Documents section — `packages/ui/src/components/library/documents-section.tsx` (target of redesign)
- DocumentScopes client — `packages/client/src/services/document-scopes-client.ts`
- DocumentScopes service — `packages/core/src/services/document-scopes-service.ts` (new method goes here)
- Editorial primitives — `RouteHeader`, `LibrarySection`, `EmptyState`, `LoadingState` per `editorial-ui-primitives` pattern
- `useResource` hook — `packages/ui/src/hooks/use-resource.ts`
- Existing client method needed: `client.documents.list()` (already exists)

## Implementation Units

Single-stride. The work is cohesive: one new server method, one redesigned section component, tab/filter UI primitives. ~6 files.

### Unit 1: `DocumentScopesService.listOrphaned` server method

**File**: `packages/core/src/services/document-scopes-service.ts`

Add to interface (also in `packages/core/src/types/tool.ts`):

```typescript
/**
 * Documents owned by the student that are effectively orphaned:
 * either no scope rows at all, or all scope rows point at parents that
 * no longer exist (deleted course / session). Returns enriched rows
 * suitable for direct library rendering.
 */
listOrphaned(studentId: StudentId): Promise<DocumentScopeAttachment[]>;
```

Implementation: a single SQL using `documents LEFT JOIN document_scopes LEFT JOIN courses LEFT JOIN sessions` grouped by document. Document is orphaned when, for every scope row joined to that document, the corresponding course/session is missing — OR there are no scope rows at all.

```typescript
async listOrphaned(studentId: StudentId): Promise<DocumentScopeAttachment[]> {
  // Pseudocode SQL via Drizzle:
  // SELECT d.*, latest scope row metadata
  // FROM documents d
  // WHERE d.student_id = ?
  //   AND NOT EXISTS (
  //     SELECT 1 FROM document_scopes ds
  //     LEFT JOIN courses c ON ds.scope_kind = 'course' AND ds.scope_id = c.id
  //     LEFT JOIN sessions s ON ds.scope_kind = 'session' AND ds.scope_id = s.id
  //     WHERE ds.document_id = d.id
  //       AND (
  //         (ds.scope_kind = 'course' AND c.id IS NOT NULL)
  //         OR (ds.scope_kind = 'session' AND s.id IS NOT NULL)
  //       )
  //   )
  // For the row, return source/attachedAt from the most-recent scope row (or undefined).
}
```

`DocumentScopeAttachment` already includes the enriched fields; for orphaned docs with NO scope rows, `source` and `attachedAt` may be derived from the document's own `ingestedAt`. Decision: if no scope row exists, return `source: "ingestion"` and `attachedAt: document.ingestedAt`. If scope rows exist but all are dangling, return the most-recent dangling row's `source` and `attachedAt`.

**Acceptance Criteria**:
- [ ] Service method exposed via interface and client (new method `documentScopes.listOrphaned()`).
- [ ] Returns docs with zero scope rows.
- [ ] Returns docs whose only scope rows reference deleted courses/sessions.
- [ ] Does NOT return docs that have at least one active scope row.

---

### Unit 2: IPC + client method

**Files**:
- `packages/desktop/electron/main/document-scopes-channel.ts` — register `praxis.documentScopes.listOrphaned`.
- `packages/client/src/services/document-scopes-client.ts` — add `listOrphaned(studentId)` method.
- `packages/core/src/types/client.ts` — add to `DocumentScopesClientApi`.

**Acceptance Criteria**:
- [ ] IPC roundtrip works.
- [ ] Client method typed and exported.

---

### Unit 3: `DocumentsLibrarySurface` — tab strip

**File**: `packages/ui/src/components/library/documents-section.tsx` (rewrite or extend in-place)

Top-level component renders:
- `<RouteHeader>` with section title (existing pattern)
- Tab strip (4 tabs max; 2-3 visible depending on context)
- Filter bar (collapsible row of selects)
- Document grid (existing card layout, fed from active tab's data)

```typescript
type LibraryTab = "all" | "course" | "session" | "orphaned";

interface FilterState {
  mimeType: string | "any";
  source: DocumentScopeSource | "any";
  dateRange: "any" | "last_7d" | "last_30d" | "last_year";
}

export function DocumentsLibrarySurface(): JSX.Element {
  const ctx = useRouteContext();  // existing — derives current courseId, etc.
  const activeBootstrapSessionId = useActiveBootstrapSession();  // new tiny helper
  const [tab, setTab] = useState<LibraryTab>("all");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const visibleTabs: LibraryTab[] = useMemo(() => {
    const tabs: LibraryTab[] = ["all"];
    if (ctx.courseId) tabs.push("course");
    if (activeBootstrapSessionId) tabs.push("session");
    tabs.push("orphaned");
    return tabs;
  }, [ctx.courseId, activeBootstrapSessionId]);

  // On context change (courseId or session unmounts), reset tab to "all" if current tab disappears.
  useEffect(() => {
    if (!visibleTabs.includes(tab)) setTab("all");
  }, [visibleTabs, tab]);

  // Resource loader per tab:
  const documents = useTabDocuments(tab, ctx.courseId, activeBootstrapSessionId);
  // Returns DocumentScopeAttachment[] (or equivalent).

  const filtered = useMemo(
    () => applyFilters(documents.data ?? [], filters),
    [documents.data, filters],
  );

  return (
    <LibrarySection title="Documents">
      <TabStrip tabs={visibleTabs} active={tab} onChange={setTab} />
      <FilterBar filters={filters} onChange={setFilters} />
      {documents.loading && <LoadingState />}
      {documents.error && <ErrorMessage error={documents.error} />}
      {filtered.length === 0 ? <EmptyState message={emptyMessageFor(tab)} /> : (
        <DocumentGrid documents={filtered} onClick={(d) => openDocumentSafe(d)} />
      )}
    </LibrarySection>
  );
}
```

`useTabDocuments` is a small dispatcher:
- `"all"` → `client.documents.list()`
- `"course"` → `client.documentScopes.listForScopeDetailed({ kind: "course", id: courseId })`
- `"session"` → `client.documentScopes.listForScopeDetailed({ kind: "session", id: sessionId })`
- `"orphaned"` → `client.documentScopes.listOrphaned(studentId)`

**Acceptance Criteria**:
- [ ] Tab strip renders the right tabs for the current context.
- [ ] Switching tabs triggers a new data load.
- [ ] Tab switch resets filters.
- [ ] Empty state per tab uses appropriate COPY.

---

### Unit 4: Filter bar

**File**: same as Unit 3 (or split as `documents-filter-bar.tsx`)

Three filter selects: mimeType (derived from distinct mimeTypes in the current tab's data), source (constant enum), date range (preset windows). `applyFilters` is a pure function that filters the raw list. Filter changes don't trigger refetch — they're client-side projections.

**Acceptance Criteria**:
- [ ] Each filter narrows the visible doc list.
- [ ] Filters AND-compose.
- [ ] mimeType options are derived from the current tab's data (not hardcoded).

---

### Unit 5: `useActiveBootstrapSession` helper

**File**: `packages/ui/src/hooks/use-active-bootstrap-session.ts` (new)

Derives the active bootstrap-session id from open tabs (looks for a tab with `modeId === "bootstrap"`). Returns the first match, or `null`.

```typescript
export function useActiveBootstrapSession(): SessionId | null {
  const tabs = useTabs();  // existing
  return tabs.find((t) => t.modeId === "bootstrap")?.sessionId ?? null;
}
```

**Acceptance Criteria**:
- [ ] Returns the open bootstrap session's id when one exists.
- [ ] Returns `null` when no bootstrap tab is open.

---

### Unit 6: Click-to-open helper

**File**: `packages/ui/src/lib/open-document.ts` (new tiny helper; downstream `viewer-tab-scoped-sidebar` extends)

```typescript
export function openDocumentSafe(doc: DocumentScopeAttachment): void {
  // v1: opens the existing modal preview (today's behavior).
  // viewer-tab-scoped-sidebar replaces this with openDocumentInTab.
  openModalPreview(doc.documentId);
}
```

The viewer-tab feature replaces the body of this helper. v1 ships modal-preview. No behavior regression vs today.

**Acceptance Criteria**:
- [ ] Click on a doc card opens the existing modal preview.
- [ ] When `viewer-tab-scoped-sidebar` lands and replaces this helper, clicking opens a tab instead. (Forward-compat — no change to this feature.)

---

### Unit 7: Tests

**Files**:
- `packages/core/src/services/__tests__/document-scopes-service.test.ts` — extend with `listOrphaned` cases: zero scope rows; all dangling; mixed (some active + some dangling → not orphaned).
- `packages/ui/src/__tests__/library-route.test.tsx` — extend with tab switching, filter application, conditional tab visibility (course context vs not).
- `packages/ui/src/hooks/__tests__/use-active-bootstrap-session.test.tsx` — new tiny test.

**Acceptance Criteria**:
- [ ] All new tests pass.
- [ ] Existing library-route tests pass.

---

## Implementation Order

1. Unit 1 (`listOrphaned` service method)
2. Unit 2 (IPC + client wiring)
3. Unit 5 (`useActiveBootstrapSession` helper)
4. Unit 3 (tab strip + main surface) — mostly orchestrates units 1, 2, 5
5. Unit 4 (filter bar)
6. Unit 6 (click-to-open helper)
7. Unit 7 (tests, run continuously)

## Testing

Covered by Unit 7. Key invariants:
- Orphaned query correctly handles zero/dangling/mixed scope sets.
- Tab visibility tracks route + tab context correctly.
- Filters compose AND-style without server round-trips.

## Risks

1. **Orphaned-query SQL complexity** (low-medium). The LEFT JOIN + NOT EXISTS pattern can be expressed cleanly in Drizzle but needs careful testing. The temp-db helper supports it; the orphaned-detection test in Unit 7 is the canonical proof.

2. **"Active bootstrap session" detection** (low). Relies on the tabs registry having `modeId` on each tab. Verify during impl (looks correct based on `tabs-service.ts` generateTitle which already uses `modeId`).

3. **Filter UX with empty results** (low). If filters narrow to zero docs, the empty state should clarify "no docs match these filters" vs "no docs in this tab" — the rendered message distinguishes them.

4. **Forward compat with viewer-tab-scoped-sidebar** (low). The `openDocumentSafe` helper is a single function whose body changes when the sibling feature lands. Single-call-site adoption (only this feature calls it for v1).

## Notes for downstream

- `viewer-tab-scoped-sidebar` (sibling wave-2) replaces `openDocumentSafe`'s body with `openDocumentInTab`. No coordination needed beyond not modifying the helper's signature.
- A future "promote to course" bulk action would be a follow-up story tagged with the parent epic; the library route is the natural host.
