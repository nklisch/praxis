---
id: refactor-stream-handler-template-step-2-quick-check-and-subagent
kind: story
stage: done
tags: [refactor]
parent: refactor-stream-handler-template
depends_on: [refactor-stream-handler-template-step-1-helper-and-activity]
release_binding: v0.1.3
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 2: adopt registerSubscriberStream in quick-check + subagent

## Brief

Convert two more subscriber-style streaming channels to use the
`registerSubscriberStream` helper landed in Step 1. Quick-check has zero
extra args; subagent takes an optional `parentCallId` filter that gets
forwarded into `services.subAgent.subscribe(cb, filter)`.

## Files

- `packages/desktop/electron/main/quick-check-channel.ts`
- `packages/desktop/electron/main/subagent-channel.ts`

## Current state

See files. Both follow the activity-channel shape exactly with the noted
variances.

## Target state

```ts
// quick-check-channel.ts (after non-streaming handlers)
registerSubscriberStream<QuickCheckEvent>(
  {
    channelBase: "praxis.quickCheck.events",
    log,
    webContentsGetter,
    activeAbortControllers,
  },
  { handle, on },
  { subscribe: (cb) => quickCheck.subscribe(cb) },
);

// subagent-channel.ts (after praxis.subAgent.list handler)
registerSubscriberStream<SubAgentEvent, [parentCallId?: string]>(
  {
    channelBase: "praxis.subAgent.events",
    log,
    webContentsGetter,
    activeAbortControllers,
  },
  { handle, on },
  {
    subscribe: (cb, [parentCallId]) => {
      const filter = parentCallId !== undefined ? { parentCallId } : undefined;
      return services.subAgent.subscribe(cb, filter);
    },
  },
);
```

## Implementation notes

- `parentCallId` is a positional arg from the renderer's
  `ipcRenderer.invoke("praxis.subAgent.events.start", streamId, parentCallId)`.
  The helper signature `Args extends readonly unknown[]` carries it through
  to the subscribe callback's second tuple argument.
- Both files keep their non-streaming endpoints (`praxis.quickCheck.resolve`,
  `praxis.subAgent.list`) verbatim.
- After this step, three channels share the helper; subagent's filter
  pattern is the regression risk — verify with the existing subagent
  envelope tests if present.

## Tests to verify

- `pnpm --filter @praxis/desktop test`
- Especially any test files matching `quick-check-channel*` or
  `subagent-channel*` or `streaming-channel-error-redaction`

## Acceptance criteria

- [ ] Typecheck/lint/test green (baseline preserved)
- [ ] Each channel file's net LoC drops by ~40
- [ ] Subagent's `parentCallId` filter behavior preserved — test that an
      invoke without `parentCallId` and one with it both still work
- [ ] No wire-format change

## Implementation notes

- **quick-check-channel.ts**: 81 → 40 lines (−41 LoC). Removed inline
  `IpcStreamMessage` import and `redactSecrets`/`serializeErrorRedacted`
  imports (no longer needed). The `wrapEnvelope` resolve handler is
  unchanged and kept verbatim.
- **subagent-channel.ts**: 80 → 44 lines (−36 LoC). Same unused imports
  dropped. The variadic `[parentCallId?: string]` tuple generic compiled
  cleanly — no type escape hatch needed.
- **Log key diffs**: The old subagent implementation logged
  `"subagent.subscribe"` / `"subagent.unsubscribe"` / `"subagent.error"`
  (lowercase `subagent`). The helper derives from `channelBase
  "praxis.subAgent.events"` → logPrefix `"subAgent.events"` → now logs
  `"subAgent.events.subscribe"` / `"subAgent.events.unsubscribe"` /
  `"subAgent.events.error"`. No tests assert on these log keys so this
  is not a test regression. The quick-check keys were already
  `"quickCheck.events.*"` in both old and new implementations — no diff.
- **Test updates**: None. All 8 tests in
  `streaming-channel-error-redaction.test.ts` (6) and
  `subagent-channel.test.ts` (2) pass against the new implementations
  without modification.
- **Baseline confirmation**: 3 pre-existing UI typecheck errors
  (chat-tab-body.tsx, chat.tsx, notes-list.tsx) unchanged. The
  `pnpm --filter @praxis/desktop test` startup failure (`packages/desktop/tests`
  not found) is also pre-existing — confirmed by running against the
  baseline before applying changes.

## Risk

**Low** — same shape as Step 1, two more adoptions. Filter forwarding is
the only new wrinkle.

## Rollback

`git revert <commit>` — clean. Channels can revert to inline scaffolding
independently of each other if needed.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none (the log-key shape change for subagent — `subagent.subscribe` → `subAgent.events.subscribe` — is the same observability shift noted in step 1's review).

**Notes**: Two clean adoptions of `registerSubscriberStream`. Quick-check (−41 LoC) is the simplest case; subagent (−36 LoC) exercises the variadic `Args = [parentCallId?: string]` generic which compiled cleanly. Both files dropped now-unused imports (`IpcStreamMessage`, `redactSecrets`, `serializeErrorRedacted`). Wire format preserved. All 8 streaming-envelope + subagent-channel tests pass unmodified.
