---
id: story-electron-multi-arch-rebuild
kind: story
stage: drafting
tags: [desktop, build]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# Multi-arch native-module rebuild for macOS dist

## Brief

The v1 mac signing pipeline ships single-arch builds (matching the maintainer's
host) because `packages/desktop/scripts/build-dist.sh`'s `electron-rebuild`
invocation builds native modules for the host arch only. Telling
electron-builder to package both `arm64` and `x64` would silently embed
host-arch-only native modules in the wrong-arch `.app`, producing a broken
installer.

To ship a dual-arch `.dmg` (so Intel Macs can run a native binary without
Rosetta translation), the rebuild step needs to:

- Run `electron-rebuild` once per target arch — `--arch arm64` and `--arch
  x64`, against separate `module-dir` paths.
- Produce two parallel deploy directories or one deploy with per-arch copies of
  native modules in the right `asar.unpacked` locations.
- Update electron-builder's `mac.target` config to dual-arch:
  `[{ target: "dmg", arch: ["arm64", "x64"] }, ...]`.
- Verify both `.dmg` files install + launch on their respective archs during
  the ship-checklist.

This isn't a v1 blocker — Apple Silicon penetration in 2026 is high, and Intel
Mac users represent a small minority that can self-build or wait. Promoted from
backlog so the work is captured at the right level of detail before someone
forgets the rebuild dance; do not bind to a near-term release unless Intel-Mac
feedback shifts the priority.

Native-module list to rebuild per arch: `better-sqlite3`, `canvas`. QuickJS is
WASM so no rebuild required.

Origin: `.work/backlog/idea-electron-multi-arch-rebuild.md` (from
implementation-time design discovery during
`epic-phase-19-electron-signing`).

<!-- Implementation Notes accumulate here as work progresses. -->
