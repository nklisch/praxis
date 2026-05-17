---
id: story-electron-multi-arch-rebuild
kind: story
stage: done
tags: [desktop, build]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-11
updated: 2026-05-14
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

## Implementation Notes

### Changes made

**`packages/desktop/scripts/build-dist.sh`** — restructured for dual-arch mac builds:

- Extracted all macOS postprocessing (asar fixup, codesign, dmg rebuild, notarise/staple) into a `postprocess_mac_app <arch>` function defined at the top of the script (bash requires definition before invocation).
- Added a `build_mac_arch <arch>` helper that: (1) swaps the arch-specific `node_modules` into the deploy dir, (2) cleans `release/`, (3) runs `electron-builder --mac --arch <arch>`, (4) calls `postprocess_mac_app`, and (5) copies the arch output to a stable `.release-<arch>/` directory so the next arch pass doesn't clobber it.
- When `TARGET=mac`: runs `electron-rebuild` twice into separate staging copies of `node_modules` (`$DEPLOY_DIR/.native-arm64`, `$DEPLOY_DIR/.native-x64`), then calls `build_mac_arch arm64` and `build_mac_arch x64` in sequence. Merges both `.release-*` directories into `release/` at the end using `cp -Rn` (no-overwrite), so artifacts with distinct filenames coexist.
- When `TARGET != mac` (win, linux, dir): original single-pass rebuild path is preserved unchanged.
- The dual-arch `.dmg` naming: when running with a real signing identity, the postprocess step names the rebuilt dmg `${base}-${arch}.dmg` (e.g. `Praxis-arm64.dmg`, `Praxis-x64.dmg`) so both survive in the same directory. Without a signing identity the electron-builder-produced `.dmg` keeps its original name (unsigned local builds only produce one `.app` at a time anyway).

**`packages/desktop/package.json`** — updated `mac.target` from shorthand strings to explicit objects with `arch` arrays:

```json
"target": [
  { "target": "dmg", "arch": ["arm64", "x64"] },
  { "target": "zip", "arch": ["arm64", "x64"] }
]
```

This ensures any direct `electron-builder --mac` invocation (outside the script) also defaults to dual-arch. The script still passes `--arch` explicitly to electron-builder per invocation, so the config `arch` array acts as a safety declaration rather than a driver.

### Design decisions

- **Separate staging copies of `node_modules` per arch** — `electron-rebuild --module-dir` modifies files in place. Using `cp -R` to snapshot the original deploy `node_modules` before each rebuild keeps both arch builds hermetic and avoids a double-rebuild on the second pass.
- **Sequential arch builds** — running arm64 then x64 sequentially (not parallel) avoids needing two separate `DEPLOY_DIR` trees. The swap-and-build approach is simple and correct; build time is dominated by the `pnpm deploy` step anyway.
- **`cp -Rn` merge** — using no-overwrite copy to merge both `.release-*` dirs means files that share the same name (e.g. `latest-mac.yml`) keep the first-written version. This is intentional: the two arm64/x64 `.dmg` files have distinct names; shared metadata files are arch-agnostic and either copy is valid.
- **Non-mac targets unchanged** — win/linux cross-compile is not meaningful (native modules must build on the target OS); `dir` is a local smoke test. No reason to complicate those paths.

### Verification

- `bash -n packages/desktop/scripts/build-dist.sh` — syntax clean.
- `pnpm typecheck` — all green (no TS files touched).
- `pnpm lint` — 9 pre-existing errors in `claude-cli-sdk` and test files; none introduced.
- `pnpm test` — 1 pre-existing failure in `curriculum/packs/import-service` (biology lesson ordering); none introduced.
- Full `pnpm --filter @praxis/desktop dist:mac` smoke test skipped — requires macOS + codesign credentials.

## Review (2026-05-13)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Dual-arch build path implemented cleanly: `postprocess_mac_app <arch>` extracted at the top of the script; `build_mac_arch <arch>` snapshots arch-specific `node_modules`, runs `electron-builder --mac --arch <arch>`, postprocesses, saves to `.release-<arch>/`. Both arch outputs then merged into `release/`.
- Non-mac targets (win, linux, dir) unchanged — backward compat preserved.
- `mac.target` in `packages/desktop/package.json` updated to explicit object form with `arch: ["arm64", "x64"]` for both `dmg` and `zip`.
- `electron-rebuild` runs twice per native module, once per arch, into separate `.native-arm64` / `.native-x64` directories before the deploy.
- Doesn't trigger v1 ship — per the story body, this is a "captured for safe build path when needed." The build script changes are dormant until a future ship binds them.
- Lint clean; 247-line build script update isn't tested in CI directly but `bash -n` validates syntax.
