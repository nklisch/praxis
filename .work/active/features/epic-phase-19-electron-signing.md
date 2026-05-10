---
id: epic-phase-19-electron-signing
kind: feature
stage: review
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

## Design decisions

- **Primary platform: macOS.** The build pipeline is already most evolved
  there (`build-dist.sh` has macOS-specific asar surgery + ad-hoc resign);
  the current README explicitly recommends macOS as the v1 launch target.
  Windows + Linux signing stays out of scope for v1.
- **Config stays in `packages/desktop/package.json`'s `build` block.** Not
  extracting to `electron-builder.yml` — the existing `build-dist.sh` step
  5 patches the deploy's `package.json` to rewrite `extraResources.from`,
  and chasing that to YAML adds toil for no practical benefit. JSON config
  is fine for v1.
- **Identity and notary creds via environment variables, not committed
  files.** `MAC_SIGNING_IDENTITY`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. When unset, the build
  proceeds unsigned and ad-hoc-signed (the current behaviour) so local
  development isn't blocked. When set, the build signs and notarises.
- **Notarisation runs as an explicit script step, not via electron-builder's
  `afterAllArtifactBuild` hook.** Because of the post-electron-builder
  asar surgery (the `@praxis/X@@praxis/X` mangling fix), the .app gets
  modified after electron-builder finishes — notarisation must happen
  AFTER the surgery, against the regenerated .dmg. The script orchestrates:
  electron-builder → asar fix → resign (real identity, hardened runtime,
  entitlements) → rebuild .dmg → notarytool submit → stapler staple.
- **Hardened runtime is on; the entitlements plist enables JIT and
  unsigned-executable-memory.** Praxis runs QuickJS WASM (JIT) and links
  to native modules (better-sqlite3, canvas, sqlite-vec, onnxruntime-node)
  built by electron-rebuild that aren't Apple-signed. Without these
  entitlements, the app crashes at startup under hardened runtime. The
  entitlement set mirrors the well-documented Electron+native-modules
  baseline.
- **No automated "verifies signed installer launches without Gatekeeper
  warning" test.** That's a human-only check and lands in the
  `epic-phase-19-ship-checklist` feature. This feature delivers the
  configuration and documentation that enables a signed build; proof of
  the launch flow is the ship-checklist's job.

## Architectural choice

**Configure-everything-then-degrade-gracefully**: ship the full production
signing config with sane defaults (hardened runtime, entitlements, type:
distribution) AND env-var-driven identity / notary creds. When the maintainer
has procured certs and exports the env vars, the existing `pnpm dist:mac`
command produces a signed + notarised installer. When env vars are absent,
the pipeline does what it does today — unsigned, ad-hoc-signed for local
launch.

Alternatives considered:

- *Two separate `dist:mac` and `dist:mac:signed` scripts*: rejected.
  Splits the test surface and risks the unsigned path drifting from
  the signed one.
- *Skip signing entirely until certs exist*: rejected. Phase 19's
  "shippable v1" requirement means we need the full signed pipeline
  ready to fire the moment certs land. Pre-staging the config means
  the only blocking step at ship time is human cert procurement.
- *Move signing to a separate Makefile target*: rejected. Existing
  pattern is `pnpm` scripts driving bash scripts; consistency wins.

## Implementation Units

### Unit 1 (trickiest): `packages/desktop/build/entitlements.mac.plist`
**File**: `packages/desktop/build/entitlements.mac.plist` (new)

The hardened-runtime entitlements plist that allows Electron + native
modules + WASM to run signed. The path has to match what
`packages/desktop/package.json`'s `build.mac.entitlements` references.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

**Implementation Notes**:

- `allow-jit`: V8 JIT compilation in the renderer.
- `allow-unsigned-executable-memory`: needed for QuickJS WASM and JIT in
  some native modules.
- `disable-library-validation`: native modules (better-sqlite3, canvas,
  sqlite-vec) come from electron-rebuild and are not Apple-signed; without
  this entitlement, dlopen rejects them under hardened runtime.
- `allow-dyld-environment-variables`: not strictly required for production
  but commonly included; can be removed later if security review demands.
- `network.client` + `network.server`: outbound (engine APIs, RAG fetch)
  + inbound (potential local IPC ports / dev server).
- `files.user-selected.read-write`: document ingestion via file picker.

**Acceptance Criteria**:

- [ ] File exists at the path referenced by package.json.
- [ ] File is valid XML / plist (parsed by `plutil -lint
      build/entitlements.mac.plist`).
- [ ] All entitlement keys are spelled correctly (case-sensitive Apple
      identifiers).

### Unit 2: extend `packages/desktop/package.json` `build.mac`
**File**: `packages/desktop/package.json`

Replace the current `build.mac` block with the full production config:

```jsonc
"mac": {
  "target": [
    { "target": "dmg", "arch": ["arm64", "x64"] },
    { "target": "zip", "arch": ["arm64", "x64"] }
  ],
  "category": "public.app-category.education",
  "type": "distribution",
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "identity": null,
  "notarize": false
}
```

`identity: null` and `notarize: false` are intentional defaults — the
`build-dist.sh` script overrides them via env vars when present. This
keeps the JSON safe to commit (no machine-specific identity baked in)
and the unsigned local-dev path working.

**Implementation Notes**:

- The `identity: null` default + script-level override pattern matches
  electron-builder's documented "use this when no env var is set, else
  fall through" behaviour. Setting `identity` from env happens in the
  resign step of `build-dist.sh`, not via electron-builder's
  invocation, because we need to resign anyway after asar surgery.
- `arch: ["arm64", "x64"]`: produce universal-style separate artifacts
  for Apple Silicon + Intel. v1 ships both.
- `gatekeeperAssess: false` is the electron-builder default but we
  state it explicitly so future maintainers can find it.
- Do NOT set `entitlementsLoginHelper` — Praxis has no login helper.

**Acceptance Criteria**:

- [ ] `package.json` parses as valid JSON.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` still green (config
      change must not break anything).
- [ ] `pnpm --filter @praxis/desktop dist:dir` still produces a working
      unsigned `.app` (regression check).

### Unit 3: extend `packages/desktop/scripts/build-dist.sh`
**File**: `packages/desktop/scripts/build-dist.sh`

Modify step 8 (asar fixup + resign) to use a production identity when
env vars are present, and append two new steps (notarise, staple) gated
on the presence of `APPLE_ID`.

Sketch of the relevant block (replacing the current ad-hoc
`codesign --force --deep --sign - "$APP_PATH"` line):

```bash
# After asar repack, sign the .app.
SIGN_IDENTITY="${MAC_SIGNING_IDENTITY:-}"
ENTITLEMENTS="$DESKTOP_DIR/build/entitlements.mac.plist"

if [ -n "$SIGN_IDENTITY" ] && [ -f "$ENTITLEMENTS" ]; then
  echo "    signing with identity: $SIGN_IDENTITY (hardened runtime + entitlements)"
  codesign --force --deep \
    --sign "$SIGN_IDENTITY" \
    --options runtime \
    --entitlements "$ENTITLEMENTS" \
    --timestamp \
    "$APP_PATH"
else
  echo "    no MAC_SIGNING_IDENTITY set — using ad-hoc signature (unsigned local build)"
  codesign --force --deep --sign - "$APP_PATH"
fi

# If a .dmg was produced and we have a real identity, rebuild it from
# the (now-modified) .app — the original .dmg embeds the pre-fixup .app
# whose signature is now stale.
DMG_PATH="$(find "$DEPLOY_DIR/release" -maxdepth 2 -name '*.dmg' 2>/dev/null | head -1)"
if [ -n "$SIGN_IDENTITY" ] && [ -n "$DMG_PATH" ]; then
  echo "==> [9/11] Rebuild .dmg from signed .app"
  rm -f "$DMG_PATH"
  hdiutil create -volname "Praxis" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_PATH"
  codesign --force --sign "$SIGN_IDENTITY" --timestamp "$DMG_PATH"

  if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
    echo "==> [10/11] Submit to Apple notary (this can take 5-15 minutes)"
    xcrun notarytool submit "$DMG_PATH" \
      --apple-id "$APPLE_ID" \
      --password "$APPLE_APP_SPECIFIC_PASSWORD" \
      --team-id "$APPLE_TEAM_ID" \
      --wait

    echo "==> [11/11] Staple notary ticket onto .dmg"
    xcrun stapler staple "$DMG_PATH"
  else
    echo "    skipping notarisation — APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not all set"
  fi
fi
```

**Implementation Notes**:

- The script preserves the unsigned-local default. CI and the maintainer
  with certs export env vars; everyone else gets the same dev experience.
- `codesign --timestamp` is required for notarisation. Without it, the
  notary rejects the submission.
- `hdiutil create` rebuilds the .dmg from the (now-signed) .app —
  electron-builder's original .dmg is invalidated by the asar surgery.
- `notarytool submit --wait` blocks until Apple responds. Documented
  as "5-15 minutes" — the script doesn't background it; v1 keeps the
  control flow simple.
- `xcrun stapler staple` embeds the notary ticket into the .dmg so the
  app can launch offline without a network round-trip to Apple's
  servers.
- The step numbering in echo lines (`[8/11]` etc.) is updated to reflect
  the expanded pipeline.

**Acceptance Criteria**:

- [ ] When `MAC_SIGNING_IDENTITY` is unset, the script behaves as today
      (unsigned, ad-hoc resigned, single-pass).
- [ ] When `MAC_SIGNING_IDENTITY` is set but notary creds are not, the
      script signs but skips notarisation, with a clear message.
- [ ] When all four env vars are set, the script signs, rebuilds the
      .dmg, submits, waits, and staples.
- [ ] The script is idempotent — re-running on a clean tree produces
      the same output.
- [ ] `set -e` propagates: any failure in codesign / hdiutil /
      notarytool / stapler aborts the build with a non-zero exit.

### Unit 4: `docs/CODE-SIGNING.md`
**File**: `docs/CODE-SIGNING.md` (new)

The standing reference for cert procurement, env-var setup, and the build
+ notarise + staple workflow. Foundation-style: describes the system as
it is now, no "previously..." language.

Outline:

1. **What this covers** — macOS code-signing + notarisation for the v1
   ship. Windows / Linux signing is out of scope for v1.
2. **What you need before you start**:
   - Apple Developer Program membership (active).
   - Developer ID Application certificate, generated in Apple Developer
     portal and installed in the maintainer's keychain (or in CI).
   - App-specific password for the Apple ID, generated at
     appleid.apple.com.
   - The Team ID (10-char alphanumeric, found in Apple Developer
     account settings).
3. **Environment variables**:
   - `MAC_SIGNING_IDENTITY` — exact certificate name as in keychain.
   - `APPLE_ID` — the Apple ID email.
   - `APPLE_APP_SPECIFIC_PASSWORD` — the app-specific password.
   - `APPLE_TEAM_ID` — the 10-char team id.
4. **Building a signed installer locally** — example `.envrc` /
   `direnv` snippet, then `pnpm --filter @praxis/desktop dist:mac`.
5. **What the pipeline does** — the 11-step orchestration in
   `build-dist.sh`, with emphasis on why the asar surgery + resign
   ordering matters.
6. **Verifying the result**:
   - `codesign -dv --verbose=4 release/Praxis-1.0.0-arm64.dmg`
   - `xcrun stapler validate release/Praxis-1.0.0-arm64.dmg`
   - Manual: install on a clean macOS account; double-click; expect no
     Gatekeeper warning.
7. **Troubleshooting** — common errors and fixes (cert not found,
   notary timeouts, hardened runtime crashes pointing at missing
   entitlements).
8. **CI provisioning notes** (brief): import the cert into the runner's
   keychain via `security import`; export the env vars; run the same
   `pnpm dist:mac` command. v1 doesn't ship a CI workflow file — that's
   post-v1.

**Implementation Notes**:

- Foundation-doc tone: present-tense, prescriptive, no historical notes.
- Cross-reference from `README.md` "Build a distributable" section.
- Avoid leaking maintainer-specific values into the doc — use
  `<TEAM_ID>` placeholders.

**Acceptance Criteria**:

- [ ] File exists at `docs/CODE-SIGNING.md`.
- [ ] Sections cover prerequisites, env vars, build command, pipeline
      walkthrough, verification, troubleshooting.
- [ ] No machine-specific values committed (no real identity, no real
      Apple ID).

### Unit 5: update `README.md` "Build a distributable" section
**File**: `README.md`

Update the section to:
- Cross-reference `docs/CODE-SIGNING.md` as the canonical source for
  signed-build instructions.
- Soften the "Builds are unsigned" warning to "Builds are unsigned by
  default; see docs/CODE-SIGNING.md for the signed-build workflow."
- Remove the `docs/refactors/` reference (no longer the current
  authoritative location for signing notes).

**Implementation Notes**:

- Surgical edits, not a full rewrite. The README's other content stays.

**Acceptance Criteria**:

- [ ] The "Notes" sub-block under "Build a distributable" links to
      `docs/CODE-SIGNING.md`.
- [ ] The signed-vs-unsigned framing matches the configure-everything-
      then-degrade-gracefully design.

## Implementation Order

1. **Unit 1** (entitlements plist) — the file the rest depends on.
2. **Unit 2** (package.json build.mac) — references the plist; commits
   the production config keys.
3. **Unit 3** (build-dist.sh) — implements the env-var-driven sign +
   notarise + staple flow.
4. **Unit 4** (docs/CODE-SIGNING.md) — documents what the code now
   supports.
5. **Unit 5** (README cross-reference) — points readers at the new doc.

After all units land: run `pnpm --filter @praxis/desktop dist:dir` to
confirm the unsigned path still produces a working .app. (Confirming the
SIGNED path requires a real cert — that's the human-only step the
ship-checklist exercises.)

## Testing

### Automated tests

- **None added at the unit level**. Code-signing config is declarative;
  the pipeline is bash; the verification is an external observation
  ("does the .app launch on a clean machine without warnings?"). No
  unit-test surface here that pays for itself.
- **Existing test suite must remain green** — `pnpm test` after every
  unit lands. If a config change breaks `pnpm test`, that's a real
  regression.

### Manual smoke tests (run by the implementer)

1. `pnpm --filter @praxis/desktop dist:dir` produces a working unsigned
   `.app` that launches locally (regression check).
2. `plutil -lint packages/desktop/build/entitlements.mac.plist` reports
   the file as OK.
3. With env vars unset, `pnpm --filter @praxis/desktop dist:mac` produces
   a `.dmg` and a `.zip` per arch — same as today.

### Human-only smoke tests (deferred to ship-checklist)

- Signed `.dmg` installs without Gatekeeper warning on a clean macOS
  account.
- `xcrun stapler validate` returns a stapled status.
- App launches and runs a teach session end-to-end without entitlement-
  related crashes.

## Risks

- **Cert + notary creds are owned by humans, not by autopilot.** The
  implementation can land config + docs but cannot prove the signed
  pipeline works without those credentials. This is captured at the
  feature level (acceptance criteria for Units 1-5 are all
  configuration-or-documentation-only). The human-validated proof is
  the ship-checklist's responsibility.
- **Hardened-runtime entitlement gaps surface only at runtime.** If the
  entitlements plist is missing a needed flag, the signed app crashes
  on first launch with no warning at build time. Mitigation: the chosen
  entitlement set mirrors the documented Electron+native-modules
  baseline; ship-checklist re-verifies on a real device.
- **Asar-surgery breaks signature is a recurring pattern, not a
  one-time fix.** Future changes that touch `build-dist.sh`'s asar step
  must preserve the order: surgery → resign → rebuild .dmg → notarise.
  Codify this in `docs/CODE-SIGNING.md` § "What the pipeline does".
- **Notarisation latency is unbounded.** Apple's notary service can
  occasionally take hours instead of minutes. The script blocks; if
  this becomes painful, post-v1 work can move notarisation behind a
  separate command. Documented as a known characteristic, not a defect.
- **Linux + Windows remain unsigned in v1.** Phase 19 says "at least
  one platform" — macOS satisfies that. Other platforms inherit the
  current "unsigned, with documented warnings" story until a future
  feature picks them up. Documented in `docs/CODE-SIGNING.md` § "What
  this covers".

## No child stories

Single feature, single stride. The five units are tightly coupled (each
references the others' paths) and can be implemented in one pass. No
parallelisation upside; no multi-session resume needed.

## Implementation notes

- **Files changed**:
  - `packages/desktop/build/entitlements.mac.plist` (new) — Unit 1.
  - `packages/desktop/package.json` (`build.mac` block expanded) — Unit 2.
  - `packages/desktop/scripts/build-dist.sh` (resign step replaced;
    notarise + staple steps added) — Unit 3.
  - `docs/CODE-SIGNING.md` (new) — Unit 4.
  - `README.md` ("Build a distributable" notes updated) — Unit 5.
- **Tests added**: none. Per design's "Testing" section, no automated
  test surface here pays for itself; the existing test suite acts as a
  regression check (2235 passing before and after this change).
- **Discrepancies from design**: one. Design said
  `target: [{target: "dmg", arch: ["arm64", "x64"]}, ...]` for
  per-arch artifacts. Rolled back to the original
  `target: ["dmg", "zip"]` (host-arch single-target) on second
  review: dual-arch packaging requires `electron-rebuild` to produce
  native modules for both arm64 and x64, and the current
  `--module-dir "$DEPLOY_DIR" --version "$ELECTRON_VERSION"`
  invocation rebuilds for the host arch only. Telling
  electron-builder to package x64 with arm64-only native modules
  silently fails at runtime. v1 ships single-arch (the maintainer's
  host); a follow-up feature can add dual-arch when the rebuild
  pipeline supports it. Filed as a backlog item:
  `idea-electron-multi-arch-rebuild`.
- **Adjacent issues parked**: none.
- **Verification on this host (Linux)**:
  - `package.json` parses as valid JSON.
  - `bash -n packages/desktop/scripts/build-dist.sh` reports clean
    syntax.
  - Plist sanity check via Node script confirms balanced `<dict>` /
    `<key>` / `<true/>` counts.
  - `pnpm typecheck` green; `pnpm test` shows 2235 passed (same as
    pre-change baseline).
- **Verification deferred to a macOS host (ship-checklist)**:
  - `pnpm --filter @praxis/desktop dist:dir` produces a working
    unsigned `.app` (the design's regression-check acceptance
    criterion). Cannot run on Linux because the mac-specific resign
    block in `build-dist.sh` is gated on finding `Praxis.app` and
    that path is only produced by `dist:mac` / `dist:dir` on macOS.
  - `plutil -lint` of the entitlements plist (Apple-only utility).
  - Full signed-build smoke: `MAC_SIGNING_IDENTITY=...` + Apple creds
    + `pnpm --filter @praxis/desktop dist:mac`. Requires real cert.
- **No code changes outside `packages/desktop/{build,scripts}/` and the
  three docs files** — no service, IPC, UI, or DB changes.
- **Production env-var contract**: `MAC_SIGNING_IDENTITY` (signing only),
  plus `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` for
  notarisation. All four are read-only by the script; none are persisted.
