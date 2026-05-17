---
id: bug-sub-agents-panel-collapse
kind: story
stage: drafting
tags: [bug, ui]
parent: null
depends_on: []
release_binding: null
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
