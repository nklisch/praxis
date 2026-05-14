---
id: epic-test-coverage-adversarial-pass-ui-assertion-gaps-subagent-collision
kind: story
stage: done
tags: [testing]
parent: epic-test-coverage-adversarial-pass-ui-assertion-gaps
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Sub-agent registry collision: pin silent-no-op contract

## Scope

Rename the existing collision test in
`packages/core/src/services/__tests__/subagent-registry.test.ts` so its
name asserts the documented intent — silent-no-op as a registry
guarantee, not an error condition — and tighten its body to also pin
the diagnostic seam (the `log.debug("subagent-registry.start.collision", ...)`
call). Add a one-line comment at the early-return site in
`packages/core/src/services/subagent-registry.ts` that points back to
the test name.

This story implements Unit 1 of the parent feature. The full
implementation spec — including the exact replacement test body and
the source-comment text — is in the parent feature's
`## Implementation Units` section, Unit 1.

## Files touched

- `packages/core/src/services/__tests__/subagent-registry.test.ts` —
  replace the test at line 97 with the renamed, stronger version.
- `packages/core/src/services/subagent-registry.ts` — add a comment
  block at the collision early-return site (line ~68).

No new files. No new runtime code paths.

## Acceptance criteria

- [ ] The old test name `"start() with same parentCallId is a no-op (collision)"`
  no longer exists in the file.
- [ ] A test named `"start() with same parentCallId is a silent no-op (by design — collision is a registry guarantee, not an error)"`
  exists and passes.
- [ ] That test asserts all four properties from the parent feature
  Unit 1: zero events on collision, `list()` length stays 1, the
  original `label` is preserved (NOT overwritten by the second
  start's args), and `log.debug` was called with
  `"subagent-registry.start.collision"` and the correct
  `{ parentCallId }` payload.
- [ ] `packages/core/src/services/subagent-registry.ts` has a
  comment block at the collision early-return site that references
  the test name as the pin.
- [ ] `pnpm --filter @praxis/core test` is green.
- [ ] `pnpm typecheck` and `pnpm lint` are green at the repo root.

## Out of scope

- Adding a runtime warn-log for collisions. Pre-design decision
  locked silent-no-op; warn-log would change the contract.
- Changing the collision-handler behavior (e.g. updating the label
  on re-start). The story asserts the current behavior; changing it
  is a separate item.
- Editing `docs/ARCHITECTURE.md` or any spec doc. Once the test name
  asserts the contract, the test name IS the pin.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: Source-comment back-reference in `subagent-registry.ts` strengthens the pin in both directions.

**Notes**: 20 tests pass. Test pins all four invariants (no event, no duplicate, label preserved, debug log emitted). Runtime comment-only change.
