---
id: epic-document-library-bootstrap-session-scoped-attachment
kind: feature
stage: drafting
tags: [bootstrap, documents, tutor-ux]
parent: epic-document-library
depends_on: [epic-document-library-scopes-primitive]
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Bootstrap-session-scoped document attachment

## Brief

Today bootstrap reads documents that were already attached to a course
(via `course_documents`). That means re-bootstraps or parallel exploration
runs share the same doc set — there's no way to say "this textbook is for
*this* exploration only, not the course yet." Documents also leak into
the next bootstrap run because they were attached to a course-shaped
scope from the start.

This feature gives bootstrap sessions their own document scope. Attaching
a document inside a bootstrap session writes a `document_scopes` row with
`scope_kind='session'`, `scope_id=<sessionId>`. The explorer's document
tools (`document.outline`, `document.list_sections`, `document.read_pages`,
`retrieve_from_documents`) read from the session's scope during the
exploration. On `confirmDraft`
(`packages/core/src/services/bootstrap-service.ts:527-576`), the
session-scoped documents are **promoted** to course-scope rows alongside
the existing session rows — both survive, so the doc remains durably
attached to the course while the audit trail of "this session pulled in
these docs" is preserved.

## Epic context

- Parent epic: `epic-document-library`
- Position in epic: consumer of the new scoping primitive; wave 2 alongside
  `document-viewer-tab-scoped-sidebar` and `library-view-tabs-and-filters`.

## Foundation references

- `docs/ARCHITECTURE.md` "Document scoping" section — describes the
  session→course promotion this feature implements

## Anchors

- Bootstrap explorer entry — `packages/tools/src/course/start-exploration.ts:22-25`
  (currently takes `documentIds` array)
- Explorer document tools — `packages/tools/src/document/*.ts`
- Bootstrap confirm flow —
  `packages/core/src/services/bootstrap-service.ts:527-576` (and
  `persistDraftTx` 1220-1350; line 1279 stores `documentIds` in
  `sourceJson`)
- Draft storage — `packages/core/src/schema.ts:71-93` (durable drafts
  carry `documentIds`)
- Bootstrap UI — `packages/ui/src/components/bootstrap-tab-body.tsx:40-80`
- Session table — already exists with `modeId='bootstrap'`; no new table
  for bootstrap sessions

## Design notes for feature-design

- Promotion semantics: write a `course` scope row at confirmation; keep
  the `session` scope row for audit. Both queries succeed afterward.
- Cleanup (resolved): **keep** session-scoped rows when a bootstrap
  session is abandoned without `confirmDraft`. Don't garbage-collect.
  They surface under the library's Orphaned tab (see
  `library-view-tabs-filters`). Mechanism for detecting "abandoned"
  vs. "active" session is for feature-design — likely a flag on
  `sessions` (e.g., `abandoned_at` timestamp, set when the user
  explicitly discards or starts a fresh bootstrap run), or a derived
  rule ("no events in N days + never confirmed").
- Tool surface: do the explorer tools take the scope explicitly, or
  derive from `ctx.sessionId`? Latter is simpler if `ToolContext` carries
  it.
- Confirm-path data flow: today `documentIds` in the draft `stateJson` is
  the trigger for `attachMany`. New flow either uses the scope query
  directly (`listForScope(session_id)`) or keeps the `documentIds` array
  and adds the promotion step.
