---
id: refactor-stream-handler-template-step-2-quick-check-and-subagent
kind: story
stage: implementing
tags: [refactor]
parent: refactor-stream-handler-template
depends_on: [refactor-stream-handler-template-step-1-helper-and-activity]
release_binding: null
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

## Risk

**Low** — same shape as Step 1, two more adoptions. Filter forwarding is
the only new wrinkle.

## Rollback

`git revert <commit>` — clean. Channels can revert to inline scaffolding
independently of each other if needed.
