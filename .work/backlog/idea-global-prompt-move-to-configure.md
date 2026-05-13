---
id: idea-global-prompt-move-to-configure
created: 2026-05-13
tags: []
---

The global prompt editor currently lives in Settings, but it's a prompt-customization concern and belongs alongside the other prompt-customization surfaces (per-mode append editor, fragment override editor) inside Configure mode's prompt tab. Move `global-prompt-editor.tsx` into the configure prompt tab so all three editors (global / per-mode append / fragment overrides) sit together under one coherent "prompt customization" surface, and reserve Settings for actual app-level settings (engines, API keys, theme, etc.) rather than authoring concerns.
