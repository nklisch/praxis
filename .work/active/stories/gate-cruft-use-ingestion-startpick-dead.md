---
id: gate-cruft-use-ingestion-startpick-dead
kind: story
stage: done
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

## Implementation notes

- Removed `runIngestion` useCallback (~40 lines) and its section comment from `use-ingestion.ts`
- Removed `startPick` useCallback (~22 lines) and its section comment from `use-ingestion.ts`
- Made `confirmTier` unconditional: dropped the `else { // Single-file mode (legacy path) }` branch (~3 lines) and removed `runIngestion` from its deps array
- Removed `startPick` field from `UseIngestionResult` interface (1 line)
- Removed `startPick` from hook return object (1 line)
- Removed `describe("useIngestion — single-file (startPick)")` block from test file (~120 lines, 7 tests)
- Cleaned up stale JSDoc lines in test file header
- Pre-check: `grep -rn '\.startPick\b'` on packages/ returned zero production callers — confirmed
- Post-check: `grep -n 'startPick|runIngestion' use-ingestion.ts` returned zero hits
- Verification: `pnpm --filter @praxis/ui test --reporter=basic` → 163 test files, 1703 tests, all pass
- `pnpm --filter @praxis/ui typecheck` → clean

## Review

Verdict: **done**

- Zero production callers of `.startPick` confirmed across all packages (grep found only `startPickBatch`).
- `runIngestion` fully removed from `use-ingestion.ts`; `confirmTier` is now unconditional with a clean deps array (`[ingestOneWithResult]`).
- `startPick` field removed from `UseIngestionResult` interface and hook return object.
- Dead test block (`describe("useIngestion — single-file (startPick)")`, 7 tests) removed; remaining 11 batch-path tests pass.
- No nits. Clean removal with no loose ends.
