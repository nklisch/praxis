---
id: gate-tests-spawn-from-passage-service-untested
kind: story
stage: implementing
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
