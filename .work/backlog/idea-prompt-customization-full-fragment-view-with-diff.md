---
id: idea-prompt-customization-full-fragment-view-with-diff
created: 2026-05-13
tags: []
---

Rework the prompt-customization UI so the user can actually see what's happening: render the full fragment list for the active mode (customizable + non-customizable) with locked fragments visibly disabled and tooltipped, badge fragments that currently have a stored override, and unify the three scattered editors (per-mode append `modePromptAppends`, global fragment `config_kv["prompt.global_fragment"]`, fragment overrides `promptOverrides`) into one coherent view. Pair this with a diff-aware preview pane: alongside the composed final prompt, show a diff against the unmodified default — highlighting overridden spans, attributing each segment to its source (default / user override / append / global), and making it obvious at a glance what the user has actually changed vs. what they're inheriting. Today only customizable fragments are even shown (hardcoded `CUSTOMIZABLE_FRAGMENTS` in `prompt-fragment-editor.tsx:9-41`), active overrides aren't marked, and the preview is an undifferentiated wall of text — so users can't tell what's editable, what's locked, or what they've already changed.
