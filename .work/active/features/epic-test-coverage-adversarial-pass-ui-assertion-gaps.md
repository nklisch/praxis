---
id: epic-test-coverage-adversarial-pass-ui-assertion-gaps
kind: feature
stage: drafting
tags: [testing]
parent: epic-test-coverage-adversarial-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# UI assertion gaps — banner hash display and sub-agent collision

## Brief

Two gate-tests findings live in UI / registry code where the spec
pins specific assertable contracts and the test suite is silent on
them. The update banner's installer-hash display contract specifies
that when `installerSha256` is set, a `<details>` block renders
collapsed by default with the full hash visible (no truncation) when
expanded, and when the field is absent the block doesn't render — but
no test exercises either valid or invalid partition. The sub-agent
registry treats a duplicate `parentCallId` collision as a silent no-op,
which is the existing behavior locked by one test, but the spec is
silent on whether duplicate-starts should warn-log so they're
diagnosable.

This feature bundles both because each is a small, isolated test
assertion (or test + small runtime change in the sub-agent case) and
because deciding the spec-silent pinning style for the sub-agent
collision — confirm silent-no-op with a doc note, or change the
contract to warn-log — applies the same decision pattern the ingestion
feature also faces. One design pass, one shared answer.

## Epic context

- Parent epic: `epic-test-coverage-adversarial-pass`
- Position in epic: independent. Parallelizable with the other two
  features.

## Scope absorbed from backlog

- `gate-tests-update-banner-installer-hash-display` — update banner
  hash block render contract (collapsed-by-default, full-hash-when-
  expanded, absent when no hash) not pinned by tests.
- `gate-tests-sub-agent-collision-warn-log` — duplicate `parentCallId`
  collision contract (silent-no-op vs. warn-log) unpinned by spec;
  decide which is correct and pin it.

## Foundation references

- `docs/ARCHITECTURE.md` — sub-agent transparency contract (the
  `SubAgentRegistry` section), update-feed signing flow
- `CLAUDE.md` — `subscriber-fanout-stream` pattern (sub-agent registry
  consumer side)

## Anchors (current implementation)

- Update banner —
  `packages/ui/src/components/update-banner.tsx` (component)
  `packages/ui/src/__tests__/update-banner.test.tsx` (test file —
  may need creating)
- Sub-agent registry —
  `packages/core/src/sub-agents/sub-agent-registry.ts` (or equivalent)
  `packages/core/src/__tests__/sub-agent-registry.test.ts` (existing
  silent-no-op test lives here)
- Sub-agent registry consumer in UI —
  `packages/ui/src/components/sub-agent-block.tsx` (or equivalent)

## Pre-design decisions (2026-05-14)

- **Spec-silent pinning style**: tests with explicit names + one-line
  source comments. No runtime warn-log added.
- **Sub-agent collision contract**: silent-no-op stays as the
  documented behavior. The existing test gets renamed to assert the
  intent (`it("start() with same parentCallId is a silent no-op (by
  design — collision is a registry guarantee, not an error)", ...)`)
  and a comment at the early-return site in the registry points back
  to the test.
- **Update-banner hash display**: two tests — one for `installerSha256`
  set (renders the `<details>` block, collapsed by default, full hash
  visible when expanded — no truncation), one for `installerSha256`
  absent (no block renders).
