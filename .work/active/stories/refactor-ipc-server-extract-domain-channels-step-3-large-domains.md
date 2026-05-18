---
id: refactor-ipc-server-extract-domain-channels-step-3-large-domains
kind: story
stage: review
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

## Implementation notes

### Domains extracted

- **`artifacts-channel.ts`** (168 LoC): 12 handlers, all non-streaming.
  `courseIdSchema` moved here (only used by artifacts now). `LessonId` and
  `CourseId` type imports not needed (all casts use `as any`). Fixed
  `lessonAssessments` biome-ignore placement (comment must be on the line
  directly before the line with `any`, not across a line break).

- **`author-channel.ts`** (537 LoC): 25 handlers, all non-streaming.
  `requireUnlocked()` closure defined locally (same pattern as config-channel
  in step 2). `previewPrompt` god-function moved verbatim. `LessonId` added to
  top-level type imports (previously inline). `Timestamp` kept as inline import
  for `listConfiguratorActions` (matches original ipc-server.ts pattern).

- **`session-channel.ts`** (180 LoC): 7 invoke handlers + 1 streaming channel
  (`praxis.session.send`). `registerGeneratorStream` with `activeAbortControllers`
  passed through. No closure dependencies on ipc-server.ts — clean seam.
  Streaming cancel (`praxis.session.send.cancel`) registered via `on` inside
  `registerGeneratorStream`; cleanup in ipc-server.ts `removeAllListeners` call
  continues to handle teardown (no regression — prior domain files also don't
  clean up individually).

### `getStudentId` regressions this step

11 total inline `brandId<"StudentId">(services.getDefaultStudentId()) as StudentId`
across the 3 new files (6 in artifacts, 3 in author, 2 in session). Future
`student-id.ts` helper can consolidate all inlines across steps 1-3.

### `registeredChannels` tracking removal

The original ipc-server.ts tracked inline handles in `registeredChannels[]` and
called `ipcMain.removeHandler(channel)` in cleanup. After steps 1-2, all the
already-extracted domain channels were NOT tracked (domain files don't use the
tracking wrapper). With this step, no inline handles remain, so
`registeredChannels` was simply removed. Cleanup only calls `removeAllListeners`
for streaming cancel channels — same as before for those channels.

### Final ipc-server.ts state

**183 LoC** — pure orchestration. Imports, `IpcHandlerResult` interface,
`registerIpcHandlers` function body with 22 `register*Handlers(...)` calls plus
the cleanup closure and `return`.

### Baseline confirmation

- Pre-existing typecheck: 3 errors in UI files (unchanged)
- Lint: clean on all 4 new/modified files
- Tests: 493 tests across 31 files, all pass
