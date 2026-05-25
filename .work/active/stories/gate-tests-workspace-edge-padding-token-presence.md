---
id: gate-tests-workspace-edge-padding-token-presence
kind: story
stage: done
tags: [testing, ui]
parent: feature-gate-tests-v0.1.4-coverage-sweep
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-23
updated: 2026-05-25
---

# Workspace edge-padding token has no regression guard

## Priority
Low — from gate-tests on release v0.1.4.

## Spec reference
Item: `story-workspace-edge-padding`
Acceptance criterion:
> All workspace tab bodies use the same outer gutter / padding token;
> visual diff matches RouteHeader / LibrarySection breathing-room on
> the same viewport.

## Gap type
adversarial-spec-silent — story verification was "CSS comparison only
— no live browser run." For CSS-only changes a DOM-based test is
awkward, but a token-presence test catches the most obvious regression
(someone deletes `--space-page-gutter`).

## Suggested test or alternative
Lightweight assertion against `global.css` (snapshot or substring)
confirming `--space-page-gutter` is defined at `:root`.

Alternative: treat as accepted risk and document the no-test posture
in CONVENTIONS.md design-system section.

## Test location (suggested)
`packages/ui/src/styles/__tests__/tokens.test.ts` (new) — or skip with
explicit acceptance

## Implementation notes (2026-05-25)

Created `packages/ui/src/styles/__tests__/tokens.test.ts` with two assertions:

1. `"defines --space-page-gutter at :root"` — reads `global.css` as text and confirms both `:root` and `--space-page-gutter:` are present.
2. `"--space-page-gutter value is a rem measurement"` — extracts the token value with a regex and asserts it matches `\d+(\.\d+)?rem`. This pins the value format (rem, not px) which matters for zoom-relative scaling.

The test uses `node:fs` + `node:path` directly — no CSS parser dependency, no build step. Files in `packages/ui/src/styles/__tests__/` are automatically picked up by the UI package's vitest config (no explicit `include`, defaults to `**/*.test.{ts,tsx}`).

All tests pass (`pnpm test`). No production code changes.
