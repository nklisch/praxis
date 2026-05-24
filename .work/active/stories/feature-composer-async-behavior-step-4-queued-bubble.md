---
id: feature-composer-async-behavior-step-4-queued-bubble
kind: story
stage: implementing
tags: [ui, ux]
parent: feature-composer-async-behavior
depends_on: [feature-composer-async-behavior-step-1-pending-message-failure-state]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: `<QueuedMessageBubble>` component (queued + failed variants)

## Scope
Single component that renders all three sub-states of a `PendingMessageItem` (queued / dispatching / failed) with the right action pips. Inline edit for queued items; inline retry + remove for failed items; error reason display.

## Implementation
- Create `packages/ui/src/components/queued-message-bubble.tsx` with:
  - Props: `item: PendingMessageItem`, `onEdit(id, newText)`, `onRemove(id)`, `onRetry(id)`
  - Renders `<article class="chat-turn chat-turn--queued | --failed">` based on `item.status`
  - Actions: queued = edit + remove; dispatching = remove only; failed = retry + remove
  - Failed bubble includes `.chat-turn__error-reason` showing `item.errorReason` (truncate at 120 chars, full text in `title`)
  - Inline edit mode: local `useState<{ editing: boolean; draft: string }>`; click edit → textarea + Save/Cancel pips; Save fires `onEdit(id, draft)` then exits; Cancel discards
- Create `packages/ui/src/__tests__/queued-message-bubble.test.tsx`:
  - Render each variant
  - Edit toggle, Save fires onEdit, Cancel reverts
  - Remove fires onRemove
  - Retry fires onRetry only when status=failed
  - Long errorReason: assert truncate + title attr
  - Dispatching status: edit pip hidden/absent
- Motion: use tokens from `.mockups/design-system/motion.css`; respect `prefers-reduced-motion` for any fade/transition
- COPY: route aria-labels and button labels through `copy.ts` if present

## Acceptance Criteria
- [ ] Queued items render `.chat-turn--queued` with edit + remove action pips
- [ ] Dispatching items render `.chat-turn--queued` with remove only (no edit)
- [ ] Failed items render `.chat-turn--failed` with retry + remove pips and visible `errorReason`
- [ ] Edit click toggles inline textarea pre-filled with item.text
- [ ] Save calls `onEdit(id, draft)` and exits edit mode
- [ ] Cancel discards draft and exits edit mode
- [ ] Remove fires `onRemove(id)` exactly once
- [ ] Retry only renders when status=failed; fires `onRetry(id)` exactly once
- [ ] `errorReason` over 120 chars truncates with full text in `title` attribute
- [ ] No hardcoded transition timings; all via motion tokens

## References
- Parent feature: `.work/active/features/feature-composer-async-behavior.md` § Unit 4
- Mockup: `.mockups/screens/feature-composer-async-behavior/state-in-flight-queued.html`, `state-failed-retry.html`
- Components.css: `.chat-turn` family
