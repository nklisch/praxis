# Server-Resolved StudentId in IPC Handlers

For any IPC channel whose service method requires a `studentId`, the
channel handler resolves it server-side via `getStudentId(services)` (a
one-line `brandId<"StudentId">(services.getDefaultStudentId())`) rather
than accepting it from the renderer's payload. The renderer-facing Zod
schema does not even declare a `studentId` field.

## Rationale

Praxis is single-tenant (one student per install); the active `studentId`
is owned by the main process. Letting the renderer pass `studentId` in
the payload would create a trust gap — a misbehaving renderer or test
page could read another student's data by spoofing the ID. The
convention is enforceable by absence: the schema doesn't include
`studentId`, so it can't arrive over IPC, and the handler always derives
it from `services.getDefaultStudentId()`. Adding a new channel that needs
`studentId` is a one-liner (`const studentId = getStudentId(services)`);
the helper centralizes the brand cast in one place
(`packages/desktop/electron/main/student-id.ts`).

## Examples

### Example 1: spawnFromNote — comment explicitly cites the convention

**File**: `packages/desktop/electron/main/session-channel.ts:113`

```typescript
// Spawn a teach session pre-loaded with a note's cue context.
// studentId is resolved server-side (consistent with all notes.* channels).
handle(
  "praxis.session.spawnFromNote",
  handleEnvelope("praxis.session.spawnFromNote", log, SpawnFromNoteSchema, async (opts) => {
    const studentId = getStudentId(services);
    return services.session.spawnFromNote({
      studentId,
      noteId: brandId<"NoteId">(opts.noteId) as NoteId,
      ...(opts.cueId !== undefined && { cueId: opts.cueId }),
    });
  }),
);
```

### Example 2: notes.create — schema has no `studentId`

**File**: `packages/desktop/electron/main/notes-channel.ts:39`

```typescript
handle(
  "praxis.notes.create",
  handleEnvelope("praxis.notes.create", log, notesCreateSchema, async (opts) => {
    const studentId = getStudentId(services);
    return services.notes.create({ studentId, ...opts });
  }),
);
```

### Example 3: concept-maps.list

**File**: `packages/desktop/electron/main/concept-maps-channel.ts:43`

```typescript
handle(
  "praxis.conceptMaps.list",
  handleEnvelope("praxis.conceptMaps.list", log, listSchema, async (opts) => {
    const studentId = getStudentId(services);
    return services.conceptMaps.list({ studentId, ...opts });
  }),
);
```

Also: `tabs-channel.ts:30,47,78,98`, `sketches-channel.ts:28`,
`document-scopes-channel.ts:24`, `author-channel.ts:434,471,488`,
`recommendations-channel.ts:32` — 14 handler files, 20+ call sites total.
The shared helper:

**File**: `packages/desktop/electron/main/student-id.ts:5`

```typescript
export function getStudentId(services: Services): StudentId {
  return brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
}
```

## When to Use

- The service method takes a `studentId: StudentId` parameter (almost
  always).
- The action is per-student rather than global (notes, sketches,
  sessions, tabs, recommendations).

## When NOT to Use

- Global config channels (`praxis.config.*`, `praxis.lock.*`) — they
  don't bind to a student.
- Read channels for cross-student admin reporting (currently none in
  Praxis; would need an explicit auth check anyway).

## Common Violations

- Declaring `studentId: z.string()` in the Zod schema and forwarding
  `opts.studentId` to the service — accepts spoofed IDs from the
  renderer.
- Inlining `brandId<"StudentId">(services.getDefaultStudentId())`
  instead of calling `getStudentId(services)` — fine functionally but
  skips the centralized helper, so a future change to default-student
  resolution has to find every site.
