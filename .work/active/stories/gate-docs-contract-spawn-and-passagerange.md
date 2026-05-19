---
id: gate-docs-contract-spawn-and-passagerange
kind: story
stage: review
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: docs
created: 2026-05-18
updated: 2026-05-18
---

# CONTRACT.md `SessionService` and ARCHITECTURE.md document-scopes assertion miss `spawnFromNote`, `spawnFromPassage`, and `passageRange`

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CONTRACT.md:851-875` (`SessionService` interface)
- Doc: `docs/ARCHITECTURE.md:387-391` (Document scopes section)
- Doc: `CLAUDE.md:114` (Document scopes bullet)
- Code: `packages/core/src/services/session-service.ts:505, 609`
  (`spawnFromNote`, `spawnFromPassage`)
- Code: `packages/core/src/types/session-client.ts:60` (client surface)
- Code: `packages/artifacts/src/schema.ts:286` (`passageRangeJson` column)
- Code: `packages/core/src/services/document-scopes-service.ts:166-225`
- Code: `packages/core/src/types/document-scopes.ts:57-64`

## Current doc text
CONTRACT.md `SessionService` interface includes `start`, `send`, `end`,
`active`, `spawnFromAssignment`, `notifySession`. No `spawnFromNote`, no
`spawnFromPassage`.

ARCHITECTURE.md describes `document_scopes` rows as `(document_id,
scope_kind, scope_id, source, attached_at)`. No mention of `passageRange`.

CLAUDE.md "Document scopes" bullet:
> manages the polymorphic `document_scopes` table keyed by
> `(document_id, scope_kind, scope_id)`; `scope_kind` is `'course' | 'session'`.
> Course-create sessions attach documents as session-scoped; confirming a
> draft promotes them to course-scope.

## Reality
- `SessionService` exposes `spawnFromNote(input)` and
  `spawnFromPassage(input)` alongside `spawnFromAssignment`. Both inject a
  `system_note` event into the spawned child session and are part of the
  client surface. Bound items:
  - `epic-backend-fills-for-redesign-cross-tab-state-parent-child-and-system-note`
  - `epic-backend-fills-for-redesign-document-viewer-citations-and-spawn`
- `document_scopes` rows carry an optional `passage_range_json` column
  storing `{ startOffset, endOffset }` — consumed by the document viewer
  for passage markers and by `SessionService.spawnFromPassage` to scope a
  child session to a specific passage. `attach({...passageRange})` writes
  it; `getPassageRange(...)` reads it.

## Required edit
- CONTRACT.md `SessionService` interface (around line 851-875): add
  `spawnFromNote(input)` and `spawnFromPassage(input)` signatures with the
  `passageRange: { startOffset: number; endOffset: number }` field on the
  latter.
- ARCHITECTURE.md Document scopes section (line 387-391): extend the row
  shape to `(document_id, scope_kind, scope_id, source, attached_at,
  passage_range)` and add one sentence: the optional `passageRange`
  (character offsets) stores a per-row text range used by the document
  viewer to render passage markers and by `SessionService.spawnFromPassage`
  to scope a child session to a passage.
- CLAUDE.md "Document scopes" bullet (line 114): append a sentence
  describing the optional `passageRange` row field.

Apply rolling-foundation: replace assertions in place; describe the
present.

## Implementation notes (2026-05-18)

- **CONTRACT.md**: Added `spawnFromNote` and `spawnFromPassage` signatures to the `SessionService` interface block, placed between `spawnFromAssignment` and `notifySession`. Signatures verified against `packages/core/src/types/session-client.ts` (canonical client surface) and `packages/core/src/services/session-service.ts` (implementation). Both methods accept an optional `studentId?: StudentId` that falls back to `getOrCreateDefaultStudentId`. `spawnFromNote` takes `noteId: NoteId` and optional `cueId?: string`; `spawnFromPassage` takes `documentId: DocumentId` and `range: { startOffset: number; endOffset: number }`.
- **ARCHITECTURE.md**: Extended the `document_scopes` row shape tuple in the Document scoping section to include `passage_range` and appended one sentence describing the `passageRange` field's consumers (document viewer passage markers, `SessionService.spawnFromPassage`).
- **CLAUDE.md**: Appended a sentence to the Document scopes bullet describing the optional `passageRange` row field (`{ startOffset, endOffset }`), the `attach`/`getPassageRange` API surface, and its two consumers.
- `pnpm lint` passes — docs-only changes, no code modified.
