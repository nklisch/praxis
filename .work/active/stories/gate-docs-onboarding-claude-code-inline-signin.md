---
id: gate-docs-onboarding-claude-code-inline-signin
kind: story
stage: review
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# ONBOARDING.md says Claude Code auth happens "in first session"; v0.1.1 added inline sign-in during the onboarding Engine step

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/ONBOARDING.md:71-72`
- Code: `packages/ui/src/components/onboarding-flow.tsx:127-222` (EngineStep renders `<ClaudeAuthModal>` + "Sign in to Claude Code" button when `engineId === "claude-code"`)

## Current doc text
> "**Claude Code**: no API key needed — Praxis uses your existing Claude Code CLI authentication. If you haven't authenticated the CLI yet, the first session prompts you through it."

## Reality
When the user selects Claude Code as their engine during onboarding Step 2, an inline "Sign in to Claude Code" button appears alongside the engine selector. Clicking it opens `<ClaudeAuthModal>` for the full sign-in flow. The button label flips to "Signed in" (muted) once `client.claudeAuth.status()` reports `loggedIn: true`.

## Required edit
Rewrite the Claude Code bullet to describe the inline sign-in affordance in Step 2; remove the "first session prompts you" sentence.

## Implementation notes
Edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Rolling-foundation discipline: stale assertions replaced in place; no "previously" prose.
