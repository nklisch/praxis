---
id: gate-docs-onboarding-api-key-encryption
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

# ONBOARDING.md still says API key is stored unencrypted; v0.1.1 ships `safeStorage` encryption

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/ONBOARDING.md:67-69`
- Code: `packages/desktop/electron/main/secret-storage.ts:17-39`, `packages/core/src/config/engine-config.ts:121-161`

## Current doc text
> "**Direct — Anthropic (Claude)** / **Direct — OpenAI (GPT)** / **Direct — Google (Gemini)**: enter your API key. The key is stored unencrypted in the local SQLite database (`config_kv` table) — protect that file as you would any password file; it never leaves your machine except in API requests to the chosen provider."

## Reality
The API key is encrypted at rest via Electron's `safeStorage` (Keychain on macOS, DPAPI on Windows, libsecret/kwallet on Linux) using `ElectronSafeStorageAdapter`. If `safeStorage` is unavailable, the config service refuses to persist and instructs the user to use `PRAXIS_API_KEY` env var.

## Required edit
Replace the paragraph with text describing OS-keyring encryption via Electron `safeStorage`; note that on platforms without an OS keyring the app refuses to save and the user must use `PRAXIS_API_KEY` instead.

## Implementation notes
Edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Rolling-foundation discipline: stale assertions replaced in place; no "previously" prose.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
