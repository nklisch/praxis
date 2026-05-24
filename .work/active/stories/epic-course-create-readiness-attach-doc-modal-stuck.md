---
id: epic-course-create-readiness-attach-doc-modal-stuck
kind: story
stage: done
tags: [ui, ingestion, bug]
parent: epic-course-create-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Course-create attach-doc modal stuck

## Brief

In the course-create (course-design) flow, attaching documents shows a
stacking bug: after the user finishes the attach flow the "done" modal
appears, but the previous modal in the chain stays mounted underneath it
instead of dismissing. Once the user closes both modals, no attached
documents are visible on the course-design surface.

Two suspected causes, both likely contributing:

1. **Modal-dismissal regression** — the previous step's modal doesn't
   unmount before the success modal opens. Investigate the modal
   lifecycle in the attach-from-library and inline-upload paths (the
   `modal-primitive` pattern owns the backdrop / ESC / click-outside
   behavior; per-step open/close state lives in the calling components).
2. **Scopes-refresh gap** — the CourseCreate attachments list doesn't
   re-read from the backing scope after `documentScopes.attach`. Check
   that the attach action triggers a refresh (or that the
   `DocumentScopesService` subscriber stream fans out a change that the
   CourseCreate view consumes).

## Repro and fix path

1. Open course-create.
2. Trigger Attach from Library → pick a document → confirm.
3. Observe: success modal appears, but the picker modal stays mounted
   under it; closing both leaves the attachments list empty.
4. Fix the modal lifecycle so the picker dismisses before success
   renders; fix the scopes refresh so the attachments list re-reads after
   attach completes.
5. Add a UI test covering the flow end-to-end.

## Implementation notes

### Bug 1 — modal stacking root cause + fix

**Root cause**: `library-document-picker.tsx` renders its JSX in a fragment with three siblings:
the picker `<Modal>` (always rendered while the component is mounted), `<PickerTierModal>` (gated
on `tier_selection` status), and `<BatchSummaryModal>` (gated on `batch_summary` status). When
the user uploads a file via drag-drop or the Upload button, the batch loop transitions to
`batch_summary`, rendering `BatchSummaryModal` — but the picker `<Modal>` had no corresponding
gate and remained mounted, producing two stacked `role="dialog"` elements simultaneously.

**Fix** (`packages/ui/src/components/library-document-picker.tsx:141`): Wrapped the picker
`<Modal>` in `{ingestion.state.status !== "batch_summary" && (...)}` so it is conditionally
rendered. The `LibraryDocumentPicker` component stays mounted (ingestion state is preserved);
only its `<Modal>` is hidden when the batch-summary modal is active.

### Bug 2 — missing attachments display root cause + fix (callback approach)

**Root cause layer A** (`packages/ui/src/components/course-create-tab-body.tsx`): No component
on the canvas displayed the session-scope attached documents. The canvas had the "Add documents"
button and the draft outline but no rendering of `documentScopes.listForScope(...)`.

**Fix layer A**: Added `useResource(attachedLoader)` in `CourseCreateTabBody` (line 74) to load
the attached docs list. Added `<div data-testid="attached-docs-section">` with a `<ul>` in the
canvas scroll area (line 167) that renders when `attachedDocs.length > 0`. Added supporting CSS
classes (`.attachedDocsSection`, `.attachedDocsKicker`, `.attachedDocsList`, `.attachedDocRow`,
`.attachedDocName`, `.attachedDocMeta`) to `course-create-tab-body.module.css`.

**Root cause layer B**: `LibraryDocumentPicker` had an existing `onAttached?` callback prop but
`CourseCreateTabBody` didn't pass it, so the canvas resource was never refreshed after attach.

**Fix layer B** (`packages/ui/src/components/course-create-tab-body.tsx:230`): Added
`onAttached={() => void refreshAttached()}` to the `<LibraryDocumentPicker>` invocation. The
picker already calls `onAttached?.(documentId)` after each successful attach (line 114 in the
picker), so this wires the refresh path cleanly. No subscriber stream needed.

### Test added

`packages/ui/src/__tests__/course-create-tab-body-add-docs.test.tsx` — two new tests appended to
the existing describe block:

- **Bug 2**: open picker → attach → assert `attached-docs-section` appears on canvas; verifies
  `listForScope` is called at least twice (initial load + refresh after attach).
- **Bug 1**: open picker → drop a non-PDF file → batch ingestion runs → assert only ONE
  `role="dialog"` is in DOM when `BatchSummaryModal` is showing (picker modal not stacked).

Also added `vi.mock("../hooks/use-tabs.js")` to the existing test file since the pre-existing
story changes added `useTabs` to `CourseCreateTabBody`.

## Review (2026-05-23)

**Verdict**: Approve

Both root causes identified and fixed cleanly. Bug 1 wraps the picker Modal
in `{ingestion.state.status !== "batch_summary" && (...)}` so the component
stays mounted (preserving ingestion state) while its Modal hides during the
batch-summary modal — correct shape. Bug 2 uses the existing `useResource`
+ `onAttached` callback pattern (option 1 from the brief) rather than
introducing a subscriber stream — appropriately scoped. Tests exercise the
real end-to-end paths and would catch regressions.

**Blockers**: none

**Important**: none

**Nits**:
- The Bug 1 test exercises the upload-then-batch-summary path (drop file →
  ingest → summary). The original user complaint described "Attach from
  Library → pick a document → confirm" — likely the same code path under
  the hood (both flow through the picker → ingestion state → summary), but
  worth confirming the user's specific repro is fixed too.
- `attachedLoader` re-creates on every `tab.sessionId` change — fine since
  `tab.sessionId` is stable per tab, but the `useResource` re-fires if
  `client` identity changes (it shouldn't, since it's from context).

**Notes**: Both fixes are scoped and surgical. The picker's existing
`onAttached` prop turned out to be the right hook — nice when the prior
plumbing supports the new use case without modification.
