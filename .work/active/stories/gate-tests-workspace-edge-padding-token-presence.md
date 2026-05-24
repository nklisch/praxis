---
id: gate-tests-workspace-edge-padding-token-presence
kind: story
stage: implementing
tags: [testing, ui]
parent: feature-gate-tests-v0.1.4-coverage-sweep
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
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
