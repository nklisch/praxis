---
id: idea-unified-prompt-editing-surface
created: 2026-05-13
tags: []
---

Design the entire prompt-editing system as one unified surface in Configure rather than the current scattered set of editors (global prompt in Settings, per-mode append in Configure prompt tab, fragment overrides in a separate Advanced section, full preview only reachable per-editor). One coherent vision: a single Configure prompt screen that surfaces all customization layers together — global fragment, mode-level append, per-fragment overrides — alongside a single live composed preview showing what the model actually receives. This subsumes and unifies several existing parks: `idea-global-prompt-move-to-configure` (relocate global out of Settings), `idea-prompt-customization-full-fragment-view-with-diff` (show all fragments incl. locked, badge overridden, diff against default), and `idea-prompt-menu-full-width` (use full horizontal space). At scope time, treat these as facets of one design rather than three independent fixes — the goal is a single mental model for "how I shape what the tutor sees."
