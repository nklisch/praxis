---
id: epic-test-coverage-adversarial-pass
kind: epic
stage: drafting
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Adversarial test-coverage pass — close the gate-tests findings from v0.1.1

## Brief

The v0.1.1 release ran an adversarial test-coverage gate that scanned every
bound feature's acceptance criteria and looked for gaps where the suite
would silently miss a regression. It produced **seven findings**, each
documenting a specific behavior pinned by a spec but not actually exercised
by any test. Examples: `cancel()` is documented as idempotent across all
hook states, but only the `cancel-before-send` state has a test;
`tryChunkBySlide` has a `toText` fallback covered only by a mock-AST unit
test with no real-fixture sanity check; the update-banner installer-hash
display contract is documented but not asserted.

These are the worst kind of test debt: they look fine on the dashboard
(coverage % stays green), but a regression in any of them lands with no
red-line warning. This epic bundles all seven into one pass so we close
them under shared design pressure (which tests are unit vs. integration?
which need fixtures? what's the consistent shape for adversarial
spec-silent tests?) rather than triaging each one separately.

## Scope absorbed from backlog

All seven `gate-tests-*` items in `.work/backlog/`, each scoped to a
specific parent item's acceptance criterion:

- `gate-tests-cancel-idempotency-after-final` — `cancel()` no-op across
  more states (after-final, double-cancel, during-loadHistory).
  Parent: `epic-bootstrap-readiness-in-flight-affordances`.
- `gate-tests-draft-store-rapid-save-ordering` — SqliteDraftStore rapid
  back-to-back save() ordering not adversarially tested.
  Parent: `epic-bootstrap-readiness-durable-drafts`.
- `gate-tests-engine-id-rename-no-key-unavailable-storage` — engineId
  rename round-trip with no apiKey + unavailable safeStorage.
  Parent: `epic-v1-security-hardening-encrypt-api-key`.
- `gate-tests-image-cross-chunk-boundary` — image markdown straddling a
  chunk boundary — contract is silent.
  Parent: `feature-powerpoint-ingestion-embedded-images`,
  `feature-docx-ingestor-cleanup`.
- `gate-tests-pptx-slide-fallback-real-fixture` — `tryChunkBySlide`
  fallback to `ast.toText()` has only mock-AST coverage.
  Parent: `feature-powerpoint-ingestion-text-extraction`.
- `gate-tests-sub-agent-collision-warn-log` — sub-agent `parentCallId`
  collision: silent-no-op vs. warn-log contract unpinned.
  Parent: `feature-agent-transparency-ux-subagent-channel`.
- `gate-tests-update-banner-installer-hash-display` — update-feed
  installer hash UI display contract not pinned.
  Parent: `epic-v1-security-hardening-sign-update-feed`.

## Anchors (current implementation)

The items touch many code areas — there isn't a single anchor file. The
test files involved are:

- `packages/ui/src/__tests__/use-streamed-send.test.tsx`
- `packages/core/src/__tests__/draft-store.test.ts`
- `packages/core/src/__tests__/engine-config.test.ts`
- `packages/tools/src/runtime/ingestion/__tests__/docx-ingestor.test.ts`
- `packages/tools/src/runtime/ingestion/__tests__/pptx-ingestor*.test.ts`
- `packages/ui/src/__tests__/sub-agent-registry.test.ts` (or wherever the
  registry tests live)
- `packages/ui/src/__tests__/update-banner.test.tsx`

Plus possibly a new PPTX fixture under `packages/tools/test-fixtures/` for
the `tryChunkBySlide` fallback path.

## Why now

Each finding is small in isolation but they share two structural
questions that benefit from one design pass:

1. **Where does spec-silent behavior get pinned — in a test name comment,
   in a doc note, or in a runtime assertion?** Two of the seven items
   (`sub-agent-collision-warn-log`, `pptx-slide-fallback-real-fixture`)
   explicitly call out this fork. Deciding once is cheaper than seven
   times.
2. **Real-fixture vs. mock-AST coverage** — the PPTX fallback item is the
   sharp end of a broader question about how much our ingestion test
   suite trusts mocks. Worth answering with the cluster, not solo.

Bundling also gives us autopilot parallelism: most of these are 1–2 hour
test additions with no shared state, so a single epic-design + 7 child
stories in 2–3 waves is the cheapest path.

## Decomposition direction (for epic-design)

Likely splits into child features by area, not by item:

- **Ingestion test gaps** — image-cross-chunk-boundary + pptx-slide-fallback.
- **Cancellation + draft-store edge cases** — cancel-idempotency +
  draft-store-rapid-save.
- **IPC / config edge cases** — engineId-rename-unavailable-storage.
- **UI assertion gaps** — update-banner-hash + sub-agent-collision.

Or possibly flatter — 7 child stories directly under the epic — given
each item is already a self-contained story with evidence and a
suggested test. Epic-design picks the shape.

## Decomposition risks

- **The cluster doesn't share a capability arc** — these items don't
  thematically belong together except as "v0.1.1 gate-tests output."
  Risk: design phase produces 7 disconnected stories with no shared
  abstraction win. Mitigation: that's actually fine — the win is
  scheduling parallelism + one decision on spec-silent pinning style,
  not code reuse.
- **`gate-tests-pptx-slide-fallback-real-fixture` may require a new
  fixture file** — committing a non-officeparser-friendly PPTX into the
  repo has a size + license check. Identify the fixture's source before
  design, not at implement time.
- **Some items may be "wontfix-by-documentation"** — the spec-silent
  ones can land as a doc note + test name comment rather than a runtime
  assertion. Epic-design needs to surface those calls explicitly so
  they don't waste an implementation slot.
