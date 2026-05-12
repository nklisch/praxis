---
id: gate-docs-contract-prompt-fragment-positions
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

# CONTRACT.md `PromptFragment.position` union missing `"user-global"` and `"user-append"` values

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CONTRACT.md:267-271`
- Code: `packages/curriculum/src/brief/compose.ts:35-45`, `packages/core/src/services/prompt-customization-service.ts:51-130`

## Current doc text
> "interface PromptFragment { id: string; position: \"preamble\" | \"role\" | \"principles\" | \"tools\" | \"context\" | \"constraints\" | \"postamble\"; template: string; customizable: boolean; }"

## Reality
`FRAGMENT_ORDER` is now 9 slots: `"preamble" | "role" | "principles" | "tools" | "context" | "constraints" | "user-global" | "user-append" | "postamble"`. `user-global` carries the cross-mode global prompt from `config_kv`; `user-append` carries the per-mode append from `mode_prompt_appends`. Both are injected via `additionalFragments` by `SessionServiceImpl.openActive` via `PromptCustomizationService`.

## Required edit
Add the two new positions to the `position` union and append a short paragraph describing the user-global / user-append slots and how `PromptCustomizationService` injects them.
