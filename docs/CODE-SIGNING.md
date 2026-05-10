# Code signing and notarisation

This document describes how Praxis produces a signed and notarised macOS
installer. Windows and Linux signing are out of scope for v1.

## What this covers

- macOS code-signing with a Developer ID Application certificate.
- Apple notarisation via `notarytool`.
- Stapling the notary ticket onto the `.dmg` so the installer can launch
  offline without a network round-trip to Apple.

The pipeline is a superset of the unsigned local build: when the
signing-related environment variables are unset, `pnpm
--filter @praxis/desktop dist:mac` produces an unsigned ad-hoc-signed
build (the local-development default). When they are set, the same
command produces a signed and notarised `.dmg`.

## What you need before you start

- An active Apple Developer Program membership.
- A **Developer ID Application** certificate, generated in the Apple
  Developer portal and installed in the maintainer's keychain (or in a
  CI runner's keychain via `security import`).
- An **app-specific password** for the Apple ID, generated at
  appleid.apple.com → Sign-In and Security → App-Specific Passwords.
- The **Team ID** — a 10-character alphanumeric value found in the
  Apple Developer account settings.
- Xcode command-line tools installed (`xcode-select --install`) so
  `codesign`, `xcrun notarytool`, `xcrun stapler`, and `hdiutil` are on
  PATH.

## Environment variables

The build pipeline reads four environment variables:

| Variable | Purpose | Required for |
|----------|---------|--------------|
| `MAC_SIGNING_IDENTITY` | Exact certificate name as it appears in the keychain, e.g. `Developer ID Application: Praxis Org (TEAMID12345)`. | Signing |
| `APPLE_ID` | The Apple ID email tied to the Developer Program. | Notarisation |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password generated at appleid.apple.com. | Notarisation |
| `APPLE_TEAM_ID` | The 10-character Team ID. | Notarisation |

When `MAC_SIGNING_IDENTITY` is unset, the build falls back to ad-hoc
signing — fine for local development, not shippable. When the signing
identity is set but any of the three notary variables is missing, the
build signs but skips notarisation; the resulting `.dmg` will still
trigger a Gatekeeper warning on a clean machine.

## Building a signed installer locally

Set the environment, then run the standard `dist:mac` command:

```bash
# Example .envrc (use direnv or similar; do NOT commit real values)
export MAC_SIGNING_IDENTITY="Developer ID Application: <Org Name> (<TEAM_ID>)"
export APPLE_ID="<your-apple-id@example.com>"
export APPLE_APP_SPECIFIC_PASSWORD="<app-specific-password>"
export APPLE_TEAM_ID="<TEAM_ID>"

pnpm --filter @praxis/desktop dist:mac
```

Output lands at `packages/desktop/release/`:

- `Praxis-<version>-arm64.dmg` and `Praxis-<version>-x64.dmg` — signed,
  notarised, stapled.
- `Praxis-<version>-arm64.zip` and `Praxis-<version>-x64.zip` — signed.
- `Praxis-<version>-arm64.dmg.blockmap` etc. — electron-builder
  metadata for future auto-update.

## What the pipeline does

The 11-step pipeline in `packages/desktop/scripts/build-dist.sh`:

1. `pnpm build` compiles all workspace packages into their `dist/`.
2. `electron-vite build` bundles main / preload / renderer into
   `packages/desktop/out/`.
3. `pnpm deploy --inject-workspace-packages` flattens the workspace
   into `/tmp/praxis-desktop-deploy/` so electron-builder's pnpm
   tracer can find every transitive dependency.
4. (No-op narration; symlink dereference is implicit.)
5. Copy the `drizzle/` migrations into the deploy and patch the
   deploy's `package.json` so `extraResources.from` is deploy-relative.
6. `electron-rebuild` rebuilds `better-sqlite3` and `canvas` against
   Electron's ABI.
7. `electron-builder --mac` produces a `.app`, an unsigned `.dmg`, and
   per-arch `.zip` files in `release/`.
8. Extract the `.app`'s `app.asar`, undo electron-builder's
   `@praxis/X@@praxis/X/...` path mangling, and repack with the same
   `--unpack` flags that preserve native-binary unpacking.
9. **Sign the `.app`.** With `MAC_SIGNING_IDENTITY` set, `codesign`
   uses the production identity, hardened runtime
   (`--options runtime`), the entitlements at
   `packages/desktop/build/entitlements.mac.plist`, and a secure
   timestamp. Without it, ad-hoc.
10. **Rebuild the `.dmg` and sign it.** electron-builder's original
    `.dmg` embeds the pre-fixup `.app` whose signature is now stale,
    so we rebuild via `hdiutil create` and resign. (Skipped under
    ad-hoc.)
11. **Notarise and staple.** `xcrun notarytool submit --wait` blocks
    until Apple's response (typically 5-15 minutes); `xcrun stapler
    staple` embeds the notary ticket onto the `.dmg`. Skipped if any
    of the three notary env vars is unset.

The asar-surgery → resign → rebuild-dmg → notarise → staple ordering
is load-bearing. Re-ordering steps invalidates either the signature
or the notary stamp. Future changes to `build-dist.sh` that touch
this region must preserve the order.

## Hardened runtime entitlements

The plist at `packages/desktop/build/entitlements.mac.plist` enables:

- `com.apple.security.cs.allow-jit` — V8 JIT in the renderer.
- `com.apple.security.cs.allow-unsigned-executable-memory` — QuickJS
  WASM and JIT in some native modules.
- `com.apple.security.cs.disable-library-validation` — native modules
  built by electron-rebuild aren't Apple-signed; without this, dlopen
  rejects them.
- `com.apple.security.cs.allow-dyld-environment-variables` — Electron
  baseline for child-process DYLD propagation.
- `com.apple.security.network.client` and `network.server` — outbound
  (engine APIs, RAG fetch) and inbound (local IPC ports).
- `com.apple.security.files.user-selected.read-write` — document
  ingestion via file picker.

If the signed app crashes immediately at launch with a SIGKILL or a
dyld error, the entitlements plist is the first place to look — a
hardened-runtime app missing the right entitlement gets terminated
with no helpful message.

## Verifying the result

```bash
# Confirm the .dmg is signed with the expected identity.
codesign -dv --verbose=4 packages/desktop/release/Praxis-1.0.0-arm64.dmg

# Confirm the notary ticket is stapled.
xcrun stapler validate packages/desktop/release/Praxis-1.0.0-arm64.dmg
```

Manual smoke test — required before shipping:

1. Copy the `.dmg` to a clean macOS account (or a fresh VM).
2. Double-click to mount, drag Praxis to /Applications, eject.
3. Launch Praxis from /Applications. Expect no Gatekeeper warning,
   no "downloaded from the internet" prompt that requires explicit
   approval.
4. Run a teach session end-to-end (the
   `epic-phase-19-ship-checklist` script). Watch for any crash that
   would point at a missing entitlement.

## Troubleshooting

**"errSecInternalComponent" during codesign.**
Keychain is locked or the cert is in the wrong keychain. Run
`security unlock-keychain ~/Library/Keychains/login.keychain-db`.

**Notary submission rejected with "Hardened runtime is not enabled".**
Either `MAC_SIGNING_IDENTITY` was set but the script didn't pick up
`--options runtime`, or the entitlements plist path is wrong. Verify
`packages/desktop/build/entitlements.mac.plist` exists and the
`packages/desktop/package.json` `build.mac.entitlements` value matches.

**Notary submission times out / hangs.**
Apple's notary service occasionally takes hours instead of minutes.
The script blocks; if you need to abort, `Ctrl-C` is safe — the
submission stays queued at Apple and you can re-run `xcrun notarytool
log <submission-id>` later. v1 doesn't auto-retry; if this becomes
painful, post-v1 work can move notarisation behind a separate command.

**Signed app crashes immediately on launch.**
A hardened-runtime entitlement is missing. Check the system log
(`Console.app`, filter by `Praxis`) for the relevant entitlement
name and add it to `packages/desktop/build/entitlements.mac.plist`.

**Gatekeeper still warns despite a "successful" signed build.**
The notary ticket isn't stapled. Confirm `xcrun stapler validate`
returns `The validate action worked!`. If staple failed silently,
re-run the build or run `xcrun stapler staple` manually against the
`.dmg`.

## CI provisioning

v1 doesn't ship a CI workflow file; signed builds happen on the
maintainer's machine. When CI signing is added post-v1:

1. Store the signing certificate as a base64-encoded GitHub secret;
   decode and import via `security import` on the runner.
2. Store `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and
   `APPLE_TEAM_ID` as GitHub secrets.
3. Run `pnpm --filter @praxis/desktop dist:mac` in the macOS runner
   with the env vars set; nothing else changes.
