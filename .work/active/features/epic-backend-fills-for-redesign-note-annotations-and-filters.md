---
id: epic-backend-fills-for-redesign-note-annotations-and-filters
kind: feature
stage: done
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Note annotations + Catalogue search/filters

## Brief

Two related additions to the workspace data layer:

**Selection-anchored note annotations.** The locked Feynman editor
(variant D — Two-Pass Margin) shows the student entering a "review
mode" where they select passages in their own explanation and attach
margin notes ("warning yellow" for soft gaps, "danger red" for load-
bearing ones). The current notes schema
(`packages/artifacts/src/schema.ts:188-206`) has `body` + `format` +
`sketchSceneJson` + `linksJson` but no field for inline annotations
attached to specific text ranges. This feature adds an annotations
field (likely JSON array of `{rangeStart, rangeEnd, text, severity}`)
plus the read/write API.

**Catalogue search + saved filters.** The locked Workspace
(`epic-ui-redesign-ground-up-workspace` Option 3 — Catalogue) is
search-first with a filter rail including saved filters: "from this
session", "due for review", "recent today", "orphan/unlinked". None
exist today. This feature adds: full-text search across artifact
bodies, "from-session" filter (needs originating-session index on
artifacts), "orphan" detection (artifacts not linked to any
course/lesson/concept), "due" filter (cards due now via the spaced-
review state), "recent" filter (date-windowed).

What this feature does **not** cover: the workspace UI itself; the
spaced-review scheduler (assumed); per-format note editor rewrites
(those are UI epic implementation stories).

## Epic context

- Parent epic: `epic-backend-fills-for-redesign`
- Position in epic: **independent** — no within-epic deps.
- UI co-ships with: `epic-ui-redesign-ground-up-workspace`
  implementation (consumes both annotations and filters).

## Foundation references

- `packages/artifacts/src/schema.ts` — `notes` table (annotations
  field added here); originating session id likely added too
- `docs/ARCHITECTURE.md` § "Artifact lifecycle" + § "Storage
  architecture" — sqlite-vec already in use; FTS may need new index
- `packages/core/src/services/notes-service.ts` — annotations API
  surface lives here
- `.mockups/screens/.../-workspace/note-feynman-editor-d-two-pass.html`
  — the editor consuming annotations
- `.mockups/screens/.../-workspace/option-3.html` — Catalogue with
  filter rail

## Design decisions

- **Keep two sub-features in one ship but split into two stories.**
  They both touch the workspace data layer but are conceptually
  separable (annotations write, filters read) and ship cleaner as
  independent waves.
- **Annotations land on `notes` as a new JSON column.** Storing them
  alongside the body keeps the read path one-query and matches the
  existing `linksJson` / `sketchSceneJson` pattern. No new table.
- **Search uses SQLite FTS5, not LIKE.** Open-ended student text needs
  ranking and tokenizer flexibility. New virtual table `notes_fts`
  (and `flashcards_fts`) synced via triggers.
- **Originating session id becomes a dedicated indexed column** on
  `notes` (today it's only in `contextJson`). Filter queries get O(log)
  instead of JSON scans.
- **"Orphan" is a derived predicate.** Notes/flashcards with neither a
  `course_id` link (via `linksJson`) nor a `concept_id` are orphaned.
  No new storage; the filter is a SQL query.

## Architectural choice

Two parallel sub-features:

**Sub-feature A — Note annotations.** Schema column + `NotesService`
methods `setAnnotations(noteId, annotations)` and
`getAnnotations(noteId)`. Annotation type:
`{ rangeStart: number; rangeEnd: number; text: string; severity: "soft" | "load_bearing" }`.

**Sub-feature B — Catalogue search + filters.** Adds session-id column
to `notes`, FTS5 virtual table(s), and a `LibraryService` (or extension
of artifacts) aggregating the four saved filters: `from-session`,
`orphan`, `due`, `recent`.

## Implementation Units

### Unit 1: Annotation schema + service (Story A)

- `packages/artifacts/src/schema.ts` — add
  `annotationsJson: text("annotations_json", { mode: "json" })`
  nullable on `notes`.
- Migration via `pnpm db:generate`.
- `Annotation` type in `packages/core/src/types/notes.ts`.
- `NotesService.setAnnotations(noteId, annotations[])` and
  `.getAnnotations(noteId)` methods.

### Unit 2: Session-id column + backfill (Story B)

- `packages/artifacts/src/schema.ts` — add
  `sessionId: text("session_id")` (nullable, indexed) on `notes`.
- Migration with backfill SQL using `json_extract(context_json,
  '$.sessionId')` to populate existing rows.

### Unit 3: FTS5 + search/filter API (Story B)

- Migration creating `notes_fts` (FTS5 virtual table over `body`) and
  `flashcards_fts` (FTS5 over `front` + `back`), plus triggers to
  keep them in sync (INSERT / UPDATE / DELETE).
- `NotesService.search({ query, sessionId?, orphan?, dueOnly?, recentWindowMs? })`
  and `FlashcardsService.search(...)`.
- New `LibraryService` (or methods on artifacts) composing the four
  saved filters across both tables.

### Unit 4: IPC + client (split per story)

- A: `praxis.notes.setAnnotations`, `praxis.notes.getAnnotations`.
- B: `praxis.library.search` (combined notes + flashcards).
- All envelope-wrapped; client methods peel.

### Unit 5: Tests

- A: annotation round-trip tests in `notes-service.test.ts`.
- B: per-filter tests + FTS-trigger tests + IPC harness tests.

## Implementation Order

Two parallel stories:

1. `epic-backend-fills-for-redesign-note-annotations-and-filters-annotations` —
   Units 1 + IPC (A) + tests.
2. `epic-backend-fills-for-redesign-note-annotations-and-filters-search-and-filters` —
   Units 2 + 3 + IPC (B) + tests.

They share `notes-service.ts` but their methods don't overlap — safe
to run in parallel.

## Acceptance Criteria

Aggregate (per-story criteria in the story bodies):

- [x] Annotations persist on notes; round-trip via the service API.
- [x] FTS5-backed search returns ranked results for note + flashcard
      bodies.
- [x] All four saved filters return correct sets against seeded
      fixtures.
- [x] All quality checks green.

## Risks

- **FTS5 triggers may run during heavy ingest.** Acceptable for
  expected note volume; if it becomes a hot path, switch to
  application-managed updates in `NotesService`.
- **`sessionId` backfill correctness.** Test the migration on a copy
  of dev data before shipping. If `contextJson` doesn't carry
  `sessionId` for older rows, leave them as NULL; the filter handles
  it gracefully.
- **Annotation range stability**: ranges become stale when the body
  is edited. v1 accepts this; story body documents the limitation
  and the editor can recompute or re-anchor in a follow-up.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none — the `dueOnly` FTS/non-FTS inconsistency was caught by the
  Story B review and triaged to
  `library-service-dueonly-fts-null-inconsistency` in `.work/backlog/`.
**Nits**:
- IPC-layer annotation schema does not cross-check `rangeStart < rangeEnd`
  (service layer handles it; callers get INTERNAL rather than VALIDATION_FAILED).
- `recentWindowMs` silently no-ops for flashcards (correct design, no comment).

**Notes**: Both child stories approved at their individual reviews. All
acceptance criteria met — annotations round-trip correctly, FTS5 tables and
triggers are in sync, all four saved filters tested, 71 feature-specific tests
green (39 service + 32 IPC). The triage backlog item for the `dueOnly`
inconsistency is properly filed. Pre-existing typecheck and lint errors in
unrelated UI files do not originate from this feature.
