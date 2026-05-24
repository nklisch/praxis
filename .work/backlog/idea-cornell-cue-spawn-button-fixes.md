---
id: idea-cornell-cue-spawn-button-fixes
created: 2026-05-24
tags: [ui, bug]
---

The per-row ▶ "Talk to Praxis about this cue" button in Cornell-format workspace notes (`packages/ui/src/components/note-editor-cornell.tsx:149-158`) has three problems: (1) the affordance is opaque — a bare play glyph with no visible label gives no obvious indication of what it does, so users don't know it spawns a tutor session about that row; (2) it renders on empty cue rows where there's nothing meaningful to spawn from; (3) the resulting session lands empty rather than opening with the cue text as the opening turn (or otherwise primed so the tutor actually has context). Revisit the affordance label/iconography, gate the button on non-empty cue content, and seed the spawned session so it isn't a blank chat.
