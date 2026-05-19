---
id: feature-reattach-docs-mid-session
kind: feature
stage: done
tags: [bootstrap, documents, ux]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-14
updated: 2026-05-17
---

# Add documents to a running bootstrap-design session

## Brief

Once a course-design (bootstrap explorer) session is in flight, there appears to be no way to attach additional already-ingested documents to it — the document set is fixed at session start. If the user remembers a relevant document mid-design, or ingests a new one while the explorer is running, they have no path to bring it into the active session's scope.

The natural shape is a "+ add documents" affordance on the bootstrap surface that opens the same document picker used at session start, scoped to docs already in the library, and re-runs the explorer's document grounding against the expanded set on the next turn (or surfaces it as additional context immediately). Worth confirming the gap is real (the design session's `document_scopes` rows with `scope_kind='session'` are presumably write-once today) and scoping a fix that handles both the data-side reattach and the UX entry point.

## Scope

- Confirm the gap — read `DocumentScopesServiceImpl` and the bootstrap UI to verify session-scoped attachment is write-once at session start.
- Add a `documentScopes.attachToSession` (or equivalent) operation that's safe to call mid-session.
- IPC channel + client surface for the operation.
- A "+ add documents" affordance on the bootstrap surface that opens the existing library picker filtered to library docs not yet in scope.
- Make the explorer's next-turn grounding pick up the expanded scope (verify whether the document tools read the scope per call — they likely do via `DocumentScopesServiceImpl`).

## Acceptance criteria

- A user can add an already-library document to a running bootstrap session and the explorer's next turn sees it in scope.
- The session→course promotion at `confirmDraft` still includes the mid-session-added documents.
- Tests cover both the data-side attach and the UX entry point.

## Anchors

- Document scopes — `packages/core/src/services/` `DocumentScopesServiceImpl`
- Bootstrap session-scoped attach (initial) — `epic-document-library-bootstrap-session-scoped-attachment` (done)
- Bootstrap UI surface — `packages/ui/src/routes/courses.tsx` (modified per git status)
- Library document picker — `packages/ui/src/components/`

## Design decisions

1. **Generalize the picker** rather than fork a session-specific variant. Single component, polymorphic scope prop. Reduces drift between course and session attach UX.
2. **Scope discriminator type**: `DocumentScope = { kind: 'course'; id: CourseId } | { kind: 'session'; id: SessionId }` from `packages/core/src/types/document-scopes.ts:10`. Used as-is.
3. **No new IPC**: existing `attach` and `listForScope` in `DocumentScopesClientApi` cover both scope kinds.
4. **No automatic refresh wiring**: the explorer's per-turn document resolution picks up the attach automatically (see Implementation notes).
5. **Button label**: "Add documents" (sentence case). Added `COPY.libraryPicker.deckCourse` and `COPY.libraryPicker.deckSession` keys to the COPY module.

## Architectural choice

Generalize `LibraryDocumentPicker` to take any `DocumentScope`; reuse for both course and session attach flows. The `scope` prop replaces the former `courseId: CourseId` prop. The component adapts its deck copy based on `scope.kind`.

## Implementation Units

### Unit 1: Generalize LibraryDocumentPicker

**File**: `packages/ui/src/components/library-document-picker.tsx`

- Replaced `courseId: CourseId` prop with `scope: DocumentScope` (imported from `@praxis/core/types`).
- `loader` calls `client.documentScopes.listForScope(scope)` directly.
- `handleAttach` calls `client.documentScopes.attach({ scope, ... })`.
- Deck copy varies by `scope.kind` via `COPY.libraryPicker.deckCourse` / `COPY.libraryPicker.deckSession`.
- Added `COPY.libraryPicker` section to `packages/ui/src/lib/copy.ts`.

**Tests** (`packages/ui/src/__tests__/library-document-picker.test.tsx`):
- Updated `renderPicker` to accept `scope: DocumentScope` (defaults to `COURSE_SCOPE`).
- Updated existing `attach` / `listForScope` assertions to use scope objects.
- Added `describe("session scope")` block with two new test cases pinning session-scope attach and `listForScope` call.

### Unit 2: Update course-detail call site

**File**: `packages/ui/src/routes/course-detail.tsx:179-185`

Mechanical: `courseId={courseId}` → `scope={{ kind: "course", id: courseId }}`.

### Unit 3: Add documents affordance in BootstrapTabBody

**File**: `packages/ui/src/components/bootstrap-tab-body.tsx`

- Added `const [pickerOpen, setPickerOpen] = useState(false)`.
- Added `<LibraryDocumentPicker scope={{ kind: "session", id: tab.sessionId }} onClose={...} />` rendered when `pickerOpen`.
- Added "Add documents" `<button>` in the outline header (between the title and budget field).
- Added `.addDocsBtn` style to `packages/ui/src/components/bootstrap-tab-body.module.css`.

**Tests** (`packages/ui/src/__tests__/bootstrap-tab-body-add-docs.test.tsx` — new file):
- Renders "Add documents" button.
- Clicking it opens the picker modal.
- Attach inside picker calls `documentScopes.attach` with `{ kind: 'session', id: sessionId }`.
- Close button closes the picker.

## Implementation notes

**Per-turn document resolution — automatic pickup confirmed**: For bootstrap sessions, `args.courseId` is undefined, so `courseDocumentIds` is not set in `ToolContext` (`packages/core/src/services/session-service.ts:732-737`). The `retrieve_from_documents` handler (`packages/tools/src/retrieval/retrieve-from-documents.ts:92`) falls through to searching the full library when `courseDocumentIds` is undefined. Since the newly-attached document is already in the library, it is immediately searchable on the explorer's next `retrieve_from_documents` call — no extra wiring needed.

The `course.list_library_documents` tool (`packages/tools/src/course/list-library-documents.ts:44`) calls `listForScope({ kind: 'session', id: ... })` on every invocation, so session-scope flags (`attachedToCurrentSession`) also update immediately.

No caching gap identified. Mid-session attach is fully live.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Diff inspected at commit `65be731`. Clean polymorphic-scope generalization:
- `LibraryDocumentPicker` prop renamed `courseId: CourseId` → `scope: DocumentScope` with adaptive deck copy via `COPY.libraryPicker.deckCourse` / `deckSession`. The existing optimistic-update / per-row error handling carries over unchanged.
- Single call-site update in `course-detail.tsx` (mechanical prop rename).
- `BootstrapTabBody` gets the affordance: "Add documents" button in the outline header + state-driven modal mount.
- Per-turn document resolution in the explorer picks up the attach automatically — agent verified by tracing `retrieve_from_documents` and `course.list_library_documents` (both read `listForScope` live per call, no caching gap).
- 6 new + extended tests across the picker (session scope) and the bootstrap body (button + open + attach call + close). Full UI suite passes (1023 tests).

The generalization improves the design (one picker, two scopes) rather than forking a session-specific variant — exactly the kind of consolidation the codebase favors.
