---
id: epic-prompt-editing-surface-v2-compose-attribution
kind: feature
stage: drafting
tags: [core, curriculum, prompt-customization]
parent: epic-prompt-editing-surface-v2
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Compose returns source attribution

## Brief

Today `composeSystemPrompt` in `packages/curriculum/src/brief/compose.ts:52-66`
returns a single concatenated string. The diff-aware preview the epic wants
needs to know which span of the composed prompt came from which source —
default fragment, user override, per-mode append, or global fragment — to
highlight what the user actually changed.

This feature extends the composition layer to optionally return a structured
segment list alongside (or in place of) the joined string, where each segment
carries `{ fragmentId, position, source: "default" | "override" | "append" |
"global", text }`. The existing `string` return path stays for callers that
just want the prompt (engines, brief assembly); the new attribution path is
opt-in for the preview pipeline.

This is the foundation feature for the epic — the diff-aware preview depends
on it directly, and the unified configure surface benefits from it for
in-place source labels.

## Epic context

- Parent epic: `epic-prompt-editing-surface-v2`
- Position in epic: **foundation feature** — `diff-aware-preview` depends on
  this; can land in parallel with `unified-configure-surface`.

## Foundation references

- `docs/ARCHITECTURE.md` — `@praxis/curriculum` is "modes, prompt fragments,
  composition" (line ~50, line ~353); this feature extends the composition
  output without changing the package's responsibility.

## Anchors

- `composeSystemPrompt` — `packages/curriculum/src/brief/compose.ts:52-66`
- `FRAGMENT_ORDER` — `packages/curriculum/src/brief/compose.ts:35-45`
- `PromptFragment` type — `packages/core/src/types/mode.ts:29-34`
- Caller: `PromptCustomizationServiceImpl.previewPrompt` —
  `packages/core/src/services/prompt-customization-service.ts:153-194`
- Existing tests: `packages/core/src/services/__tests__/prompt-customization-service.test.ts`
