---
id: feature-reattach-docs-mid-session
kind: feature
stage: drafting
tags: [bootstrap, documents, ux]
parent: null
depends_on: []
release_binding: null
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
