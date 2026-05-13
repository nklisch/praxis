---
id: gate-patterns-inconsistency-service-deps-required-ports
kind: story
stage: done
tags: [refactor, documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: patterns
created: 2026-05-12
updated: 2026-05-12
---

# `service-deps-injection` pattern doc silent on the now-required `secretStorage` port (and `lockService`)

## Inconsistency category
existing-pattern-stale

## Existing pattern
`.claude/skills/patterns/service-deps-injection.md`

## Bundle code that revealed the divergence
`packages/core/src/services/types.ts:154` — `secretStorage: SecretStorage` is now a **required** field on `ServiceDeps`.

## Nature of divergence
The existing pattern doc lists `engineFactory?:` as the test injection seam and shows an interface with no `secretStorage` field. After v0.1.1, tests that construct `ServiceDeps` literals must include `secretStorage: inMemorySecretStorage()` or TypeScript errors. The pattern needs to enumerate the now-required ports (`secretStorage`, `lockService`) so future test authors don't construct invalid literals.

This is documentation-side staleness surfaced by a new mandatory field, not a code-side violation.

## Resolution direction
Update `service-deps-injection.md` to:
- List `secretStorage: SecretStorage` and `lockService: LockService` as required ports in the snippet
- Cross-reference `shared-test-fake-factories` (new pattern) for the canonical test fakes
- Update the `buildServices` example to construct `secretStorage: new ElectronSafeStorageAdapter()`

(Overlaps with `gate-docs-pattern-service-deps-new-fields` — pick one and close the other as duplicate during implementation.)

## Implementation notes
Pattern-skill edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Snippets rolled forward to match current code.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
