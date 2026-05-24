---
id: gate-tests-rework-cancelbatch-weak-oracle
kind: story
stage: review
tags: [testing, refactor]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-24
---

# `cancelBatch` test has a race-tolerant assertion that hides bugs

## Priority
Medium (test-integrity)

## Spec reference
File: `packages/ui/src/__tests__/use-ingestion.test.tsx:384-427`
(touched by `story-inline-upload-in-attach-from-library`)

The `cancelBatch` test currently asserts
`expect(result.current.state.results.length).toBeLessThanOrEqual(2)`
which holds for any value 0/1/2 — a real bug producing 0 or 1 results
would still pass. The strong assertion
`expect(startFn).toHaveBeenCalledTimes(1)` is the only load-bearing
one.

## Gap type
tautological-rework / weak-oracle

## Suggested fix
Restructure the test to deterministically pause `startFn` for file 1,
then call `cancelBatch`, then assert exactly: one result for `a.txt`
with `outcome.ok === true`, and no entries for `b.pdf` or `c.txt`.
This isolates the race and tightens the oracle.

## Test location (suggested)
`packages/ui/src/__tests__/use-ingestion.test.tsx:384-427`

## Implementation notes

Replaced the weak-oracle `cancelBatch` test in
`packages/ui/src/__tests__/use-ingestion.test.tsx`.

**Old shape:**
- 3 files: `a.txt` (non-PDF), `b.pdf` (PDF → tier_selection), `c.txt`
- Cancelled while waiting at tier_selection for `b.pdf`
- Result assertion: `results.length <= 2` — tautological (0, 1, or 2 all pass)
- Only load-bearing check was `startFn.toHaveBeenCalledTimes(1)`

**New shape:**
- Same 3-file layout, same cancel trigger point (tier_selection for `b.pdf`)
- `startFn` simplified to `mockReturnValue(makeDoneStream("doc-a"))` — no
  call-count closure needed since `b.pdf` uses the tier-selection path (no
  `startFn` call until `confirmTier` is invoked, which never happens)
- After `cancelBatch()` + `batch_summary` transition:
  - `results.toHaveLength(1)` — exactly one entry
  - `results[0].filePath === "/docs/a.txt"` — correct file
  - `results[0].outcome.ok === true` — succeeded
  - `startFn.toHaveBeenCalledTimes(1)` — b.pdf never started (strong oracle)

**Design-flaw check:** No escape hatch needed. Traced `cancelBatch()` through
`_startBatch`: for non-PDF files the `await ingestOneWithResult` is not raced
against the cancel promise — but that path completes before cancel is
called (a.txt finishes naturally). The cancel fires while the loop is blocked
on `Promise.race([tierDeferred.promise, cancelPromise])` for b.pdf; both sides
of that race resolve simultaneously, `cancelRequestedRef` is true → break.
Result accumulator holds only a.txt's result. No bug found; test passes
deterministically.

All 164 @praxis/ui test files pass (1711 tests, 1 skipped).
