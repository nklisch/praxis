---
id: story-create-course-select-existing-docs
kind: story
stage: done
tags: [ui]
parent: feature-course-create-improvements
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-25
---

# Add "select from existing documents" affordance to the course-create entry screen

## Brief
The course-create entry screen currently only offers upload / pack / create-your-own — there's no way to seed a new course from documents the user has already uploaded into the library. Add a "select from existing documents" affordance alongside the existing three paths so users can pick already-indexed sources (notes, PDFs, etc.) without re-uploading. The workspace already reuses the same documents across sessions and courses; the create flow is the outlier.

## Implementation hints
- Reuse the existing library document-picker component used elsewhere in the workspace (sketches, notes, attach-from-library flow per `gate-tests-library-picker-drag-overlay-child-leave-guard`).
- The selected documents become session-scoped attachments on the new course-create session, identical to how uploaded docs land — they get promoted to course-scope on draft confirm via the same path.
- UI placement: a fourth option in the entry row, OR a "browse library" secondary action below the three primary options. Feature-design tier above already decided this is a fourth-option-in-the-row; design choice is at story level.

## Source idea
`idea-create-course-select-existing-docs` (parked 2026-05-24).

## Implementation notes (2026-05-25)

**Approach**: Added "Library" as a fourth tab to `SourcePicker` (alongside Pack / Upload / Paste). The Library tab renders an inline `LibraryPane` component that calls `client.documents.list()` and shows each document with a "Select" button. Selecting adds the doc to `attachedSources` in parent state as `{ kind: "library", status: "ready", documentId }`. On "Start Praxis", the story-1 fix attaches all ready documentIds (including library ones) to the new session scope.

**Design decisions**:
- Did NOT reuse `<LibraryDocumentPicker>` (modal-based) — that component is designed as a standalone modal with `onClose`. An inline tab pane is cleaner UX here: the user can see the attached list growing while selecting multiple docs without a dismiss step.
- Selection is parent-controlled via `selectedLibraryDocumentIds: ReadonlySet<string>`. Once selected, the row shows a "selected" badge (no re-attach on repeated click).
- The `onLibrarySelect` / `selectedLibraryDocumentIds` props are optional on `SourcePickerProps` so existing consumers (tests that only use pack/upload/paste tabs) don't break.

**Files changed**:
- `packages/ui/src/components/source-picker.tsx` — added `SourceTab: "library"`, `TABS` entry, `LibraryPane` component, `onLibrarySelect` / `selectedLibraryDocumentIds` props
- `packages/ui/src/components/source-picker.module.css` — added `.libraryPane`, `.libraryList`, `.libraryRow`, `.libraryRowInfo`, `.libraryFilename`, `.libraryMeta`, `.librarySelectBtn`, `.librarySelectedBadge`
- `packages/ui/src/routes/course-create.tsx` — added `"library"` to `AttachedSourceKind`, added `handleLibrarySelect`, passed new props to `SourcePicker`

**Tests**: `packages/ui/src/__tests__/course-create-route-library-tab.test.tsx` — 8 tests covering: Library tab present, not active by default, shows documents, Select button present, clicking Select adds to attached sources with "ready" status, second select shows "selected" badge, selected doc attached to session scope on Start, empty library shows empty state.
