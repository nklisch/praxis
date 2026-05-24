---
id: feature-ipc-input-bounds-hardening-spawn-from-passage-offset
kind: story
stage: implementing
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
