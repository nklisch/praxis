---
id: bug-sub-agents-panel-collapse
created: 2026-05-13
tags: [bug, ui]
---

Toggling the sub-agents panel via show/hide doesn't restore the layout — when hidden, the panel's allocated vertical space doesn't collapse back down to the bottom of the chat workspace. The chat area should reclaim that space when the panel is dismissed, but it appears to stay reserved (likely a flex/grid sizing rule keyed on mount rather than visibility, or a transition that lands on the wrong final height). Worth inspecting the panel container's height calculation and whether the toggle unmounts vs `display:none`s the panel.
