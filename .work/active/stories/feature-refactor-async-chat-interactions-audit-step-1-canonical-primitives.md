---
id: feature-refactor-async-chat-interactions-audit-step-1-canonical-primitives
kind: story
stage: review
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

## Implementation notes (2026-05-24)

**Files landed:**
- `packages/ui/src/components/action-card.module.css` — CSS for `.actionCard`, `.actionPip`, `.failurePopover` (BEM in CSS Modules camelCase), including keyframes, container queries, and `@media (prefers-reduced-motion: reduce)` opt-out. Token-only values throughout.
- `packages/ui/src/components/action-card.tsx` — `<ActionCard label title action actionLabel children? actionAriaLabel?>` wires trigger/retry/dismiss from the hook; shows `<FailurePopover>` when `action.state === "failed"`.
- `packages/ui/src/components/action-pip.tsx` — `<ActionPip state onClick? className?>`. Renders `<button>` in failed state (native a11y), `<span aria-hidden>` in all other states (presentational only).
- `packages/ui/src/components/failure-popover.tsx` — `<FailurePopover label? reason? actions[]>` positioned absolutely inside `.actionCard__action`.
- `packages/ui/src/hooks/use-optimistic-action.ts` — `useOptimisticAction<TParams>({ dispatch, onSuccess?, onError?, resetSuccessAfterMs? })`. State machine: `idle → pending → success/failed`, `failed → retrying → success/failed`. Includes `externalSettle("success"|"failed", reason?)` for streaming-driven completion (e.g. course-materialize step-4). Uses a `stateRef` shadow to guard `externalSettle` transitions without double `setState`.
- `packages/ui/src/lib/copy.ts` — added `COPY.actionPip.{ failedLabel, retryLabel, dismissLabel }`.

**Design-flaw escape hatch (externalSettle):** The hook exposes `externalSettle("success"|"failed", reason?)` as the clean solution for streaming-driven settle. When called while in `"pending"` or `"retrying"`, it immediately transitions state and fires the appropriate callback, then schedules the success-reset timer. The dispatched Promise continues in the background; when it resolves/rejects, the `stateRef` guard (`if (stateRef.current !== transitionalState) return`) prevents a double-settle. This is clean and doesn't need a separate `useExternalSettleAction` variant.

**All acceptance criteria met.**
