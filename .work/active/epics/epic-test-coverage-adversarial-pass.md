---
id: epic-test-coverage-adversarial-pass
kind: epic
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
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

## Decomposition

Split by subsystem with adjacency-bundling — the items inside each
feature share test scaffolding (fixture management, fake-timer
patterns, or component render harness) and a shared spec-silent
pinning decision. Three features over four was chosen because the
ingestion items deserve their own slot (real-fixture provisioning is
unique to them); the persistence/state items collapse cleanly because
they all live in the per-package test files and share async ordering
concerns; the UI assertion items pair naturally (one component + one
registry, both small). The three features are fully independent —
autopilot can run them in one wave.

### Child features

- `epic-test-coverage-adversarial-pass-ingestion-edges` — image cross-
  chunk-boundary contract + PPTX slide-fallback real fixture — depends
  on: `[]`
- `epic-test-coverage-adversarial-pass-state-and-config-edges` —
  `cancel()` idempotency across all hook states, draft-store rapid-save
  ordering, engineId rename round-trip under unavailable safeStorage —
  depends on: `[]`
- `epic-test-coverage-adversarial-pass-ui-assertion-gaps` — update
  banner installer-hash display contract + sub-agent collision
  warn-log/silent-no-op decision — depends on: `[]`

### Decomposition risks

- **Cluster lacks a code-area capability arc** — these items belong
  together only as "v0.1.1 gate-tests output." Per-feature design
  passes may produce three disconnected sets of tests with no shared
  abstraction win. That's fine — the win is scheduling parallelism +
  one shared decision per feature on spec-silent pinning style, not
  code reuse.
- **The ingestion feature may need a new PPTX fixture file** —
  committing a non-officeparser-friendly PPTX has size + license
  considerations. Feature-design must identify the fixture source
  before implementing.
- **Some items may resolve as "doc-note-only"** — spec-silent
  contracts can land as a test-name comment + doc note rather than a
  runtime assertion (the sub-agent collision item explicitly offers
  this fork). Feature-design must surface those calls so they don't
  waste an implementation slot.
- **`state-and-config-edges` feature spans three different test
  files** in three different packages (ui, core×2). Sub-agents may
  serialize naturally even though the feature is logically one
  design unit. Feature-design should consider whether to split into
  separate stories at implement time.

## Review (2026-05-14)

**Verdict**: Approve

**Notes**: Epic delivered as briefed. All 3 child features at done; aggregate 7 new test cases pin previously-unverified adversarial paths (cancel-state machine, draft race window, engine-config rename, sub-agent collision, update-banner hash, DOCX image boundary, PPTX fallback fixture). No foundation-doc drift — the tests' own names ARE the spec pins per the feature design's intent. Children-complete, advancing to done.
