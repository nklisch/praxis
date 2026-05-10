---
id: epic-phase-19-electron-signing
kind: feature
stage: drafting
tags: []
parent: epic-phase-19-ship-v1
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Signed Electron installer

## Brief

Produce a properly signed Electron installer for at least one platform —
ROADMAP Phase 19's hard requirement. Today the build is unsigned: the
electron-builder config in `packages/desktop/package.json` has
`mac.identity: null`, `mac.type: "development"`, and no Windows code-sign
section at all. The renderer ships and the unpacked app launches via
`pnpm --filter @praxis/desktop dist:dir`, but a real installer ships
without signing → macOS Gatekeeper blocks first launch and Windows shows
SmartScreen warnings. This feature picks the primary launch platform,
provisions the cert chain, updates the electron-builder config, and proves
end-to-end that the resulting installer launches on a clean machine
without warnings.

What this feature covers:

- Pick the primary platform for v1 (default: macOS — the README's "Build a
  distributable" section already biases that way; the design pass can
  override). Other platforms remain unsigned and are stretch.
- Configure code-signing for the primary platform in `packages/desktop/package.json`'s
  `build` block (or migrate to a separate `electron-builder.yml` if cleaner
  — design pass decides).
- For macOS: Apple Developer ID Application certificate, hardened runtime,
  notarization via Apple's notary service. For Windows: code-signing cert
  + signtool integration. For Linux: deb package signing is optional and
  out of scope for v1.
- Document the signing workflow in `docs/` (or a `BUILDING.md` at repo
  root) so future maintainers can rebuild signed installers without
  reverse-engineering the config.
- A "signed-installer smoke test" the design pass spec'd: build the
  installer in CI or locally, install on a clean VM/account, launch,
  verify no Gatekeeper / SmartScreen / browser-download warnings.

What this feature does NOT cover:

- Auto-update wiring — that's `epic-phase-19-auto-update`. This feature
  guarantees the installer is signed; the updater feature relies on it.
- Multi-platform parity — the goal is "at least one platform"; expanding
  to all three is post-v1.
- CI build infrastructure if it doesn't exist already — keep the build
  local for v1 if necessary; the cert provisioning is the load-bearing
  piece.

## Epic context

- Parent epic: `epic-phase-19-ship-v1`
- Position in epic: independent infrastructure feature — does not depend
  on biology pack or first-run flow. Does block `epic-phase-19-auto-update`
  (an unsigned installer cannot safely auto-update). Block ship-checklist
  too — no final test without a signed installer.

## Foundation references

- `docs/ROADMAP.md` — Phase 19 build list ("Signed Electron installer for
  macOS, Windows, or Linux (at least one)").
- `docs/ARCHITECTURE.md` § "Local: an Electron installer for macOS /
  Windows / Linux" — distribution model.
- `README.md` § "Build a distributable" — current pipeline.
- `packages/desktop/package.json` — `build` block (electron-builder config).
- `packages/desktop/scripts/build-dist.sh` — driver script.

<!-- Feature-design pass will pick the primary platform, document the
cert-procurement steps, design the config diffs, and define the smoke-test
shape. -->
