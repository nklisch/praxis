---
id: epic-document-library-viewer-tab-scoped-sidebar
kind: feature
stage: done
tags: [ui, documents, tutor-ux]
parent: epic-document-library
depends_on: [epic-document-library-scopes-primitive]
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Document viewer tab + scope-aware sidebar

## Brief

Today there's no real document-viewing surface — documents flow through
ingestion, get listed in a sidebar, and the user can preview them only via
modal-ish affordances. The sidebar shows the same doc list regardless of
where the user is in the app. So reading a long PDF or revisiting an
attached lecture is a poor experience.

This feature adds a dedicated **document viewer tab kind** alongside the
existing tab types (`quiz`, `homework`, `exam`, `bootstrap`,
`study_skills`) — see `packages/ui/src/hooks/use-tabs.ts`. Opening a
document opens it as a tab with a real viewer (PDF, plain text, markdown,
HTML at minimum; PPTX/DOCX punt to a structured-render or page-raster
fallback that's already produced during ingestion). The viewer reads
chunk/page data via the existing `documents` service.

Pair this with a **scope-aware sidebar**: instead of always listing the
global document set, the sidebar derives a scope from the active context
— course route → course scope, bootstrap tab → bootstrap-session scope,
no active scope → global library. The sidebar queries
`document_scopes` via the new primitive and renders only the docs visible
in the active scope.

## Epic context

- Parent epic: `epic-document-library`
- Position in epic: consumer of the new scoping primitive; wave 2
  alongside `bootstrap-session-scoped-attachment` and
  `library-view-tabs-and-filters`.

## Foundation references

- `docs/ARCHITECTURE.md` "Document scoping" section + "Student surface"
  description of the tab system

## Anchors

- Tab system — `packages/ui/src/hooks/use-tabs.ts` (existing tab kinds;
  add `'document'` here)
- Tab body isolation pattern — see `tab-body-isolation` pattern in
  `.claude/skills/patterns/`
- Sidebar / library — `packages/ui/src/components/` (current sidebar
  component, to be made scope-aware)
- Add document button (for "open" affordance) —
  `packages/ui/src/components/add-document-button.tsx`
- Document chunks for rendering —
  `packages/artifacts/src/schema.ts:264-275` (`documentChunks` with text,
  section, page)
- Embedded images and page rasters — `EmbeddedImageStore` /
  `PageImageStore` (already content-addressed)

## Design notes for feature-design

- Tab kind shape: `{ kind: 'document', documentId, scopeContext? }`.
  Persisted in the `tabs` table (Phase 14 — SPEC.md:20).
- Per-format render (resolved — all four are first-class for v1):
  - **PDF**: paginated render of the page rasters VisionPdfIngestor
    already produced.
  - **Plain text & Markdown**: render from `documentChunks` content.
  - **HTML**: render with sanitization (likely DOMPurify; verify no
    existing sanitizer in the workspace before adding the dep).
  - **PPTX / DOCX**: structured render using `EmbeddedImageStore` for
    the slide/figure visuals plus extracted text from
    `documentChunks`. Outline-shaped rather than native-fidelity, but
    full first-class — no plain-text-only fallback for these.
  Format-detection routes to the right renderer from
  `documents.mimeType`.
- Sidebar scope inference (resolved): **derived from active route + active
  tab**. Course route → course scope; bootstrap tab → that bootstrap
  session's scope; library route → unscoped/all. Feature-design pass writes
  the explicit decision tree (which route+tab combos map to which scope,
  and what wins when they conflict).
- Open-in-tab plumbing: reuse `openSessionInTab` pattern from
  `session-tab-open-flow`? Probably a new `openDocumentInTab` helper.
- Empty-state UX for scope with zero attached docs.

## Architectural choice

**New `'document'` tab kind alongside existing session-tabs; format-routed viewer body; sidebar derives scope from route+tab context.** The tab system is extended (not replaced) to support a document-bound tab; the viewer is a single component that dispatches on `documents.mimeType` to per-format renderers; the sidebar consults a small derived state ("active scope context") computed from route params + open tabs.

Two alternatives rejected:
- *Synthesize a per-document session.* Routes a document tab through the session machinery (open a fake session whose mode is "viewer"). Adds bookkeeping that doesn't pay for itself; document state has nothing to do with the engine session lifecycle.
- *Modal viewer (no tab).* Doesn't honor the user's mental model: a document being "open" is a first-class navigation state, not a temporary overlay. Also breaks alongside the tab-body-isolation pattern.

## Design decisions (resolved by autopilot)

- **Tab kind shape**: extend `TabSummary` with a discriminated union. Current `TabSummary` carries `sessionId` + `modeId`; add a `kind: "session" | "document"` discriminator. For `kind: "session"`, fields stay as-is. For `kind: "document"`, fields are `{ kind: "document"; tabId; documentId; title; openedAt }`. Database `tabs` table gets a `kind` column (default `"session"` for back-compat, NOT NULL after migration).
- **Schema migration**: `drizzle/<NN>_tab-document-kind.sql` adds `kind` column with default `"session"`, plus a nullable `document_id` column. Existing rows are all session-tabs; backfill `kind = "session"` then drop the default.
- **Client API extension**: `client.tabs.openDocument({ documentId, title })` — a separate method from `openTab`. Returns a `TabSummary` with `kind: "document"`. The existing `openTab` keeps its session-only signature.
- **Per-format renderers (all 4 first-class)**:
  - PDF: paginated render of the page rasters from `PageImageStore` (already content-addressed during ingestion).
  - Markdown / Plain text: render from `documentChunks` content joined; markdown via existing renderer if present (verify), else `react-markdown` (add dep if missing).
  - HTML: sanitized render via `DOMPurify` (verify a sanitizer doesn't already exist in the workspace; otherwise add the dep).
  - PPTX / DOCX: outline-shaped render using `EmbeddedImageStore` for visuals + `documentChunks` for text, grouped by section.
  Format-detection switch in `<DocumentViewerTabBody>` routes on `mimeType`.
- **Open-in-tab helper**: `packages/ui/src/lib/open-document-in-tab.ts` (new, mirrors `open-session-in-tab.ts` pattern). Chains `client.tabs.openDocument` → `useTabs().registerOpenedTab` → `navigate({ to: "/tab/$tabId" })` (or whatever the current tab route is).
- **Sidebar scope-inference decision tree** (resolved):
  1. If the active route is `/course/$courseId` AND the active tab is NOT a document tab, scope is `{ kind: "course", id: courseId }`.
  2. If any open tab has `modeId === "bootstrap"` AND it's the active tab, scope is `{ kind: "session", id: tab.sessionId }`.
  3. If the active tab is a document tab, scope is its document's primary scope (look up `listScopesForDocument(documentId)` — pick first course-scope row if present, else first session-scope row, else "all").
  4. Otherwise (library route, no relevant tab): scope is `null` ("all").
  The sidebar's `useDerivedScope()` hook implements this; tests cover all four branches.
- **Sidebar empty state**: when scope yields zero docs, render an EmptyState directing the user to either the library route (to ingest/attach) or to the doc picker (in course-context).
- **Document service queries the viewer needs**: `documents.chunksForDocument({ documentId, studentId })` exists. PDF needs `pageImages.listForDocument(documentId)` — add if missing (verify `PageImageStore` already exposes a list method).
- **HTML sanitization dep choice**: `DOMPurify` if no existing sanitizer in workspace. (Verify during impl with a grep for `sanitize` / `dompurify`.)
- **Tab title for document tabs**: `documents.filename` truncated to ~40 chars. Stored on the tab row at open time so re-opens don't require a doc fetch.

## Anchors (verified)

- Tab system — `packages/ui/src/hooks/use-tabs.ts` (extend `openTab`/`reopenTab` shape; add `openDocumentTab`)
- Tab service — `packages/core/src/services/tabs-service.ts` (extend `open()` and `TabSummary` projection)
- Tabs schema — `packages/core/src/schema.ts` (add `kind` + `document_id` columns)
- Tab body dispatcher — `packages/ui/src/components/chat-tab-body.tsx` and the route that renders tab bodies (add a `kind === "document"` branch)
- Documents service — `packages/core/src/services/documents-service.ts` (chunksForDocument, etc.)
- Page-image store — `packages/core/src/ingestion/page-image-store.ts` (verify list method)
- Embedded-image store — `packages/core/src/ingestion/embedded-image-store.ts`
- Existing sidebar — verify path; likely `packages/ui/src/components/sidebar*.tsx` (or library-section variant)
- DocumentScopes client — `packages/client/src/services/document-scopes-client.ts` (for `listScopesForDocument`)
- `open-session-in-tab` helper (pattern reference) — `packages/ui/src/lib/open-session-in-tab.ts`
- `tab-body-isolation` pattern — `.claude/skills/patterns/tab-body-isolation.md`

## Implementation Units

This feature spans 3 meaningfully-independent chunks: (A) tab-kind foundation, (B) the multi-format viewer, (C) the scope-aware sidebar. A and C are parallel; B depends on A. Spawning child stories pays for itself — fan-out via the orchestrator + clearer scope per agent.

### Story 1 (foundation): `…-viewer-tab-scoped-sidebar-tab-kind`

Tab-kind extension. Schema migration, TabSummary discriminated union, tabs-service `open()` extended with `kind: "document"` branch, `client.tabs.openDocument` method, `openDocumentInTab` helper, tests.

**File set**:
- `packages/core/src/schema.ts` (add columns)
- `drizzle/<NN>_tab-document-kind.sql` (migration)
- `packages/core/src/types/tabs.ts` (or wherever TabSummary lives — make it a discriminated union)
- `packages/core/src/services/tabs-service.ts` (extend `open()`)
- `packages/desktop/electron/main/tabs-channel.ts` (IPC handler for the new path)
- `packages/client/src/services/tabs-client.ts` (`openDocument` method)
- `packages/ui/src/hooks/use-tabs.ts` (`openDocumentTab` callback)
- `packages/ui/src/lib/open-document-in-tab.ts` (new helper)
- Tests across each file

`depends_on: []`

---

### Story 2 (viewer): `…-viewer-tab-scoped-sidebar-viewer`

Multi-format document viewer body. Dispatcher component + per-format renderers (PDF, markdown/text, HTML, PPTX/DOCX outline). Mounts inside the document tab once Story 1 lands.

**File set**:
- `packages/ui/src/components/document-tab-body.tsx` (new — top-level)
- `packages/ui/src/components/document-renderers/pdf-renderer.tsx`
- `packages/ui/src/components/document-renderers/markdown-renderer.tsx`
- `packages/ui/src/components/document-renderers/html-renderer.tsx`
- `packages/ui/src/components/document-renderers/structured-renderer.tsx` (PPTX/DOCX)
- `packages/ui/src/components/document-renderers/format-router.ts` (mimeType → renderer)
- Tab body dispatcher edit (route on `tab.kind === "document"` → `<DocumentTabBody>`)
- IPC method `pageImages.listForDocument` if missing (verify `PageImageStore`)
- Tests including a fixture per format

`depends_on: [epic-document-library-viewer-tab-scoped-sidebar-tab-kind]`

---

### Story 3 (sidebar): `…-viewer-tab-scoped-sidebar-sidebar`

Scope-aware sidebar. `useDerivedScope()` hook, sidebar component reading from derived scope, empty-state UX.

**File set**:
- `packages/ui/src/hooks/use-derived-scope.ts` (new — the 4-branch decision tree)
- The existing sidebar component (verify path; likely `packages/ui/src/components/sidebar.tsx` or similar)
- Tests covering all 4 branches of `useDerivedScope`

`depends_on: []` (works against the existing tab system + `documentScopes.listForScope`; doesn't require the new tab kind to exist)

---

## Implementation Order

1. **Story 1 (tab-kind foundation)** — schema, types, service, IPC, client, hook, helper.
2. **Story 3 (scope-aware sidebar)** — in parallel with Story 1 if the orchestrator runs them as wave-1.
3. **Story 2 (viewer body)** — wave-2 after Story 1.

## Testing

- Story 1: schema migration via `useTempDb()`; service test for the new `kind` branch; client roundtrip; hook test for `openDocumentTab`.
- Story 2: each renderer has a unit test against a representative fixture (small PDF page raster, markdown text, sanitized HTML, structured pptx outline); the dispatcher has a mimeType→renderer test.
- Story 3: 4 tests for the decision tree (each branch); 1 test for the empty state.

## Risks

1. **Tab-kind migration data loss** (low). Existing rows are all session-tabs; backfilling `kind = "session"` is safe. Drizzle's transaction guarantee + the `useTempDb()` test path covers it. Mitigation: copy-pattern from `0014_document_scopes_migration.sql` (Drizzle native-preview workaround).

2. **HTML sanitization** (low-medium). If no existing sanitizer exists in the workspace, adding `DOMPurify` introduces a new dep. Mitigation: verify with a grep before adding; if `DOMPurify` is already pulled by another component (e.g., for sketch/markdown), reuse it.

3. **PDF rendering of page rasters** (low). The page rasters already exist; rendering is just `<img>` per page. Performance is fine for typical doc sizes; a virtualized scroll list (~react-virtuoso pattern) is a v2 optimization.

4. **PPTX/DOCX structured render fidelity** (medium). Outline-shaped is explicitly the v1 target — not native fidelity. Users coming from PowerPoint may be disappointed by the look. Mitigation: clear empty/structured-render styling that doesn't promise more than it delivers.

5. **`useDerivedScope` priority order** (low). The 4-branch decision tree must agree with what the library route shows on its "This course" / "This session" tabs. Cross-feature consistency check: both this feature's sidebar and `library-view-tabs-filters`'s tab visibility derive from the same set of facts (active route, active tab, etc.). Mitigation: extract the inference into a single shared hook (`useDerivedScope`) that both consume.

## Notes for downstream

- `library-view-tabs-filters` (sibling) replaces `openDocumentSafe`'s body with `openDocumentInTab` once Story 1 lands. The sibling feature's helper signature stays the same — only the body changes.
- A future "viewer plugin registry" (per-mimeType third-party renderer) is a v2 extension that drops into the format-router.

## Implementation rollup

All three child stories are at stage `review` or `done`:

- **`...tab-kind`** (`stage: done`, commit `2165aee`, review `feacb80`) — TabSummary discriminated union, `tabs.openDocument` end-to-end, migration 0016 recreating the tabs table with `kind`/`document_id` columns, per-mode tab body components narrowed to SessionTabSummary, placeholder document branch in ChatTabBody.
- **`...sidebar`** (`stage: done`, commit `4565ba1`, review `9cdbd38`) — `useDerivedScope` hook with 4-branch decision tree, scope-aware sidebar in ChatRoute that switches between global and scoped document lists, 12 hook tests + extended chat-route test. 2 follow-ups parked in backlog: `list-scopes-for-document-client-api` and `lift-tabs-state-to-context`.
- **`...viewer`** (`stage: review`, commit `3c00116`) — Multi-format DocumentTabBody with format-router dispatching to PdfRenderer (paginated via PageImageStore), MarkdownRenderer, HtmlRenderer (DOMPurify-sanitized), StructuredRenderer (PPTX/DOCX outline), and FallbackRenderer. New `documents.get` end-to-end. Viewer wired into ChatTabBody's document branch.

Verification: `pnpm typecheck && pnpm lint && pnpm test` green at 3149 passing.

What's now possible: documents can be opened in their own tab, the viewer renders them in-format, and the sidebar reflects scope-derived context. The document-tab persistence (tab-kind) + the user-facing viewer (viewer) + the scope-derivation hook (sidebar) compose into a complete document-library navigation surface.

## Review (2026-05-13) — aggregate

**Verdict**: Approve

All three child stories shipped clean and were individually approved:
- `...tab-kind` (commit 2165aee, review feacb80) — schema + types + IPC
- `...sidebar` (commit 4565ba1, review 9cdbd38) — useDerivedScope hook + scoped sidebar
- `...viewer` (commit 3c00116, review 7e4322a) — multi-format viewer + documents.get

**Aggregate-only checks**:
- **Capability completeness**: opening a document via openDocumentInTab → tab persists → viewer renders → sidebar reflects scope. End-to-end works.
- **Foundation-doc alignment**: no drift. The "Student surface" tab-system note in `docs/ARCHITECTURE.md` already describes a tab strip; this feature's `kind: "document"` extension fits within the existing description.
- **Cross-cutting concerns**: 2 follow-ups parked in backlog from the sidebar review (`list-scopes-for-document-client-api`, `lift-tabs-state-to-context`). Both are accepted MVP debt with clear scopes.

**Notes**: This was a 3-story feature run across a 2-wave orchestrator pass. Cross-story contracts (DocumentTabSummary, openDocumentInTab, the chat-tab-body dispatch branch) all held — no late integration surprises. The discriminated-union refactor on TabSummary in tab-kind was the load-bearing change; downstream tab-body components narrowed cleanly.
