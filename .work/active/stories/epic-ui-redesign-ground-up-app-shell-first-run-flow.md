---
id: epic-ui-redesign-ground-up-app-shell-first-run-flow
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-app-shell
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-ui-redesign-ground-up-app-shell-root-layout-top-nav
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# First-run / onboarding flow — rebuild per locked mock

## Scope

Rebuild `OnboardingFlow` to match the locked first-run flow.

**Prerequisite**: a `.mockups/flows/first-run/` mockup pass produces
the locked direction. The story body opens with running
`/ux-ui-design:flows first-run` if the mocks don't yet exist; the
implementation half of the story follows the locked mocks.

## Implementation steps

1. If `.mockups/flows/first-run/` does NOT exist:
   - Run `/ux-ui-design:flows` for `first-run` to produce the mocks
     (welcome → engine picker → course picker, with the Claude Code
     signin modal as a sub-step).
   - Get sign-off; lock the direction.

2. Edit `packages/ui/src/components/onboarding-flow.tsx`:
   - Restructure to match the locked flow's step sequence.
   - Adopt the new design-system tokens (per the locked design).
   - Mount the Claude Code signin modal at the appropriate step.

3. Per-step components if extraction simplifies (each step gets its
   own file under `packages/ui/src/components/onboarding/`).

4. Tests covering each step transition + completion.

5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] Onboarding flow walks through welcome → engine picker → course
      picker matching the locked mock.
- [ ] Visual styling consumes Studio Quiet tokens.
- [ ] All quality checks green.
