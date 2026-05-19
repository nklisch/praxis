---
id: gate-cruft-ingest-pickfile-back-compat-comment
kind: story
stage: done
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: cruft
created: 2026-05-18
updated: 2026-05-18
---

# "back-compat" comment on `praxis.ingest.pickFile` is stale — channel is current

## Confidence
Medium

## Category
legacy-comment

## Location
`packages/desktop/electron/main/ingest-channel.ts:74`

## Evidence
```ts
// File picker (single-file, kept for back-compat with existing callers)
handle(
  "praxis.ingest.pickFile",
  wrapEnvelope("praxis.ingest.pickFile", log, async () => { /* ... */ }),
);
```

Both `client.ingest.pickFile()` in `use-ingestion.ts:248` and in
`routes/library.tsx:343` are first-class current calls — single-file picker is
the primary path from the document-import affordance; multi-file is a separate
channel. The "kept for back-compat" framing is wrong.

## Removal
Replace the comment with a neutral description ("Single-file picker — used by
the document-import flow.") or delete the explanatory comment entirely.
Praxis convention (CLAUDE.md) forbids `// kept for back-compat` framing.

## Implementation notes (2026-05-18)

`packages/desktop/electron/main/ingest-channel.ts:74`: replaced
`// File picker (single-file, kept for back-compat with existing callers)`
with `// Single-file picker — used by the document-import affordance.`.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Single-line comment replacement exactly as specified. Batched with two other trivial items in commit ab72ab4. Comment now correctly reflects current usage.
