---
id: epic-phase-19-auto-update
kind: feature
stage: implementing
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

## Design decisions

- **Decision: manual download with an in-app version-check ping.** Ships
  with v1. The built-in `electron-updater` path is post-v1 because (a)
  it requires standing up a publish provider (S3, generic HTTP, or
  GitHub Releases) and a CI pipeline, neither of which exist in v1; (b)
  the update cadence for an educational app at v1.0 is going to be
  slow — a manual flow is sufficient until releases become frequent;
  (c) the manual path is reversible — switching to electron-updater
  later is purely additive.
- **Feed format: a small JSON file the maintainer hosts somewhere.**
  Praxis isn't tied to GitHub Releases specifically; the feed URL is a
  config. The shape is intentionally minimal:
  ```json
  {
    "version": "1.0.1",
    "releaseDate": "2026-06-01",
    "downloadUrl": "https://…/Praxis-1.0.1-arm64.dmg",
    "releaseNotesUrl": "https://…/release-notes/1.0.1"
  }
  ```
- **Configuration: `PRAXIS_UPDATE_FEED_URL` env var, no config_kv
  entry.** Update-feed URL is operational config, not user preference.
  Mirrors `PRAXIS_API_KEY` and similar env-var-only knobs in
  `engine-config.ts`. Default unset → update check is a no-op (banner
  never appears) — v1 ship is safe even if the maintainer hasn't set
  up a feed yet.
- **Check cadence: once per app launch, opportunistic.** Not a
  background polling loop. Adding a 24-hour periodic re-check is
  trivial post-v1; v1 keeps it simple.
- **Banner dismissal: per-version, persisted in `config_kv`.** Once the
  user dismisses the banner for v1.0.1, it doesn't reappear unless a
  newer version is published. Mirrors the `firstRunCompletedAt` pattern.
- **Semver comparison via a tiny inline helper, not a dep.** Praxis
  versions are simple `MAJOR.MINOR.PATCH`; pulling in `semver` (~140KB
  packed) for `compareVersions(a, b): -1 | 0 | 1` is overkill.
- **No telemetry.** Update-adoption analytics are post-v1.
- **No child stories.** ~9 small files covering service + IPC + client
  + hook + banner + router + docs + tests. Single-stride
  implementation, tightly cohesive.

## Architectural choice

**Lightweight feed-driven manual update with env-var-gated check.**
The maintainer hosts a JSON file at a URL of their choosing. On launch,
the app fetches it via `https.get` from the main process (avoids CORS
in the renderer), compares the version, and surfaces a banner if the
remote version is newer. The banner links to the feed's
`downloadUrl`; clicking opens the URL in the default browser.

Alternatives considered:

- *electron-updater + `notarize: true` in build config*: the eventual
  path. Rejected for v1 because of the publish-infrastructure +
  CI requirement.
- *Bundled "Check for updates" menu item only, no automatic check*:
  rejected — adds friction for the user to discover updates exist;
  the once-per-launch check has near-zero cost when the env var is
  set and zero cost when it's not.
- *GitHub Releases API directly*: rejected — pins Praxis to GitHub.
  The feed-JSON pattern lets the maintainer host wherever, including
  at `releases.github.com` if that's the choice.

## Implementation Units

### Unit 1 (trickiest): `packages/core/src/services/update-service.ts`
**File**: `packages/core/src/services/update-service.ts` (new)

The service that fetches the feed, parses + validates, and compares
versions.

```typescript
import { z } from "zod";
import type { ServiceDeps } from "./types.js";

const FEED_URL_ENV = "PRAXIS_UPDATE_FEED_URL";

export const UpdateFeedSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver"),
  releaseDate: z.string().datetime().optional(),
  downloadUrl: z.url(),
  releaseNotesUrl: z.url().optional(),
});

export type UpdateFeed = z.infer<typeof UpdateFeedSchema>;

export type UpdateCheckResult =
  | { status: "disabled" }
  | { status: "up-to-date"; current: string }
  | { status: "available"; current: string; latest: UpdateFeed }
  | { status: "error"; message: string };

export interface UpdateService {
  /**
   * One-shot update check. Returns "disabled" if no feed URL is configured;
   * otherwise fetches and compares against `currentVersion`.
   */
  checkLatest(currentVersion: string): Promise<UpdateCheckResult>;
}

export class UpdateServiceImpl implements UpdateService {
  constructor(private readonly deps: ServiceDeps) {}

  async checkLatest(currentVersion: string): Promise<UpdateCheckResult> {
    const url = process.env[FEED_URL_ENV];
    if (!url) return { status: "disabled" };

    let raw: unknown;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Praxis-update-check" },
      });
      if (!res.ok) {
        return { status: "error", message: `HTTP ${res.status}` };
      }
      raw = await res.json();
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const parsed = UpdateFeedSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", message: "feed JSON failed validation" };
    }

    if (compareVersions(parsed.data.version, currentVersion) > 0) {
      return { status: "available", current: currentVersion, latest: parsed.data };
    }
    return { status: "up-to-date", current: currentVersion };
  }
}

/**
 * Three-way version compare. Returns negative/zero/positive consistent
 * with Array.sort. Versions must be `MAJOR.MINOR.PATCH`.
 */
export function compareVersions(a: string, b: string): number {
  const [aMaj, aMin, aPatch] = a.split(".").map(Number);
  const [bMaj, bMin, bPatch] = b.split(".").map(Number);
  if (aMaj !== bMaj) return (aMaj ?? 0) - (bMaj ?? 0);
  if (aMin !== bMin) return (aMin ?? 0) - (bMin ?? 0);
  return (aPatch ?? 0) - (bPatch ?? 0);
}
```

**Implementation Notes**:

- The service runs in the main process (where `fetch` is available
  in Node 24). No CORS concerns from the renderer.
- The 5-second timeout is implicit via Node's default fetch timeout
  (60s); explicit timeout via `AbortController` is post-v1 polish.
- The error variant captures the message rather than throwing —
  callers get a typed result and don't need try/catch.

**Acceptance Criteria**:

- [ ] `checkLatest` returns `{ status: "disabled" }` when env var unset.
- [ ] Returns `{ status: "available", latest: { ... } }` when feed
      version > current.
- [ ] Returns `{ status: "up-to-date", current }` when feed version
      <= current.
- [ ] Returns `{ status: "error", message }` on network failure or
      schema mismatch — never throws.
- [ ] `compareVersions` returns 0 for equal, -1 for a<b, 1 for a>b.

### Unit 2: extend `PraxisClient` and `ServiceDeps`
**Files**: `packages/core/src/types/client.ts`,
`packages/core/src/services/types.ts`,
`packages/core/src/services/index.ts` (export wiring)

Add `update: UpdateService` to `PraxisClient`. Add the same to
`ServiceDeps` so `UpdateServiceImpl` can be registered alongside the
others. Update `buildServices` (wherever it lives) to instantiate and
expose.

**Acceptance Criteria**:

- [ ] `PraxisClient.update` typed.
- [ ] `pnpm typecheck` clean.

### Unit 3: IPC handler
**File**: `packages/desktop/electron/main/ipc-server.ts`

```typescript
handle("praxis.update.checkLatest", async (_event, currentVersion: string) => {
  return services.update.checkLatest(currentVersion);
});
```

**Acceptance Criteria**:

- [ ] Handler registered.
- [ ] Handler delegates to `services.update.checkLatest`.

### Unit 4: client method
**File**: `packages/client/src/services/update-client.ts` (new),
`packages/client/src/client.ts` (wire into `createPraxisClient`)

```typescript
import type { UpdateCheckResult } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

export class UpdateClient {
  constructor(private readonly transport: ClientTransport) {}

  checkLatest(currentVersion: string): Promise<UpdateCheckResult> {
    return this.transport.invoke<UpdateCheckResult>(
      "praxis.update.checkLatest",
      currentVersion,
    );
  }
}
```

**Acceptance Criteria**:

- [ ] Client method routes to `praxis.update.checkLatest`.
- [ ] `createPraxisClient` returns `update: new UpdateClient(...)`.

### Unit 5: `useUpdateCheck` hook
**File**: `packages/ui/src/hooks/use-update-check.ts` (new)

Reads the current app version (passed via prop or context) and runs the
check on mount. Persists per-version dismissal in `config_kv` via a
small additional ConfigService method... actually, simpler: persist in
localStorage. localStorage is per-user, per-app, scope-correct for "I
dismissed this banner."

```typescript
import { useEffect, useState } from "react";
import type { UpdateCheckResult } from "@praxis/core/types";
import { usePraxisClient } from "../context/client-context.js";

const DISMISS_KEY = "praxis.update.dismissedVersion";

export function useUpdateCheck(currentVersion: string) {
  const client = usePraxisClient();
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    client.update
      .checkLatest(currentVersion)
      .then((r) => { if (!cancelled) setResult(r); })
      .catch(() => { if (!cancelled) setResult({ status: "error", message: "ipc-failed" }); });
    return () => { cancelled = true; };
  }, [client, currentVersion]);

  const dismiss = () => {
    if (result?.status === "available") {
      try {
        window.localStorage.setItem(DISMISS_KEY, result.latest.version);
      } catch { /* noop */ }
      setResult({ status: "up-to-date", current: result.current });
    }
  };

  const dismissed = (() => {
    if (result?.status !== "available") return false;
    try {
      return window.localStorage.getItem(DISMISS_KEY) === result.latest.version;
    } catch {
      return false;
    }
  })();

  return { result, dismiss, dismissed };
}
```

**Implementation Notes**:

- localStorage is fine for the dismissal state — per-user, persisted,
  scoped to the app origin. Simpler than threading a new IPC for a
  trivial UI flag.
- The hook returns `result === null` while loading; the consumer can
  decide whether to render anything.
- Cancellation via `cancelled` flag prevents state updates after
  unmount.

**Acceptance Criteria**:

- [ ] Hook returns `result: null` initially.
- [ ] Resolves to a typed `UpdateCheckResult`.
- [ ] `dismiss()` writes localStorage and clears the visible state.
- [ ] `dismissed` reflects localStorage for the current latest version.

### Unit 6: `UpdateBanner` component
**Files**: `packages/ui/src/components/update-banner.tsx` (new),
`packages/ui/src/components/update-banner.module.css` (new)

A small, dismissible banner shown at the top of the layout when an
update is available.

```tsx
import type { JSX } from "react";
import { useUpdateCheck } from "../hooks/use-update-check.js";
import { COPY } from "../lib/copy.js";
import styles from "./update-banner.module.css";

export interface UpdateBannerProps {
  currentVersion: string;
}

export function UpdateBanner({ currentVersion }: UpdateBannerProps): JSX.Element | null {
  const { result, dismiss, dismissed } = useUpdateCheck(currentVersion);

  if (!result || result.status !== "available" || dismissed) return null;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.message}>
        {COPY.update.available(result.latest.version)}
      </span>
      <a
        className={styles.downloadLink}
        href={result.latest.downloadUrl}
        target="_blank"
        rel="noreferrer noopener"
      >
        {COPY.update.downloadLabel}
      </a>
      <button
        type="button"
        className={styles.dismissButton}
        onClick={dismiss}
        aria-label={COPY.update.dismissLabel}
      >
        ×
      </button>
    </div>
  );
}
```

**Implementation Notes**:

- Banner is `null` when no update / dismissed / still loading — never
  shows during the loading flicker.
- `target="_blank"` + `rel="noreferrer noopener"` for the security
  baseline on external links.
- COPY namespace `COPY.update.*` added in Unit 7.

**Acceptance Criteria**:

- [ ] Renders nothing when `result === null`.
- [ ] Renders nothing when `result.status !== "available"`.
- [ ] Renders nothing when `dismissed === true`.
- [ ] Renders the banner with version + download link when status is
      `"available"`.
- [ ] Dismiss button calls `dismiss()`.

### Unit 7: extend `COPY` module + integrate banner into layout
**Files**: `packages/ui/src/lib/copy.ts`,
`packages/ui/src/router.tsx`

Add `COPY.update.*` strings; mount `<UpdateBanner currentVersion={...} />`
inside the root layout (the non-onboarding branch), above `<Nav>` /
`<main>` / `<ActivityRail>`. The current version comes from a small
helper that reads `app.getVersion()` via IPC OR from
`@praxis/desktop/package.json` import — the simpler choice is an IPC
method `praxis.shell.appVersion` returning a string. Actually,
`shell.appVersion` may already exist — check; if not, add it.

If adding a new `praxis.shell.appVersion` IPC method is needed, do that
too (one-line handler).

**Acceptance Criteria**:

- [ ] `COPY.update.available(version)`,
      `COPY.update.downloadLabel`, `COPY.update.dismissLabel` defined.
- [ ] `<UpdateBanner>` mounts in the root layout (non-onboarding
      branch) above `<Nav>`.
- [ ] App version flows from main → renderer correctly.

### Unit 8: `docs/UPDATE-CHANNEL.md` decision record
**File**: `docs/UPDATE-CHANNEL.md` (new)

Outline:

1. **What this covers** — the v1 update story for desktop Praxis.
2. **Decision** — manual download via in-app version-check banner;
   built-in `electron-updater` is post-v1.
3. **Why** — three-bullet rationale (no publish infrastructure for
   v1, slow update cadence at launch, reversible later).
4. **Feed format** — the JSON shape and a sample.
5. **Operational steps** — how the maintainer cuts a release:
   - Build signed installers (per `docs/CODE-SIGNING.md`).
   - Upload artefacts to chosen hosting.
   - Publish/update the feed JSON.
   - Set `PRAXIS_UPDATE_FEED_URL` in production builds.
6. **Migration path to `electron-updater`** — what changes when the
   project is ready: add `publish` provider to `build.mac` + flip
   `notarize: true`; the `<UpdateBanner>` is replaced by
   electron-updater's native dialog.

**Acceptance Criteria**:

- [ ] File exists, documents decision + rationale + feed shape +
      operational flow + migration path.
- [ ] Foundation-doc tone (present-tense, prescriptive, no
      historical notes).

### Unit 9: tests

- `packages/core/src/services/__tests__/update-service.test.ts`:
  - `checkLatest` disabled when env var unset.
  - Returns `available` when feed version > current.
  - Returns `up-to-date` when feed version <= current.
  - Returns `error` on HTTP failure / parse failure.
  - `compareVersions` table.
- `packages/client/src/__tests__/client.test.ts` — extend with the
  `praxis.update.checkLatest` channel-routing assertion.
- `packages/ui/src/__tests__/use-update-check.test.tsx`:
  - Returns `null` initially.
  - Resolves to the IPC-returned result.
  - `dismiss` flips visible state and persists to localStorage.
- `packages/ui/src/__tests__/update-banner.test.tsx`:
  - Renders nothing for `null`, `disabled`, `up-to-date`, `error`,
    `dismissed`.
  - Renders banner for `available` with the download link.

Use `makeFakeClient` to stub `update.checkLatest`. Mock fetch in the
service test via `vi.fn()`.

## Implementation Order

1. **Unit 1** (UpdateService + compareVersions).
2. **Unit 2** (interface + ServiceDeps + index wiring).
3. **Unit 3** (IPC handler).
4. **Unit 4** (UpdateClient + createPraxisClient).
5. **Unit 5** (useUpdateCheck hook).
6. **Unit 7a** (COPY extension).
7. **Unit 6** (UpdateBanner component).
8. **Unit 7b** (router integration + app-version IPC if needed).
9. **Unit 8** (docs).
10. **Unit 9** (tests).

After all units: `pnpm typecheck && pnpm lint && pnpm test`.

## Testing

### Unit tests

- `packages/core/src/services/__tests__/update-service.test.ts`
- `packages/client/src/__tests__/client.test.ts` (extend)
- `packages/ui/src/__tests__/use-update-check.test.tsx`
- `packages/ui/src/__tests__/update-banner.test.tsx`

### Integration coverage

The full "feed JSON updated → user sees banner → clicks → downloads"
path is exercised manually by the ship-checklist's post-v1 release
rehearsal. v1 ship-checklist itself doesn't gate on this feature
working end-to-end (no feed exists at v1.0.0 ship time).

## Risks

- **No feed URL configured at v1.0.0 ship**: by design, the banner
  never shows. Acceptable — an unset env var means "no updates yet";
  v1.0.1 release is when the maintainer wires this up.
- **Feed JSON drift**: if the maintainer hand-edits the feed and breaks
  the schema, `safeParse` returns "error" silently. Logged in main
  process; not surfaced to user (no error banner — the user just
  doesn't see an update). Mitigation: a `pnpm validate-update-feed`
  script could check the feed at release time. Post-v1.
- **Version bypass**: a user can manually delete the localStorage
  entry to re-show the banner. Acceptable — banner is informational,
  not a security gate.
- **Network failure during launch**: the check runs once on mount;
  silent fail, banner doesn't appear. Acceptable.
- **electron-updater migration breaks the banner**: when post-v1 work
  switches to built-in updater, the `<UpdateBanner>` becomes
  redundant. The migration plan in `docs/UPDATE-CHANNEL.md` covers
  removal.

## No child stories

Single-stride feature. Tightly cohesive — the units chain through one
data flow (env var → service → IPC → hook → banner). One agent, one
pass.
