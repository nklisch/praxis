---
id: gate-tests-rework-cancelbatch-weak-oracle
kind: story
stage: drafting
tags: [testing, refactor]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
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
