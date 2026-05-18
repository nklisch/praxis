---
id: bug-sub-agents-panel-collapse
kind: story
stage: done
tags: [bug, ui]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-13
updated: 2026-05-17
---

# Sub-agents panel doesn't collapse layout when hidden

## Brief

Toggling the sub-agents panel via show/hide doesn't restore the layout — when hidden, the panel's allocated vertical space doesn't collapse back down to the bottom of the chat workspace. The chat area should reclaim that space when the panel is dismissed, but it appears to stay reserved (likely a flex/grid sizing rule keyed on mount rather than visibility, or a transition that lands on the wrong final height). Worth inspecting the panel container's height calculation and whether the toggle unmounts vs `display:none`s the panel.

## Suspected area

`packages/ui/src/components/sub-agent-panel.tsx` (modified per git status) and its container's flex/grid template. Note: per the `tab-body-isolation` pattern, hidden ≠ unmounted in many UI surfaces — confirm whether this panel is supposed to fully unmount or just visually hide, and align the grid/flex sizing to match.

## Acceptance criteria

- Hiding the sub-agents panel returns its vertical space to the chat area immediately.
- Re-showing the panel restores the previous height without layout shift.
- A snapshot or layout test asserts the collapse-on-hide behavior.

## Implementation notes

### Root cause

The right outline pane (`outlinePane`) in `bootstrap-tab-body.tsx` is a
`flex-direction: column` container. Before this fix its children were simply
stacked top-to-bottom with no explicit flex-grow assignments:

- `outlineHeader` — correctly `flex-shrink: 0`
- `DraftCard` (or `outlinePlaceholder`) — no `flex` property (`flex: 0 1 auto` default)
- `SubAgentPanel` — rendered directly as a sibling

Because `DraftCard` had no `flex: 1`, it took only its natural content height.
When `SubAgentPanel` expanded, it pushed content down and the parent's
`overflow: hidden` clipped it. When it collapsed, the space above the toggle
button was simply blank — `DraftCard` was not told to grow into it. The visual
effect was that the draft area appeared to "stay at its old height" whether the
panel was open or closed, giving the impression the panel's space was reserved.

### Fix

Introduced two structural wrappers in `bootstrap-tab-body.tsx`:

1. **`.draftScroll`** (`flex: 1; overflow-y: auto; min-height: 0`) — wraps the
   DraftCard / placeholder. Takes all available height between the header and the
   panel row; scrolls internally when the draft content is tall.

2. **`.subAgentRow`** (`flex-shrink: 0; padding: 0 1rem 0.75rem`) — wraps
   `<SubAgentPanel>`. Anchored at the bottom of the column. Expanding or
   collapsing the panel only changes the height of this row; the `.draftScroll`
   area absorbs the reclaimed space via its `flex: 1`.

Files changed:
- `packages/ui/src/components/bootstrap-tab-body.tsx` — added wrappers
- `packages/ui/src/components/bootstrap-tab-body.module.css` — added `.subAgentRow` and `.draftScroll` rules; updated `.outlinePlaceholder` to `height: 100%` so it fills the new scroll wrapper

Layout test added at:
`packages/ui/src/__tests__/bootstrap-tab-body-layout.test.tsx`

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Diff inspected at commit `7ffa8f7`. Genuine layout work — the root cause was the bootstrap tab's outline pane having no `flex: 1` on the draft area, so reclaimed panel space wasn't flowing anywhere. Fix introduces two structural wrappers (`.draftScroll` and `.subAgentRow`) that make the collapse/expand behavior align with intent. Layout test at `bootstrap-tab-body-layout.test.tsx:72` pins the property.
