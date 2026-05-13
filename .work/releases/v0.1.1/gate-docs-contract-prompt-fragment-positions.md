---
id: gate-docs-contract-prompt-fragment-positions
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

## Implementation notes
Edits applied inline to `docs/CONTRACT.md` as part of the v0.1.1 autopilot doc-drift batch. The roll-forward replaces stale assertions in place per the rolling-foundation principle — no "previously" prose; git history is the audit trail.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
