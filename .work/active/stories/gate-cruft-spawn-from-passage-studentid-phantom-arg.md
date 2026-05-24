---
id: gate-cruft-spawn-from-passage-studentid-phantom-arg
kind: story
stage: implementing
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: cruft
created: 2026-05-23
updated: 2026-05-23
---

# `studentId` parameter on `SessionClient.spawnFromPassage` is silently dropped

## Confidence
High

## Category
dead function parameter / phantom API surface

## Location
`packages/client/src/services/session-client.ts:87-97`
(also `packages/core/src/types/session-client.ts:66-70`)

## Evidence
```ts
async spawnFromPassage(input: {
  studentId?: StudentId;
  documentId: DocumentId;
  range: { startOffset: number; endOffset: number };
}): Promise<SessionHandle> {
  const result = await this.transport.invoke<IpcEnvelope<SessionHandle> | SessionHandle>(
    `${CHANNEL}.spawnFromPassage`,
    { documentId: input.documentId, range: input.range }, // studentId NOT forwarded
  );
```

## Verification
The IPC schema (`session-channel.ts:125-135`) does not accept
`studentId`; the handler resolves it server-side via
`getStudentId(services)`. The only UI caller
(`document-tab-body.tsx:261`) never passes `studentId`. The field is in
the signature but unreachable across the wire.

## Removal
- Drop `studentId?: StudentId` from the input type in
  `session-client.ts:88`
- Drop the unused `StudentId` import on line 12 if no longer referenced
- Align the matching `SessionService.spawnFromPassage` declaration in
  `packages/core/src/types/session-client.ts:66-70` — it advertises
  `studentId?` but no client surface needs it (server-side resolver
  runs inside the service)
