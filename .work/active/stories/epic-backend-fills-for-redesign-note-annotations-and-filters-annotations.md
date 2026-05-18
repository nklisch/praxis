---
id: epic-backend-fills-for-redesign-note-annotations-and-filters-annotations
kind: story
stage: implementing
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
