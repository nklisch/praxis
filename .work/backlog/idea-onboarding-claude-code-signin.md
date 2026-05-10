---
id: idea-onboarding-claude-code-signin
kind: story
stage: drafting
tags: [ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Inline Claude Code sign-in in onboarding engine step

The first-run-flow design (`epic-phase-19-first-run-flow`) specced that
when the user picks `claude-code` as their engine, the engine step
embeds a "Sign in to Claude Code" affordance triggering the existing
`<ClaudeAuthModal>` — same as the inline auth path on the rest of the
app. The implementation hides the API-key field for Claude Code (and
Ollama) but does not yet surface the sign-in trigger inline; the user
who picks Claude Code at onboarding has to skip the flow and sign in
from settings before they can run a session.

To close this gap:

- In `packages/ui/src/components/onboarding-flow.tsx`'s `EngineStep`,
  detect `config.engineId === "claude-code"` and render a "Sign in"
  button that opens `<ClaudeAuthModal />`.
- Reuse the existing `useAuthStatus()` context to read sign-in state
  so the button label flips between "Sign in" and "Signed in".
- Add a test asserting the button appears for claude-code and not for
  direct providers.

This isn't blocking — users can still complete onboarding by skipping
and signing in via /settings — but it cuts a manual hand-off and
matches the design's spec.

Origin: review of `epic-phase-19-first-run-flow`.
