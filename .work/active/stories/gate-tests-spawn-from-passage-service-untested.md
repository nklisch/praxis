---
id: gate-tests-spawn-from-passage-service-untested
kind: story
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-18
---

# `SessionService.spawnFromPassage` end-to-end behavior is untested at the service level

## Priority
Critical

## Spec reference
Item: `epic-backend-fills-for-redesign-document-viewer-citations-and-spawn`

Acceptance criterion: "`spawnFromPassage` opens a session with the passage in
the agent's opening context." Story body: "verifies document ownership,
reconstructs full text from `documentChunks` ordered by `chunkIndex`, slices
the passage, opens a teach session, attaches the document scope with the
range, and fire-and-forgets the opening message."

The IPC envelope test in
`packages/desktop/electron/main/__tests__/spawn-from-note-channel-envelope.test.ts:382-452`
mocks `spawnFromPassage = vi.fn().mockResolvedValue(...)` entirely. The
ownership check, chunk-text reconstruction, range slicing, and scope attach
are never exercised. `grep spawnFromPassage packages/core/src/services/__tests__/`
returns zero hits.

## Gap type
missing test for acceptance criterion

## Suggested test
```ts
// packages/core/src/services/__tests__/session-service.spawn-from-passage.test.ts (new)
it("creates a teach session and attaches a session-scoped passage range", async () => {
  const studentId = seedStudent(db);
  const docId = seedDocumentWithChunks(db, studentId, ["chunk one text", "chunk two text"]);
  const handle = await svc.spawnFromPassage({
    studentId, documentId: docId, range: { startOffset: 6, endOffset: 9 },
  });
  expect(handle.modeId).toBe("teach");
  const range = await documentScopes.getPassageRange({
    scope: { kind: "session", id: handle.sessionId }, documentId: docId,
  });
  expect(range).toEqual({ startOffset: 6, endOffset: 9 });
});

it("throws Document not found when documentId is unknown or owned by a different student", async () => {
  await expect(svc.spawnFromPassage({ studentId, documentId: brandId("doc-other"), range: { startOffset: 0, endOffset: 5 } }))
    .rejects.toThrow(/Document not found/);
});

it("clamps an out-of-bounds endOffset to document length (no crash, opens session)", async () => {
  // seed a 30-char document; pass range 0..999; expect session opens; range stored verbatim or clamped per current behavior
});
```

## Test location (suggested)
`packages/core/src/services/__tests__/session-service.spawn-from-passage.test.ts` (new)

## Implementation notes (2026-05-18)

Created `packages/core/src/services/__tests__/session-service.spawn-from-passage.test.ts` with 4 tests covering:

1. **Happy path** — seeds a student + document with two chunks, calls `spawnFromPassage`, verifies `handle.modeId === "teach"` and that `documentScopes.getPassageRange` returns the exact range passed.

2. **Document not found (unknown id)** — bogus `documentId` rejects with `/Document not found/`.

3. **Document not found (wrong student)** — document exists but owned by a different `studentId`; query finds nothing and rejects with `/Document not found/`.

4. **Out-of-bounds endOffset** — confirms the session opens without error (no crash). 

### Implementation discovery: range stored verbatim, not clamped

`spawnFromPassage` clamps the range only for extracting `passageText` (the opening message body). The `passageRange` stored in `document_scopes` via `documentScopes.attach(...)` is `input.range` verbatim. Test 4 asserts `range === { startOffset: 0, endOffset: 999 }` — i.e. the original out-of-bounds value is stored. This is the current behavior; the document viewer is responsible for clamping on display. No defect raised — the behavior is consistent with the code comment "clamp to document bounds" applying only to text extraction.

### Setup pattern

- Real `SessionServiceImpl` + real (temp) DB via `useTempDb()`
- Real `DocumentScopesServiceImpl` wired into `toolServices.documentScopes` (other fields stub-cast via `as any`)
- `FakeEngine` injected via `engineFactory` to make `start()` + `send()` work without a live LLM
- `noopLockService()` + `inMemorySecretStorage()` from `tests/helpers/mocks.ts`
- `insertDocumentWithChunks` helper inserts a `documents` row + N `documentChunks` rows in chunk-index order

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: 4 tests exercise real SessionServiceImpl + real DocumentScopesServiceImpl + FakeEngine via injection seam. Happy path verifies modeId:teach + passageRange stored. Document-not-found (unknown id) and (wrong student) covered. Out-of-bounds range behavior documented (verbatim storage) — honest discovery, not a defect. No tautological assertions.
