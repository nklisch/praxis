---
id: epic-phase-19-auto-update
kind: feature
stage: drafting
tags: []
parent: epic-phase-19-ship-v1
depends_on: [epic-phase-19-electron-signing]
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Auto-update channel

## Brief

Decide and implement the v1 update story: built-in updater (electron-updater
pulling signed installers from a static channel) versus manual download
(in-app version-check ping with a "download v1.x" link). ROADMAP Phase 19
calls this out explicitly as a decision; this feature owns making it and
landing the consequences.

What this feature covers:

- A short decision document (lives in the feature body, then optionally
  promoted to `docs/UPDATE-CHANNEL.md` if the choice has user-facing
  implications worth standing context for). Captures the call,
  alternatives considered, and reversibility.
- If built-in updater: wire `electron-updater`, add `publish` provider
  config to electron-builder (likely `generic` or `github`), set up the
  signing-aware update server / static channel, gate the auto-check
  behind a settings toggle, and surface a "update available" affordance
  in the UI shell.
- If manual: implement a once-per-launch version-check ping against a
  small static endpoint, surface the "v1.x available" banner in the
  app's existing UI shell with a link to the downloads page, and document
  the release-cut → upload steps for maintainers.
- Either way: a smoke test that verifies the update path triggers under
  the right conditions and is silent when no update is available.

What this feature does NOT cover:

- Cert procurement — that's `electron-signing`. This feature assumes the
  signed installer is already a thing.
- Telemetry / opt-in analytics — separate concern.
- Beta / canary channels — v1 ships one channel; multi-channel is
  post-v1.

## Epic context

- Parent epic: `epic-phase-19-ship-v1`
- Position in epic: depends on `electron-signing` because an unsigned
  installer cannot safely auto-update. Independent of biology pack and
  first-run flow.

## Foundation references

- `docs/ROADMAP.md` — Phase 19 build list ("Auto-update channel decision
  (built-in updater vs manual download)").
- `docs/ARCHITECTURE.md` § "Local: an Electron installer..." — distribution
  model.
- `packages/desktop/package.json` — electron-builder `build` block (will
  receive a `publish` section if built-in updater is chosen).

<!-- Feature-design pass will record the decision (with rationale), then
spec the implementation for whichever path was picked. -->
