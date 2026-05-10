# Update channel

Praxis ships v1 with a manual-download update flow. The desktop app
checks a maintainer-hosted JSON feed once per launch; when a newer
version is published, an in-app banner offers a link to the download
page. The user clicks, downloads the new installer, and runs it
themselves.

A built-in updater (electron-updater pulling signed installers from a
publish provider) is the post-v1 path.

## What this covers

- The decision: manual download vs built-in updater.
- The feed JSON format the maintainer hosts.
- How to cut a release in this model.
- The migration path to electron-updater when the project is ready.

Windows and Linux follow the same flow as macOS; the UpdateBanner is
platform-agnostic.

## Why manual download for v1

- **No publish infrastructure needed.** electron-updater requires a
  publish provider (S3, generic HTTP, or GitHub Releases) plus a CI
  pipeline. v1 doesn't have either; bringing them up is a separate
  feature.
- **Slow update cadence at launch.** An educational app at v1.0
  releases on the order of weeks-to-months, not days. The friction of
  "click the download link, run the installer" is one-off and small at
  this cadence.
- **Reversible.** Switching to electron-updater later is purely
  additive. The `<UpdateBanner>` is removed, electron-updater's native
  update dialog takes over, and the feed JSON is replaced by
  electron-updater's `latest-mac.yml` / `latest.yml`.

## Feed format

A small JSON file the maintainer hosts at any URL. Example:

```json
{
  "version": "1.0.1",
  "releaseDate": "2026-06-01T00:00:00.000Z",
  "downloadUrl": "https://example.com/downloads/Praxis-1.0.1.dmg",
  "releaseNotesUrl": "https://example.com/release-notes/1.0.1"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `version` | yes | Semver `MAJOR.MINOR.PATCH`. Compared lexicographically against the running app version. |
| `downloadUrl` | yes | Where the user is sent when they click "Download". Should point to the signed installer for the platform the user is running. |
| `releaseDate` | no | ISO-8601 datetime. Currently unused by the app but useful for human readers. |
| `releaseNotesUrl` | no | Link to release notes. Currently unused; reserved for a future "What's new" affordance. |

The feed is validated at parse time by
`packages/core/src/services/update-service.ts`. Unknown fields are
ignored; missing required fields fail validation and the banner stays
hidden (logged on the main process side).

## Configuration

The maintainer configures the feed URL via the `PRAXIS_UPDATE_FEED_URL`
environment variable in production builds. When unset, the update check
is a no-op — the banner never renders. v1.0.0 likely ships with this
unset (no feed exists yet); v1.0.1 is when the maintainer wires it up.

```bash
# In production builds:
export PRAXIS_UPDATE_FEED_URL="https://example.com/praxis-update.json"
```

## Operational steps for cutting a release

1. Bump the `version` field in `packages/desktop/package.json` and any
   linked workspace versions; commit.
2. Build signed installers per `docs/CODE-SIGNING.md`:
   ```bash
   pnpm --filter @praxis/desktop dist:mac
   ```
3. Upload the signed `.dmg` (and `.zip`, optionally) to the chosen
   hosting (CDN, S3, GitHub Release, etc.).
4. Update the feed JSON with the new version, release date, and
   download URL. Push it to the location that `PRAXIS_UPDATE_FEED_URL`
   points at.
5. (Optional) Bump installed users' attention by sending a release-notes
   notification or an email — the in-app banner picks up the new feed
   on each user's next launch.

## Migration to electron-updater (post-v1)

When the project is ready to add automatic, in-place updates:

1. Switch `notarize: false` → `notarize: true` in
   `packages/desktop/package.json` `build.mac` (notarization is
   required for electron-updater on macOS).
2. Add a `publish` block to `build` pointing at a provider (S3,
   `generic`, or `github`):
   ```json
   "publish": {
     "provider": "generic",
     "url": "https://example.com/praxis-updates/"
   }
   ```
3. Install `electron-updater` and wire it into the main process so it
   checks the publish endpoint and prompts the user when an update is
   ready to install.
4. Remove `<UpdateBanner>` from the renderer layout — electron-updater
   provides its own native update dialog.
5. Remove `PRAXIS_UPDATE_FEED_URL` documentation; replace with the
   publish-provider config.

The transition is a single feature, not a refactor — no foundation-doc
changes required. The signed-installer pipeline already supports
notarization (it's just gated by env vars today).

## Troubleshooting

**Banner doesn't appear after a release.**
Check that `PRAXIS_UPDATE_FEED_URL` is set in the user's environment.
Without it, the check is intentionally disabled. In Electron, env vars
must be set before launching the app — packaged builds inherit the
shell environment that started them.

**Banner shows the wrong version.**
The feed JSON's `version` field is the source of truth. The app
compares this string lexicographically (per
`compareVersions(a, b)`) against `app.getVersion()` from
`packages/desktop/package.json`. If the values disagree, fix the feed.

**Feed parse failures are silent on the user's side.**
By design — a malformed feed should not break the user's app. Errors
are logged in the main process via the structured logger; check the
logs at `<userData>/logs/main.log` if a release isn't surfacing.
