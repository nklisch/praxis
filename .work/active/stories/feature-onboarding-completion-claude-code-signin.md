---
id: feature-onboarding-completion-claude-code-signin
kind: story
stage: implementing
tags: [ui, onboarding]
parent: feature-onboarding-completion
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Inline Claude Code sign-in in EngineStep

## Scope

Story 1 of `feature-onboarding-completion`. When the user picks
`claude-code` as their engine during onboarding, render a "Sign in to
Claude Code" button that opens `<ClaudeAuthModal>`. Use `useAuthStatus()`
(or the actual hook name; verify in code) to flip the button label between
signed-in and not-signed-in states.

Closes Gap 1 from the parent feature: today, a user who picks Claude Code
at onboarding has to skip the flow and sign in from settings before they
can run a session. After this story, they can sign in inline.

## Files to touch

- `packages/ui/src/components/onboarding-flow.tsx` — extend `EngineStep`. When `config.engineId === "claude-code"`, render the sign-in button alongside the engine selector. Read auth state via the existing hook.
- `packages/ui/src/__tests__/onboarding-flow.test.tsx` (or wherever onboarding tests live) — add cases for the new behavior.

## Acceptance criteria

- [ ] When `config.engineId === "claude-code"` and the user is not signed in, the sign-in button is visible and labeled "Sign in to Claude Code".
- [ ] When signed-in, button label reads "Signed in" (or similar) and is visually muted but still clickable (lets the user re-auth or switch accounts).
- [ ] Clicking the button opens `<ClaudeAuthModal />`.
- [ ] When `engineId !== "claude-code"`, the sign-in button is not rendered.
- [ ] Existing apiKey field logic (hidden for claude-code / ollama; visible otherwise) is unchanged.
- [ ] At least 2 new tests lock the contract (rendering visibility + click behavior).

## Implementation notes

- Existing patterns: `<ClaudeAuthModal>` should already exist in the codebase — search for it before re-implementing. The `useAuthStatus()` hook may be named differently; verify.
- Button styling: match the existing engine-step controls (probably a styled `<button>` consistent with the design system; theme tokens from the recently-landed editorial polish pass apply).

## References

- Design: `.work/active/features/feature-onboarding-completion.md` (Story 1)
- Origin idea: `.work/backlog/idea-onboarding-claude-code-signin.md`

<!-- Implementation Notes accumulate here as work progresses. -->
