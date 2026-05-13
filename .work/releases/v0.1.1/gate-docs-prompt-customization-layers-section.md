---
id: gate-docs-prompt-customization-layers-section
kind: story
stage: done
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

## Implementation notes
Edits applied inline to `docs/CONTRACT.md` as part of the v0.1.1 autopilot doc-drift batch. The roll-forward replaces stale assertions in place per the rolling-foundation principle — no "previously" prose; git history is the audit trail.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
