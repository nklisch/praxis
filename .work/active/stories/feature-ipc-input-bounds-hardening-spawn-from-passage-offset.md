---
id: feature-ipc-input-bounds-hardening-spawn-from-passage-offset
kind: story
stage: review
tags: [security]
parent: feature-ipc-input-bounds-hardening
depends_on: []
release_binding: null
gate_origin: security
created: 2026-05-23
updated: 2026-05-23
---

# `spawnFromPassage` has no upper bound on `endOffset`; slices full document text per call

## Severity
Low — from gate-security on release v0.1.4 (pre-existing surface; not
introduced by bundle, but the citation-schema sister fix shipped this
release made it worth flagging).

## Domain
Input Validation & Injection / Data Protection (self-DoS knob)

## Location
- `packages/desktop/electron/main/session-channel.ts:127-135`
- `packages/core/src/services/session-service.ts:802-814`

## Evidence
```ts
range: z.object({
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
}).refine((r) => r.endOffset >= r.startOffset, { ... })
```
```ts
const fullText = chunkRows.map((c) => c.text).join("\n\n");
const safeStart = Math.max(0, Math.min(input.range.startOffset, fullText.length));
const safeEnd = Math.max(safeStart, Math.min(input.range.endOffset, fullText.length));
```

## Remediation direction
Cap `endOffset` (`z.number().int().nonnegative().max(MAX_OFFSET)`) and/or
cap the resulting passage length before injecting into the opening
message. Service-side clamp is safe today but every call still loads and
concatenates the entire document text into memory. In a local Electron
app this is at worst a self-DoS knob.

## Implementation notes

**Schema cap** (`session-channel.ts`): Added `MAX_PASSAGE_OFFSET = 10_000_000` constant with a
rationale comment. Applied `.max(MAX_PASSAGE_OFFSET)` to both `startOffset` and `endOffset` in
`SpawnFromPassageSchema`. Any offset > 10M chars is rejected at the IPC boundary with
`VALIDATION_FAILED`.

**Service-side passage cap** (`session-service.ts`): After the existing document-bound clamp,
added `MAX_PASSAGE_LENGTH = 100_000`. The clamped end is further capped at
`safeStart + MAX_PASSAGE_LENGTH` before text is sliced into the opening message. This means even
if a caller sends a valid (within 10M) but wide range, the injected passage is bounded at 100k
chars — well under any model context window but generous for any real textbook passage.

**Log signal**: `this.deps.log.warn("spawn_from_passage.passage_truncated", { documentId,
requestedLength, cappedLength })` fires when the passage-length cap actually truncates. No warn
when the document-bound clamp applies (that's normal clamping, not a pathological case).

**Tests added**:
- `spawn-from-note-channel-envelope.test.ts`: new IPC schema test — `endOffset: 10_000_001`
  returns `VALIDATION_FAILED` (fails without the `.max()` bound).
- `session-service.spawn-from-passage.test.ts`: new service test — document with ~102k chars of
  text, requesting the full range; verifies session opens, warn is emitted, and `cappedLength` is
  100_000 (fails without the passage-length cap).

All 12 `spawnFromPassage`-related tests pass. The 1 pre-existing test failure in
`empty-session-cleanup-e2e.test.ts` is unrelated (different student-ID collision in a different
method).
