---
id: feature-refactor-async-chat-interactions-audit-step-1-canonical-primitives
kind: story
stage: implementing
tags: [ui, refactor, design-system]
parent: feature-refactor-async-chat-interactions-audit
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: Canonical `.action-card` + `.action-pip` primitives + `useOptimisticAction` hook

## Scope
Ship the canonical primitives that every per-surface async refactor in this feature will compose against: CSS for `.action-card` / `.action-pip` / `.failure-popover` (from `content-types.html` and the async-chat-interactions flow mock), the three React components, and the shared `useOptimisticAction<TParams>` hook with the full state machine.

## Implementation
- Promote CSS from `.mockups/design-system/components.css` to production:
  - `.action-card` + `__body` + `__label` + `__title` + `__action`
  - `.action-pip` + `--show` + `--pending` / `--success` / `--failed` / `--retrying` (NO squash/overshoot — opacity + color only; constant size)
  - `.failure-popover` + `__label` + `__reason` + `__actions`
  - Land in `packages/ui/src/components/markdown-content.module.css` (or sibling — pick the one consistent with other chat-surface primitives)
- Create components:
  - `packages/ui/src/components/action-card.tsx` — `<ActionCard>` with `__body` / `__action` slot children
  - `packages/ui/src/components/action-pip.tsx` — `<ActionPip state={ActionState} />`
  - `packages/ui/src/components/failure-popover.tsx` — `<FailurePopover label reason actions />` anchored to caller
- Create `packages/ui/src/hooks/use-optimistic-action.ts`:
  - `ActionState = "idle" | "pending" | "success" | "failed" | "retrying"`
  - Returns `{ state, errorReason, trigger(params), retry(), dismiss(), externalSettle(state, reason?) }`
  - Captures params on `trigger` into a ref so `retry` replays
  - State machine: `idle → pending → (success|failed)`; `failed → retrying → (success|failed)`
  - `resetSuccessAfterMs` (default 800ms) auto-transitions success → idle for pip flash
- Tests:
  - `packages/ui/src/hooks/__tests__/use-optimistic-action.test.ts` — state transitions, retry replays params, external settle, success auto-reset
  - `packages/ui/src/components/__tests__/action-card.test.tsx`, `action-pip.test.tsx`, `failure-popover.test.tsx` — per-state render + click handlers
- All motion via tokens (`var(--dur-ambient)`, etc.); respect `prefers-reduced-motion`

## Acceptance Criteria
- [ ] CSS classes shipped in production with token-only values (no hardcoded hex/px)
- [ ] All three React components shipped with prop interfaces matching the design
- [ ] `useOptimisticAction` hook with documented state machine
- [ ] Hook tests cover every state transition + retry replay + external settle
- [ ] Component tests cover every state render
- [ ] No hardcoded motion timings; `prefers-reduced-motion` respected
- [ ] Build, lint, typecheck, tests all pass

## References
- Parent feature: `.work/active/features/feature-refactor-async-chat-interactions-audit.md` § Step 1
- Mockups: `.mockups/flows/async-chat-interactions/03-action-card-pending.html`, `04-failed-retry.html`
- Components.css source: `.mockups/design-system/components.css` § `.action-card`, `.action-pip`, `.failure-popover`
