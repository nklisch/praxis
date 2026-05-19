---
id: refactor-previewprompt-god-function
kind: story
stage: done
tags: [refactor]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Refactor the `previewPrompt` god-function in author-channel.ts

## Brief

(Historical context.) The `praxis.author.previewPrompt` handler in
`packages/desktop/electron/main/author-channel.ts` was originally a ~82 LoC
god-function that composed system prompts inline — extracting courseId, loading
course state, merging fragments with overrides, calling `composeSystemPrompt`,
and catching validation errors. This story tracked extracting that composition
logic into a service method so the IPC handler became a thin dispatch.

## As-built (landed prior to this story being formally scoped)

- IPC handler at `author-channel.ts:394-404` is now ~10 lines: validate input
  via `previewPromptSchema`, call `services.authoring.previewPrompt({...})`,
  return result. Same thin shape for `previewPromptWithAttribution` at lines
  406-421.
- `AuthoringServiceImpl.previewPrompt` and `previewPromptWithAttribution` in
  `authoring-service.ts:371-381` are pure read-through delegates to
  `PromptCustomizationService` — no audit row, no inline composition.
- Composition logic lives in `PromptCustomizationServiceImpl` at
  `prompt-customization-service.ts:168-174`. A private `buildPreviewInput`
  helper (lines 184-225) is shared by both preview methods, keeping them DRY:
  it resolves the mode via `requireMode`, loads stored overrides, and merges
  draft-global / draft-append inputs with the "undefined → use stored, null →
  omit, string → use draft" semantics.
- Unit tests cover all meaningful composition cases in
  `prompt-customization-service.test.ts` (lines 175-390):
  - `requireMode` throws for unknown modeId (both methods)
  - `draftGlobal` string, null, and undefined (fallback) semantics
  - `draftAppend` string, null, and stored-fallback ordering semantics
  - Stored fragment override surfaced via `previewPromptWithAttribution` segments
  - Attribution equivalence between `previewPrompt` and `previewPromptWithAttribution`
  - Segment-join invariant and source tagging (`default`, `override`, `global`, `append`)

## Implementation notes

Land mode — the refactor shipped in earlier commits before this story was
formally scoped. Story body updated to reflect as-built state. No new tests
were added; existing coverage was found to be comprehensive across all branches
of `buildPreviewInput` and both public preview methods.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Land-mode resolution. `PromptCustomizationService.previewPrompt` and the shared `buildPreviewInput` helper actually shipped in earlier feature work (`341fa63 implement: feature-prompt-customization-layers-compose-wiring`, later refined by `de359e7 implement: epic-prompt-editing-surface-v2-compose-attribution`) — well before this story was scoped. The story idea was generated reading the post-extraction-step-3 author-channel.ts state but didn't re-check the current line counts. Substrate is now consistent with reality: handler is the thin dispatch the story envisioned, composition is in the right service, tests are comprehensive. Lesson noted for future scoping passes — verify the current file state before describing "current god-shape" in an idea body.
