---
id: feature-composer-async-behavior-step-3-status-row
kind: story
stage: implementing
tags: [ui, ux]
parent: feature-composer-async-behavior
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: `<ComposerStatus>` row component

## Scope
New pure presentational component that renders the status row beneath the composer. Priority ladder: failed > streaming > queued > idle (returns null). Composes against `.composer__status` family already added to `.mockups/design-system/components.css`.

## Implementation
- Create `packages/ui/src/components/composer-status.tsx` with:
  - Props: `isStreaming: boolean`, `pendingCount: number`, `failedCount: number`
  - Returns `JSX.Element | null`
  - Priority: failedCount>0 → `.composer__status--failed`; isStreaming → `.composer__status--streaming` + `.composer__status__pip`; pendingCount>0 → no modifier; else null
- COPY strings:
  - `--failed`: e.g. "{N} failed · retry inline"
  - `--streaming`: "Tutor is responding"
  - queued: "{N} queued behind active turn"
- Route strings through `packages/ui/src/copy.ts` if present
- Create `packages/ui/src/__tests__/composer-status.test.tsx`:
  - Snapshot test per variant
  - Idle case returns null
  - Priority: failed > streaming > queued
- Pure component — no state, no effects. Verify via test.

## Acceptance Criteria
- [ ] Renders `--failed` variant when `failedCount > 0` (highest priority, even during streaming)
- [ ] Renders `--streaming` variant when `isStreaming=true` and no failures
- [ ] Renders queued count when `pendingCount > 0` and not streaming and no failures
- [ ] Returns `null` in idle (all-zero) state
- [ ] No internal state (`useState`) or effects (`useEffect`) — purely a function of props
- [ ] Per-variant snapshot test covers each branch

## References
- Parent feature: `.work/active/features/feature-composer-async-behavior.md` § Unit 3
- Mockup: `.mockups/screens/feature-composer-async-behavior/state-*.html`
- Components.css: `.composer__status` family
