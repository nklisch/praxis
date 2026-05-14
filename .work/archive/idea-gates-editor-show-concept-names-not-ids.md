---
id: idea-gates-editor-show-concept-names-not-ids
created: 2026-05-13
tags: []
---

The gates editor surfaces raw concept ids instead of the concept's human-readable name/title, which makes it nearly impossible to tell what a gate is actually gating without cross-referencing. On top of that, the concepts are crammed into a single horizontal line that's barely legible — the layout needs to be reorganized (wrap, stack, group by unit/lesson, or use a denser-but-readable component) and the rendering should support some kind of zoom or expand affordance so an author can actually read and reason about which concepts are involved. The same problem shows up in the course editor: human-unfriendly concept ids leak into the UI where the concept's display name should be shown instead. Fix should standardize on "show name (with id available on hover or as secondary text) anywhere a concept appears in editing UIs."
