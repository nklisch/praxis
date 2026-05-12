---
id: gate-docs-prompt-customization-layers-section
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# CONTRACT.md + ARCHITECTURE.md missing prompt-customization layers entry (AuthoringClient extensions, `PromptCustomizationService`, `mode_prompt_appends` table)

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CONTRACT.md` (Phase 11 AuthoringService section, ~lines 982-1004); `docs/ARCHITECTURE.md` (Where the big pieces live section)
- Code: `packages/core/src/types/client.ts:489-509`, `packages/core/src/services/prompt-customization-service.ts`, `packages/core/src/services/authoring-service.ts:282-295`

## Current doc text
AuthoringService interface lists `customizePrompt`, `clearFragmentOverride`, `setStyleSliders` and stops there.

## Reality
`AuthoringClient` gained five new methods: `setGlobalPrompt(text)`, `getGlobalPrompt()`, `setModeAppend({modeId, text})`, `getModeAppend(modeId)`, `previewPrompt({modeId, draftGlobal?, draftAppend?}): Promise<string>`. Backed by `PromptCustomizationServiceImpl` reading/writing `config_kv.prompt.global_fragment` and the `mode_prompt_appends` table. UI surfaces: `<GlobalPromptEditor>` (Settings) and `<ModeAppendEditor>` (Configure prompt tab).

## Required edit
In CONTRACT.md, append the five new `AuthoringClient` methods to the Phase 11 AuthoringService snippet and add a short `PromptCustomizationService` section describing the two storage keys. In ARCHITECTURE.md "Where the big pieces live", add a one-line entry for the prompt customization service.
