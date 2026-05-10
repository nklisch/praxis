---
id: feature-claude-auth
kind: feature
stage: done
tags: [ui]
parent: null
depends_on: [feature-phase-2-engine-layer]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Claude CLI authentication

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/claude-auth.md`.

**Goal that shipped:** Clean auth surface for the `claude-code` engine so first-run users sign in without hitting cryptic engine errors, and chat surfaces a recoverable "not signed in" state rather than a generic "session.start failed" banner.

**Notes:** `auth` namespace in `@praxis/claude-cli-sdk` wrapping `claude auth status` and `claude auth login --claudeai`; `ClaudeAuthService` in `@praxis/core/services` exposed via IPC; `<ClaudeAuthModal>` reusing the `Modal` primitive. Mid-session expiry deferred — auth is checked at `session.start` only.
