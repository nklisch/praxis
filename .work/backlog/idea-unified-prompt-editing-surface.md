---
id: idea-unified-prompt-editing-surface
created: 2026-05-13
tags: []
---

Redesign the entire prompt-editing system as one unified surface in Configure, replacing the current scattered editors (global prompt in Settings, per-mode append in Configure prompt tab, fragment overrides in a separate Advanced section, full preview only reachable per-editor). One coherent vision: a single Configure prompt screen that surfaces all customization layers together — global fragment, mode-level append, per-fragment overrides — alongside a single live composed preview showing what the model actually receives.

Concrete pieces folded into this surface:
- **Relocate global prompt out of Settings** into the Configure prompt tab so all three layers live in one place; reserve Settings for engines/API keys/theme.
- **Show the full fragment list**, not only customizable ones. Today `prompt-fragment-editor.tsx:9-41` ships a hardcoded `CUSTOMIZABLE_FRAGMENTS` list and locked fragments (preamble/role/tools/postamble) are invisible. Render them disabled with a tooltip explaining why they're locked.
- **Badge fragments that already have an override** so the user can see at a glance what's been changed without picking each one.
- **Diff-aware preview**: alongside the composed final prompt, show a diff against the unmodified default — highlight overridden spans, attribute each segment to its source (default / user override / append / global). Replaces the current undifferentiated wall of text.
- **Use full horizontal space**: today the prompt editor column is constrained narrower than the surrounding layout, forcing long fragment templates to wrap or scroll unnecessarily. Loosen the max-width / switch to a fluid editorial column.

Key files: `composeSystemPrompt` (`packages/curriculum/src/brief/compose.ts:52-66`), `PromptFragment` type (`packages/core/src/types/mode.ts:29-34`), `PromptCustomizationServiceImpl` (`packages/core/src/services/prompt-customization-service.ts`), Configure prompt tab (`packages/ui/src/routes/configure/prompt-tab.tsx`), editors (`packages/ui/src/components/{global-prompt-editor,mode-append-editor,prompt-fragment-editor,prompt-preview-pane}.tsx`).

Treat at scope time as one design, not three independent fixes — the goal is a single mental model for "how I shape what the tutor sees."
