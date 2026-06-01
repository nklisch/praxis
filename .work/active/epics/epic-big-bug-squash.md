---
id: epic-big-bug-squash
kind: epic
stage: done
tags: [bug]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Big bug squash

## Brief

Collect and burn down the repo-wide correctness findings from the 2026-06-01
bug scan as one focused stability push. The scan found one critical, eight
high, eighteen medium, and seven low deduped issues across async cancellation,
session concurrency, ingestion/indexing consistency, grading and gate math,
SQLite/FTS query behavior, and TypeScript/JSON edge cases.

This epic is an organizing parent for already-scoped concrete bug stories. Each
child story keeps the original scan evidence, severity, domain, location, and
remediation direction. Work should generally proceed in severity order, starting
with the Pyodide timeout critical and the high-severity concurrency/data-layer
items before moving into medium and low polish.

## Child stories

Decomposition pre-existed: this epic already has 34 direct child stories from
the bug-scan scope pass. The existing story set is coherent for this bug-squash
epic because each child is a concrete, independently actionable bug finding with
preserved severity, domain, location, and remediation direction. No child
feature layer was added in this design pass.

### Critical

- `bug-scan-pyodide-timeout-keeps-running`

### High

- `bug-scan-assignment-submit-race`
- `bug-scan-auth-modal-leaves-cli-running`
- `bug-scan-concurrent-engine-send-corrupts-turn`
- `bug-scan-double-send-bypasses-queue`
- `bug-scan-empty-gate-threshold-zero`
- `bug-scan-half-indexed-ingested-doc`
- `bug-scan-ipc-stream-startup-hangs`
- `bug-scan-pack-import-skips-embeddings`

### Medium

- `bug-scan-bkt-weight-extrapolates`
- `bug-scan-concept-map-stale-concepts`
- `bug-scan-draft-stream-unhandled-reject`
- `bug-scan-gate-unlock-duplicates`
- `bug-scan-ingestion-activity-stuck`
- `bug-scan-matching-grader-over-100`
- `bug-scan-pdf-page-keeps-old-image`
- `bug-scan-post-turn-indexer-overlap`
- `bug-scan-query-sessionid-hangs`
- `bug-scan-raw-fts-query-crashes`
- `bug-scan-session-end-reruns-indexers`
- `bug-scan-spawned-pid-race`
- `bug-scan-stream-hooks-leak-subscriptions`
- `bug-scan-subagent-callid-collision`
- `bug-scan-tool-result-json-stringify`
- `bug-scan-tool-result-value-unwrapped`
- `bug-scan-vector-search-post-filters`
- `bug-scan-zero-gate-threshold-nan`

### Low

- `bug-scan-auth-status-shape-trusted`
- `bug-scan-feynman-annotations-unhandled`
- `bug-scan-invalid-workspace-tab-blank`
- `bug-scan-pasted-filename-utc-date`
- `bug-scan-pasted-temp-file-leak`
- `bug-scan-relative-day-label-wrong`
- `bug-scan-tool-server-tempdir-leak`

## Notes

- Source report: `bug-scan-report.md`
- No foundation-doc roll-forward: this is corrective work against existing
  behavior, not a new product or architecture direction.

## Implementation notes

- All 34 direct child bug-scan stories reached `stage: done`.
- Story reviews used the review fast lane: implementation records were present,
  and each story was approved with no blockers, important findings, or nits.
- Integration stabilization follow-up was committed in
  `4e592ba1` (`implement: stabilize bug-squash integration verification`) after
  the first full-suite pass exposed pack-import idempotency and exact optional
  type issues across the combined wave.
- Verification:
  - `TMPDIR=$PWD/.tmp pnpm typecheck` passed.
  - `TMPDIR=$PWD/.tmp pnpm test` passed: 489 files, 5439 tests; 3 files skipped.
  - Targeted `pnpm exec biome check` over the touched-code set passed with
    non-blocking warnings in already-touched Claude SDK files.

## Children complete (2026-06-01)

All direct child stories are done, so the epic is ready for deep review.

## Review (2026-06-01)

**Verdict**: Approve with comments

**Blockers**: none
**Important**: none
**Nits**: full `pnpm lint` remains blocked by pre-existing `.mockups` HTML diagnostics outside this epic scope; targeted Biome over touched code passed with non-blocking warnings.

**Notes**: Deep epic review used Claude Opus via peeragent session `14d87427-0961-4ae3-8f72-db29dc19d06f`. The peer confirmed all 34 child stories are terminal, the bug-scan counts match the epic scope, no `bug-scan-*` backlog/archive orphan remained, no public API or foundation-doc blocker was found, and no files were modified by the peer. Accepted finding: epic `updated` metadata was corrected in `e3ac5a6c`. Rejected finding: broader date-skew concern conflicts with the active system date for this run, `2026-06-01`. Process limitation recorded: stories used fast-lane review backed by implementation records, targeted tests, `typecheck`, and the green full suite.
