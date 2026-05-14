---
id: gate-security-ipc-server-raw-invoke-residuals
kind: story
stage: review
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: security
created: 2026-05-14
updated: 2026-05-14
---

# 13 raw invoke channels in `ipc-server.ts` still bypass envelope redactor

## Severity
Medium

## Domain
Data Protection

## Background

`feature-mutating-ipc-channels-envelope-migration` wrapped the majority of
invoke channels in `handleEnvelope`/`wrapEnvelope`, closing the original gap
documented in `gate-security-ipc-helpers-rethrow-redactor-gap`. However,
during post-migration verification 13 non-streaming invoke channels in
`packages/desktop/electron/main/ipc-server.ts` were found still using raw
`async (_event, ...) => { ... }` handlers without envelope wrappers.

If the underlying service throws (DB error, validation error, unexpected
exception), the raw error propagates to the renderer via IPC rejection
(`ipcRenderer.invoke` rejects with the error), potentially leaking internal
file paths, SQL details, or stack traces.

## Residual channels

| Line | Channel |
|------|---------|
| 101 | `praxis.session.start` |
| 339 | `praxis.documents.pageImage` |
| 610 | `praxis.assignments.list` |
| 619 | `praxis.assignments.recordResponse` |
| 1207 | `praxis.notes.create` |
| 1277 | `praxis.notes.list` |
| 1313 | `praxis.flashcards.create` |
| 1337 | `praxis.flashcards.update` |
| 1372 | `praxis.flashcards.list` |
| 1398 | `praxis.flashcards.review` |
| 1597 | `praxis.session.list` |
| 1606 | `praxis.sketches.put` |
| 1718 | `praxis.conceptMaps.updateScene` |

## Remediation

Wrap each channel using the `handleEnvelope` pattern (see
`ipc-channel-convention` and `ipc-envelope-handler` patterns):

```ts
handle(
  "praxis.notes.list",
  handleEnvelope(
    "praxis.notes.list",
    log,
    z.object({
      courseId: z.string().optional(),
      lessonId: z.string().optional(),
      format: z.enum(["cornell", "feynman", "outline", "free"]).optional(),
      limit: z.number().int().optional(),
    }).optional(),
    async (input) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.notes.list({ studentId, ...input });
    },
  ),
);
```

For channels with optional payloads, use `z.object({...}).optional()` or
`z.undefined()` as the schema. For channels with no input (`praxis.session.list`),
use `z.undefined()` or a permissive schema.

Note: the client-side callers in `@praxis/client` must be updated to use
`unwrapEnvelope` / `IpcError` where they currently `await ipc.invoke(...)`.
Check each channel's client counterpart before wrapping.

## Notes

- `praxis.session.start` is particularly important — it fires on every
  session open and could leak engine init errors including file paths or
  API key hints.
- `praxis.sketches.put` and `praxis.conceptMaps.updateScene` handle binary
  data (base64 image, TlDraw snapshot) — schema validation can be light
  (`z.object({...})` with `z.unknown()` for opaque fields) to avoid
  performance overhead.
- `praxis.documents.pageImage` returns `string | null` (base64); wrapping
  it means the client receives `IpcEnvelope<string | null>` — update
  `documents-client.ts` accordingly.

## Implementation

All 13 residual channels wrapped in one batch (2026-05-14):

**Server-side** (`packages/desktop/electron/main/ipc-server.ts`):
- `praxis.session.start` — `handleEnvelope` + `sessionStartSchema` (`{ modeId, courseId?, assignmentId? }`)
- `praxis.documents.pageImage` — `handleEnvelope` + `pageImageSchema` (`{ documentId, page }`)
- `praxis.assignments.list` — `handleEnvelope` + `assignmentListSchema` (`{ courseId, kind? }`)
- `praxis.assignments.recordResponse` — `handleEnvelope` + `recordResponseSchema`
- `praxis.notes.create` — `handleEnvelope` + `noteCreateSchema` (format + body + optional context)
- `praxis.notes.list` — `handleEnvelope` + `noteListSchema` (optional filter object)
- `praxis.flashcards.create` — `handleEnvelope` + `flashcardCreateSchema`
- `praxis.flashcards.update` — `handleEnvelope` + `flashcardUpdateSchema`
- `praxis.flashcards.list` — `handleEnvelope` + `flashcardListSchema` (optional filter)
- `praxis.flashcards.review` — `handleEnvelope` + `flashcardReviewSchema` (`{ flashcardId, rating }`)
- `praxis.session.list` — `handleEnvelope` + `sessionListSchema` (optional `{ includeEnded, limit }`)
- `praxis.sketches.put` — `handleEnvelope` + `sketchPutSchema` (snapshot opaque, imageBase64 string)
- `praxis.conceptMaps.updateScene` — `handleEnvelope` + `conceptMapUpdateSceneSchema` (scene + links opaque)

**Client-side** (each updated to `unwrapEnvelope`):
- `packages/client/src/services/session-client.ts` — `start()`, `list()`
- `packages/client/src/services/documents-client.ts` — `pageImage()`
- `packages/client/src/services/assignments-client.ts` — `list()`, `recordResponse()`
- `packages/client/src/services/notes-client.ts` — `create()`, `list()`
- `packages/client/src/services/flashcards-client.ts` — `create()`, `update()`, `list()`, `review()`
- `packages/client/src/services/sketch-client.ts` — `put()`
- `packages/client/src/services/concept-map-client.ts` — `updateScene()`

**Tests**: 22 new tests in `packages/desktop/electron/main/__tests__/residual-channel-envelope.test.ts` covering 5 representative channels (session.start, session.list, assignments.list, flashcards.create, conceptMaps.updateScene) — success + validation-failure + INTERNAL paths.

**Final grep**: zero raw `async (_event, ...) => {}` invoke handlers remain. The only remaining raw handlers are the 2 streaming `.start` channels (`praxis.session.send.start`, `praxis.auth.claude.login.start`) which push events via separate channels — intentionally raw by design.

**Verification**: `pnpm typecheck && pnpm lint && pnpm test` all green (421 desktop tests, 62 client tests).
