---
id: idea-refactor-previewprompt-god-function
kind: idea
tags: [refactor]
created: 2026-05-18
---

# Refactor the `previewPrompt` god-function in author-channel.ts

The `praxis.author.previewPrompt` handler in
`packages/desktop/electron/main/author-channel.ts` (~82 LoC) was moved
verbatim during the `refactor-ipc-server-extract-domain-channels` step 3
(commit `dd9f96c`) but its internals are still god-shaped:

- Composes a system prompt inline by extracting courseId, loading course
  state, merging fragments with overrides, calling `composeSystemPrompt`,
  catching validation errors
- The patch-object construction has conditional spreads scattered through
  the handler body

Scope a refactor story to:

1. Extract the prompt-composition logic into a service method (likely on
   `PromptCustomizationService` or a sibling on `AuthoringService`) —
   `previewPrompt(input): Promise<ComposedSystemPrompt>`
2. The channel handler becomes a 3-line dispatch (parse input → call
   service method → return result)
3. Tests for the new service method cover the composition cases that the
   current channel handler tests implicitly cover

The IPC handler should be thin (input validation + service dispatch).
Composition logic belongs in a service.

Pre-existing biome suppression for `lessonAssessments` was already
fixed during the step-3 move — that's a separate cleanup. The `previewPrompt`
refactor is the main outstanding item from the author channel extraction.
