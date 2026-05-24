---
id: gate-cruft-use-ingestion-startpick-dead
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

# Dead single-file ingestion path: `startPick` + `runIngestion` have no production callers

## Confidence
High

## Category
dead function

## Location
`packages/ui/src/hooks/use-ingestion.ts:208-272`
(and `startPick` return-key at `:470`, type at `:43`)

## Evidence
```ts
// ── runIngestion (used by single-file startPick path) ───────────────────────
const runIngestion = useCallback(...)
// ── Single-file startPick (unchanged public API) ─────────────────────────────
const startPick = useCallback(async () => { ... }, [client, runIngestion]);
```

## Verification
`grep -rn '\.startPick\b' ... | grep -v __tests__` returns zero
production callers. Every production caller of `useIngestion` uses
`startPickBatch` (`library-document-picker.tsx:90`, `course-create.tsx:150`,
`AddDocumentButton`). The only callers of `startPick` are inside
`use-ingestion.test.tsx`. `runIngestion` is referenced only by
`startPick` and the dead `else` branch in `confirmTier` (lines 286-290,
"Single-file mode (legacy path)"), which is unreachable once `startPick`
is removed because batch flow always sets `tierDeferredRef.current`
before raising `tier_selection`.

## Removal
- Drop `runIngestion` (lines 208-247)
- Drop `startPick` (lines 251-272)
- Drop the legacy `else` branch in `confirmTier` (lines 287-290) so it
  becomes unconditional
- Drop the `startPick` member from `UseIngestionResult` (line 43)
- Drop the `startPick` return key (line 470)
- Update `use-ingestion.test.tsx` to drop the
  `describe("useIngestion — single-file (startPick)")` block
  (lines 75-194)
