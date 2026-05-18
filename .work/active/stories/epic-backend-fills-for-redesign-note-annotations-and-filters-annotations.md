---
id: epic-backend-fills-for-redesign-note-annotations-and-filters-annotations
kind: story
stage: done
tags: []
parent: epic-backend-fills-for-redesign-note-annotations-and-filters
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Note annotations — schema + service API + IPC

## Scope

Sub-feature A from the parent feature: selection-anchored note
annotations.

- Add `annotations_json` column to `notes`.
- Add `Annotation` type.
- Add `NotesService.setAnnotations` / `getAnnotations` methods.
- Add `praxis.notes.setAnnotations` / `praxis.notes.getAnnotations`
  IPC channels + client methods.
- Round-trip tests.

See parent feature
`.work/active/features/epic-backend-fills-for-redesign-note-annotations-and-filters.md`.

## Implementation steps

1. Schema:
   - Edit `packages/artifacts/src/schema.ts` to add
     `annotationsJson: text("annotations_json", { mode: "json" })`
     (nullable) on `notes`.
   - `pnpm db:generate` → produce migration SQL.
   - Verify migration applies via `pnpm db:reset`.

2. Types:
   - New `Annotation` type in
     `packages/core/src/types/notes.ts`:
     ```ts
     export interface Annotation {
       rangeStart: number;
       rangeEnd: number;
       text: string;
       severity: "soft" | "load_bearing";
     }
     ```
   - Re-export.

3. Service:
   - `NotesService.setAnnotations(noteId, annotations: Annotation[]): Promise<void>`
     — writes (replaces) the annotations array.
   - `NotesService.getAnnotations(noteId): Promise<Annotation[]>` —
     reads, returns `[]` if NULL.
   - Validate ranges: `rangeStart < rangeEnd`, both non-negative.
     Refuse out-of-range values.

4. IPC + client:
   - Channels `praxis.notes.setAnnotations`,
     `praxis.notes.getAnnotations` via the existing notes channel
     module (or split into a new file if convention prefers).
   - Client methods on `praxisClient.notes`.

5. Tests:
   - Round-trip set → get → assert deep-equal.
   - Validation: bad ranges rejected.
   - IPC harness for both channels.

6. Quality checks green.

## Acceptance criteria

- [ ] `annotations_json` column added, migration applies cleanly.
- [ ] `Annotation` type exported and consumed by the new service
      methods.
- [ ] `setAnnotations` validates and replaces; `getAnnotations` reads
      (empty array for unset notes).
- [ ] IPC + client round-trip tested.
- [ ] All quality checks green.

## Out of scope

- Re-anchoring on body edits — accept the limitation; flag in v1.
- The editor UI consuming this — lives in the workspace feature.

## Implementation notes

All acceptance criteria met.

**Schema**: Added `annotationsJson: text("annotations_json", { mode: "json" })` (nullable)
to the `notes` table in `packages/artifacts/src/schema.ts`. Migration `drizzle/0021_common_iron_man.sql`
is a single `ALTER TABLE notes ADD annotations_json text;` — applied cleanly via `pnpm db:reset`.

**Type**: `Annotation` interface added to `packages/core/src/types/notes.ts` at the top of the file,
re-exported via the existing `export * from "./notes.js"` in `packages/core/src/types/index.ts`. Also
imported into `packages/core/src/types/client.ts` and `packages/core/src/types/tool.ts` for the new
interface methods.

**Service**: `setAnnotations` and `getAnnotations` added to:
- `NotesService` interface in `packages/core/src/types/tool.ts`
- `NotesClient` interface in `packages/core/src/types/client.ts`
- `NotesServiceImpl` in `packages/core/src/services/notes-service.ts`

`setAnnotations` validates all ranges up front (non-negative integers, `rangeStart < rangeEnd`) before
writing; throws a clear error describing the failing range. `getAnnotations` returns `[]` when the
column is NULL or when the note doesn't exist for the student.

**IPC**: `praxis.notes.setAnnotations` and `praxis.notes.getAnnotations` added inline in
`packages/desktop/electron/main/ipc-server.ts` next to the existing notes channels, following the
`handleEnvelope` pattern. Zod schema for annotations validates at the IPC boundary (integer, nonnegative,
correct enum).

**Client**: `NotesClientImpl` in `packages/client/src/services/notes-client.ts` extended with both
methods.

**Tests**:
- 9 new service tests in `packages/core/src/__tests__/notes-service.test.ts` — round-trip, replace,
  clear, unknown-id, and 4 validation rejection cases.
- 9 new IPC harness tests in `packages/desktop/electron/main/__tests__/notes-flashcards-channel-envelope.test.ts`
  — success paths, validation failures, and INTERNAL propagation for both channels.
- Updated `makeServices` stubs in the notes-flashcards test file and partial stubs in
  `packages/tools/src/flashcards/__tests__/from-note.test.ts` and
  `packages/tools/src/notes/__tests__/create.test.ts`.

**v1 limitation noted**: Annotations are character-offset based. If the note body is edited,
existing offsets may become stale. Re-anchoring is explicitly out of scope for v1; the comment
in `Annotation`'s JSDoc flags this for future work.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `annotationSchema` in `ipc-server.ts` validates non-negative integers but not `rangeStart < rangeEnd`. The service layer enforces this correctly so correctness is preserved; adding a `.refine()` at the IPC layer would give callers an earlier VALIDATION_FAILED instead of INTERNAL.
- No test for `setAnnotations` against an unknown note ID (silent no-op). Consistent with `delete` behavior; acceptable for v1.

**Notes**: All acceptance criteria met. Schema, type, service validation, IPC envelope wiring, client methods, and 18 total new tests (9 service + 9 IPC harness) are clean. The `as Annotation[]` cast in `getAnnotations` is consistent with all other `{ mode: "json" }` columns in the schema. The v1 stale-offset limitation is correctly documented in JSDoc.
