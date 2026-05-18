---
id: refactor-ipc-server-extract-domain-channels-step-3-large-domains
kind: story
stage: implementing
tags: [refactor]
parent: refactor-ipc-server-extract-domain-channels
depends_on: [refactor-ipc-server-extract-domain-channels-step-2-medium-domains]
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 3: Extract 3 large domain channels from ipc-server.ts

## Brief

Final extraction step — the 3 largest domains. After this lands,
`ipc-server.ts` becomes pure orchestration (~400-500 LoC): helper setup,
sequence of `register<Domain>Handlers(services, log)` calls, and the
cleanup/shutdown teardown.

## Domains to extract (this step)

- `artifacts` → new `artifacts-channel.ts` (~11 handlers)
- `author` → new `author-channel.ts` (~24 handlers — the biggest)
- `session` → new `session-channel.ts` **(includes streaming `praxis.session.send.start` + `.cancel` — already uses `registerGeneratorStream` inline; hot path for every tutor turn)**

## Files

- NEW: 3 channel files
- `packages/desktop/electron/main/ipc-server.ts`

## Dep readiness check

`depends_on: [refactor-ipc-server-extract-domain-channels-step-2-medium-domains]`. Verify before starting (same shape as Step 2's check).

## Approach

Same as Steps 1-2. Per domain:
1. Grep for handlers
2. Create channel file
3. Move handlers verbatim
4. Delete inline + add register call

## Special case: session channel (streaming, hot path)

The `session-channel.ts` signature includes streaming:

```ts
export function registerSessionHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void
```

`praxis.session.send.start` is the engine event stream for every tutor
turn. Critical to preserve cancel semantics. Verify via:
- `streaming-channel-error-redaction.test.ts`
- `ipc-server.cancel.test.ts`
- `ipc-server.envelope-migration.test.ts`
- Any session-specific channel tests

## Special case: author channel (large)

`author` has ~24 handlers including the `previewPrompt` god-function
(~82 LoC of inline prompt composition). For THIS story, move
`previewPrompt` verbatim into `author-channel.ts` — don't refactor it.
A future story can clean up its internals.

## Verification

Same as prior steps. Critical end-to-end:
- `pnpm test` (full suite — session is hot path)
- Smoke check via `pnpm dev` if convenient: open a session, send a message, verify streaming works end-to-end (optional but valuable)

## Final state of ipc-server.ts

After this step, ipc-server.ts should look like:

```ts
import { ... } from "...";

export function registerIpcHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  // ... helper setup (createIpcHelpers if needed for any remaining
  // inline handler, requireUnlocked closure, getStudentId closure, etc.)
  
  // Wiring: each domain's handlers register themselves
  registerSessionHandlers(services, webContentsGetter, activeAbortControllers, log);
  registerMemoryHandlers(services, webContentsGetter, activeAbortControllers, log);
  registerArtifactsHandlers(services, log);
  registerAuthorHandlers(services, log);
  registerConfigHandlers(services, log);
  registerAssignmentsHandlers(services, log);
  registerNotesHandlers(services, log);
  registerFlashcardsHandlers(services, log);
  registerTabsHandlers(services, log);
  registerSketchesHandlers(services, log);
  registerConceptMapsHandlers(services, log);
  registerDocumentsHandlers(services, log);
  registerLibraryHandlers(services, log);
  registerLockHandlers(services, log);
  registerAuthHandlers(services, log);
  registerShellHandlers(services, log);
  registerUpdateHandlers(services, log);
  registerPacksHandlers(services, log);
  // ... plus existing pre-extracted: activity, courseCreate, ingest,
  // quickCheck, recommendations, subAgent, citations
}

export function teardownIpcHandlers(): void {
  // removeAllListeners calls for cancellable streaming channels
}
```

## Acceptance criteria

- [ ] 3 new channel files created (`artifacts-channel.ts`, `author-channel.ts`, `session-channel.ts`)
- [ ] All `handle/on("praxis.{artifacts,author,session}.*")` registrations moved OUT of ipc-server.ts
- [ ] `ipc-server.ts` LoC **< 500** (target ~400; the orchestration + cleanup)
- [ ] 3 `register<Domain>Handlers(...)` calls added to wiring block
- [ ] Session streaming + envelope tests all pass unmodified
- [ ] Typecheck/lint/test green (baseline preserved)
- [ ] No wire-format change

## Risk

**Medium** — session is on the hot path of every tutor turn. Tests are
extensive but verify carefully.

## Rollback

`git revert <commit>` — clean per-step.

## Design-flaw escape hatch

If session-channel's streaming move surfaces an unexpected dependency on
something in the ipc-server.ts closure (e.g., a particular log child,
shared schema, or AbortController lifecycle assumption), document and
adapt. If it can't be cleanly extracted, append `## Implementation discovery`, set stage back to `drafting`, commit `revisit: ...`.
