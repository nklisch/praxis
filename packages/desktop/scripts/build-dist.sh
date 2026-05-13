#!/usr/bin/env bash
# Orchestrates the desktop dist build.
#
# Why this is more than `electron-builder`:
#
#   electron-builder's pnpm tracer doesn't follow transitive deps through
#   pnpm's isolated symlink layout (.pnpm/<pkg>@<ver>/node_modules/...).
#   The result is missing transitives in the asar — bindings, @ai-sdk/gateway,
#   @opentelemetry/api, etc. — and the app crashes at startup.
#
#   The fix is `pnpm deploy --inject-workspace-packages` which produces a
#   self-contained directory with a flat node_modules. But that introduces
#   two new wrinkles this script handles:
#
#   1. inject-workspace-packages produces symlinks to long-encoded .pnpm
#      paths (e.g. @praxis+core@file++++Users+...). electron-builder
#      mangles those into asar paths like @praxis/core@@praxis/core/...
#      which Node module resolution can't find. We dereference the
#      symlinks before electron-builder runs (mostly), and post-process
#      the asar to rename anything that still got mangled.
#
#   2. The deploy strips devDependencies, including electron itself, so
#      electron-rebuild has to run with --module-dir + --version against
#      the deploy directory rather than via pnpm-filter.
#
# Usage: build-dist.sh [dir|mac|win|linux]   (default: dir)
#
# Multi-arch macOS builds:
#   When TARGET=mac, native modules (better-sqlite3, canvas) are rebuilt for
#   both arm64 and x64 into separate staging directories. electron-builder is
#   then invoked once per arch (--arch arm64, --arch x64), with the matching
#   native binaries swapped into the deploy before each run. Both archs go
#   through the same asar-fixup, signing, and notarisation pipeline. The
#   result is two separate .dmg installers — one per arch — collected in
#   packages/desktop/release/.
#
#   For non-mac targets (win, linux, dir), the original single-pass rebuild
#   is preserved because those targets are always built on the matching host.

set -euo pipefail

TARGET="${1:-dir}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_ROOT="$(cd "$DESKTOP_DIR/../.." && pwd)"
# Deploy outside the workspace tree. electron-builder's pnpm-aware tracer
# walks UP from the build dir looking for `pnpm-workspace.yaml` to identify
# the workspace root. If the deploy is inside `elite-tutor/`, the tracer
# finds the parent workspace, falls back to tracing from there, and ignores
# the carefully-constructed flat node_modules in the deploy. Putting the
# deploy in /tmp ensures the tracer sees it as a standalone package.
DEPLOY_DIR="${PRAXIS_DEPLOY_DIR:-/tmp/praxis-desktop-deploy}"
RELEASE_DIR="$DESKTOP_DIR/release"

ASARBIN="$(find "$WORKSPACE_ROOT/node_modules/.pnpm" -path '*@electron+asar*/node_modules/@electron/asar/bin/asar.js' 2>/dev/null | head -1)"
ELECTRON_REBUILD="$WORKSPACE_ROOT/node_modules/.bin/electron-rebuild"
ELECTRON_BUILDER="$WORKSPACE_ROOT/node_modules/.bin/electron-builder"
ELECTRON_VERSION="$(node -p "require('$DESKTOP_DIR/package.json').devDependencies.electron")"

# ---------------------------------------------------------------------------
# postprocess_mac_app <arch>
#
# Fixes @praxis path mangling in the asar, re-signs the .app, rebuilds and
# re-signs the .dmg, and (when credentials are present) notarises + staples.
#
# $1 — the arch string passed to electron-builder ("arm64", "x64", or ""
#      for a dir/single-arch build). Used only for log labels and to produce
#      arch-suffixed .dmg names during a dual-arch mac run.
# ---------------------------------------------------------------------------
postprocess_mac_app() {
  local ARCH="${1:-}"

  local APP_PATH
  APP_PATH="$(find "$DEPLOY_DIR/release" -maxdepth 3 -name 'Praxis.app' -type d 2>/dev/null | head -1)"
  [ -n "$APP_PATH" ] || return 0

  local ARCH_LABEL=""
  [ -n "$ARCH" ] && ARCH_LABEL=" ($ARCH)"

  echo "==> [8/11] Fix @praxis path mangling in asar${ARCH_LABEL}"
  local ASAR_PATH="$APP_PATH/Contents/Resources/app.asar"
  local STAGING="$DEPLOY_DIR/.asar-staging"
  rm -rf "$STAGING"
  node "$ASARBIN" extract "$ASAR_PATH" "$STAGING"

  if [ -d "$STAGING/node_modules/@praxis" ]; then
    pushd "$STAGING/node_modules/@praxis" > /dev/null
    for mangled in *@@praxis; do
      [ -d "$mangled" ] || continue
      pkg="${mangled%@@praxis}"
      if [ -d "$mangled/$pkg" ]; then
        mv "$mangled/$pkg" "../tmp-$pkg"
        rm -rf "$mangled"
        mv "../tmp-$pkg" "$pkg"
      fi
    done
    popd > /dev/null
  fi

  # Repack must preserve the "unpacked" flag for native binaries — without
  # this, dlopen on .node files extracts to /tmp where @rpath/<dylib> can't
  # find sibling shared libraries that live in app.asar.unpacked. Mirror
  # the asarUnpack patterns from packages/desktop/package.json plus a
  # blanket glob for binary file types.
  node "$ASARBIN" pack "$STAGING" "$ASAR_PATH" \
    --unpack "**/*.{node,dylib,so,dll}" \
    --unpack-dir "{**/node_modules/better-sqlite3,**/node_modules/canvas,**/node_modules/sqlite-vec,**/node_modules/sqlite-vec-*,**/node_modules/@img/sharp-*,**/node_modules/sharp,**/node_modules/onnxruntime-node,**/node_modules/onnxruntime-common}"
  rm -rf "$STAGING"

  # Sign the .app. With env-driven creds we use the production identity
  # plus hardened runtime + entitlements; without them we fall back to
  # ad-hoc (the local-dev path that's worked since the script existed).
  local SIGN_IDENTITY="${MAC_SIGNING_IDENTITY:-}"
  local ENTITLEMENTS="$DESKTOP_DIR/build/entitlements.mac.plist"

  echo "==> [9/11] Sign .app${ARCH_LABEL}"
  if [ -n "$SIGN_IDENTITY" ] && [ -f "$ENTITLEMENTS" ]; then
    echo "    identity: $SIGN_IDENTITY (hardened runtime + entitlements)"
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

  # If a .dmg exists and we have a real identity, rebuild it from the
  # (now-modified) .app — the original .dmg embeds the pre-fixup .app
  # whose signature is now stale. Then notarise + staple.
  #
  # For dual-arch mac builds, rename the .dmg to include the arch suffix
  # (e.g. Praxis-arm64.dmg, Praxis-x64.dmg) so both artifacts survive in
  # the same release/ directory.
  local DMG_PATH
  DMG_PATH="$(find "$DEPLOY_DIR/release" -maxdepth 2 -name '*.dmg' 2>/dev/null | head -1)"
  if [ -n "$SIGN_IDENTITY" ] && [ -n "$DMG_PATH" ]; then
    # Derive a per-arch output path when ARCH is set.
    local OUT_DMG="$DMG_PATH"
    if [ -n "$ARCH" ]; then
      local DMG_DIR DMG_BASE
      DMG_DIR="$(dirname "$DMG_PATH")"
      DMG_BASE="$(basename "$DMG_PATH" .dmg)"
      OUT_DMG="$DMG_DIR/${DMG_BASE}-${ARCH}.dmg"
    fi

    echo "==> [10/11] Rebuild .dmg from signed .app and sign it${ARCH_LABEL}"
    rm -f "$DMG_PATH" "$OUT_DMG"
    hdiutil create -volname "Praxis" -srcfolder "$APP_PATH" -ov -format UDZO "$OUT_DMG"
    codesign --force --sign "$SIGN_IDENTITY" --timestamp "$OUT_DMG"

    if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
      echo "==> [11/11] Submit to Apple notary (this can take 5-15 minutes) and staple${ARCH_LABEL}"
      xcrun notarytool submit "$OUT_DMG" \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_APP_SPECIFIC_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" \
        --wait
      xcrun stapler staple "$OUT_DMG"
    else
      echo "==> [11/11] Skipping notarisation — APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not all set"
    fi
  fi
}

# ---------------------------------------------------------------------------
# build_mac_arch <arch>
#
# Swaps in the arch-specific native binaries, runs electron-builder for the
# given arch, then postprocesses the resulting .app.
# Called only when TARGET=mac.
# ---------------------------------------------------------------------------
build_mac_arch() {
  local ARCH="$1"
  local NATIVE_STAGING

  if [ "$ARCH" = "arm64" ]; then
    NATIVE_STAGING="$DEPLOY_DIR/.native-arm64"
  else
    NATIVE_STAGING="$DEPLOY_DIR/.native-x64"
  fi

  echo ""
  echo "==> [7/8] Run electron-builder --mac --arch $ARCH"

  # Swap in arch-specific native binaries.
  rm -rf "$DEPLOY_DIR/node_modules"
  cp -R "$NATIVE_STAGING" "$DEPLOY_DIR/node_modules"

  # Clean any previous release output for this arch so electron-builder
  # doesn't collide with stale artifacts.
  rm -rf "$DEPLOY_DIR/release"

  cd "$DEPLOY_DIR"
  "$ELECTRON_BUILDER" --mac --arch "$ARCH"

  # Post-process: fix asar + sign + notarise for this arch's .app.
  postprocess_mac_app "$ARCH"

  # Copy arch artifacts to a stable location before we wipe release/ for
  # the next arch. They are merged into RELEASE_DIR at the end of the script.
  mkdir -p "$DEPLOY_DIR/.release-$ARCH"
  cp -R "$DEPLOY_DIR/release"/. "$DEPLOY_DIR/.release-$ARCH/"

  cd "$WORKSPACE_ROOT"
}

# ---------------------------------------------------------------------------
# Main build pipeline
# ---------------------------------------------------------------------------

cd "$WORKSPACE_ROOT"

echo "==> [1/8] Compile workspace packages (dist/)"
pnpm build

echo "==> [2/8] Bundle main/preload/renderer (electron-vite)"
pnpm --filter @praxis/desktop exec electron-vite build

echo "==> [3/8] Deploy desktop with all transitives → $DEPLOY_DIR"
rm -rf "$DEPLOY_DIR"
# inject-workspace-packages: copies workspace pkgs (including @praxis/*) into the
# deploy with their full lockfile-resolved dep graph. Transitives stay under
# .pnpm/<pkg>@<ver>/node_modules/ as pnpm siblings — electron-builder follows
# the symlinks correctly from there.
pnpm --config.inject-workspace-packages=true \
     --filter=@praxis/desktop --prod \
     deploy "$DEPLOY_DIR"

echo "==> [4/8] (no symlink derefence — electron-builder needs to follow"
echo "         pnpm symlinks to find transitives in .pnpm/<pkg>/node_modules/."
echo "         The mangled @praxis/X@@praxis/X paths it produces in the asar"
echo "         are fixed up in step 8.)"

echo "==> [5/8] Copy drizzle migrations into deploy + patch extraResources.from"
rm -rf "$DEPLOY_DIR/drizzle"
cp -R "$WORKSPACE_ROOT/drizzle" "$DEPLOY_DIR/drizzle"
node -e "
const fs = require('node:fs');
const p = process.argv[1];
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
for (const r of (d.build?.extraResources ?? [])) {
  if (r.to === 'drizzle') r.from = './drizzle';
}
fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
" "$DEPLOY_DIR/package.json"

if [ "$TARGET" = "mac" ]; then
  # -------------------------------------------------------------------------
  # Dual-arch macOS build: rebuild native modules for both arm64 and x64 into
  # separate staging copies of node_modules, then build each arch in turn.
  # -------------------------------------------------------------------------
  echo "==> [6/8] Rebuild native modules for Electron $ELECTRON_VERSION (arm64 + x64)"

  NATIVE_STAGING_ARM64="$DEPLOY_DIR/.native-arm64"
  NATIVE_STAGING_X64="$DEPLOY_DIR/.native-x64"
  rm -rf "$NATIVE_STAGING_ARM64" "$NATIVE_STAGING_X64"

  # Rebuild arm64 into a staging copy of node_modules.
  cp -R "$DEPLOY_DIR/node_modules" "$NATIVE_STAGING_ARM64"
  "$ELECTRON_REBUILD" --force --only canvas,better-sqlite3 \
    --arch arm64 \
    --module-dir "$NATIVE_STAGING_ARM64" --version "$ELECTRON_VERSION"

  # Rebuild x64 into a separate staging copy.
  cp -R "$DEPLOY_DIR/node_modules" "$NATIVE_STAGING_X64"
  "$ELECTRON_REBUILD" --force --only canvas,better-sqlite3 \
    --arch x64 \
    --module-dir "$NATIVE_STAGING_X64" --version "$ELECTRON_VERSION"

  build_mac_arch arm64
  build_mac_arch x64

  # Merge both arch outputs into a single release/ for the final copy step.
  rm -rf "$DEPLOY_DIR/release"
  mkdir -p "$DEPLOY_DIR/release"
  for arch_dir in "$DEPLOY_DIR"/.release-*; do
    cp -Rn "$arch_dir"/. "$DEPLOY_DIR/release/"
  done

else
  # -------------------------------------------------------------------------
  # Non-mac targets: single host-arch rebuild, same as before.
  # -------------------------------------------------------------------------
  echo "==> [6/8] Rebuild native modules for Electron $ELECTRON_VERSION"
  "$ELECTRON_REBUILD" --force --only canvas,better-sqlite3 \
    --module-dir "$DEPLOY_DIR" --version "$ELECTRON_VERSION"

  echo "==> [7/8] Run electron-builder --$TARGET"
  cd "$DEPLOY_DIR"
  "$ELECTRON_BUILDER" "--$TARGET"

  # macOS / dir builds: post-process the asar and resign.
  APP_PATH="$(find "$DEPLOY_DIR/release" -maxdepth 3 -name 'Praxis.app' -type d 2>/dev/null | head -1)"
  if [ -n "$APP_PATH" ]; then
    postprocess_mac_app ""
  fi
fi

# Mirror artifacts into the desktop package's release/ for tooling that expects them there.
mkdir -p "$RELEASE_DIR"
rm -rf "$RELEASE_DIR"/*
cp -R "$DEPLOY_DIR/release"/. "$RELEASE_DIR/"

echo "==> Done. Artifacts at: $RELEASE_DIR"
