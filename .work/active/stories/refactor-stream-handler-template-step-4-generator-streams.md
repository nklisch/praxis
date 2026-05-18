---
id: refactor-stream-handler-template-step-4-generator-streams
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

# Step 4: adopt registerGeneratorStream in ingest + ipc-server (session.send + memory.episodic)

## Brief

Convert the three async-generator-style streaming channels (Shape B) to use
`registerGeneratorStream`. These channels iterate an `AsyncIterable<E>`
returned by a service method (sometimes with `signal` passed in as a
parameter, sometimes not) rather than subscribing to a callback.

## Files

- `packages/desktop/electron/main/ingest-channel.ts` — `praxis.ingest.start`
  + `praxis.ingest.cancel`
- `packages/desktop/electron/main/ipc-server.ts` — `praxis.session.send.start`
  + `praxis.session.send.cancel` AND `praxis.memory.episodic.start` +
  `praxis.memory.episodic.cancel`

## Target state

```ts
// ingest-channel.ts (in registerIngestHandlers):
registerGeneratorStream<IngestionEvent, [Omit<IngestionRequest, "studentId">]>(
  {
    channelBase: "praxis.ingest",
    log,
    webContentsGetter,
    activeAbortControllers,
  },
  { handle, on },
  {
    iterate: ([req], signal) => {
      const studentId = getOrCreateDefaultStudentId(
        // existing db-access expression preserved verbatim
        (services.session as unknown as { deps: { db: import("@praxis/core/db").PraxisDb } })
          .deps.db,
      );
      return services.ingestion.ingest({ ...req, studentId }, signal);
    },
  },
);

// ipc-server.ts — session.send
registerGeneratorStream<unknown, [sessionId: string, message: string]>(
  {
    channelBase: "praxis.session.send",
    log,
    webContentsGetter,
    activeAbortControllers,
  },
  { handle, on },
  {
    iterate: ([sessionId, message], signal) =>
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      services.session.send(sessionId as any, message, signal),
  },
);

// ipc-server.ts — memory.episodic
registerGeneratorStream<
  EpisodicEvent,
  [{ sessionId?: string; range?: { fromMs: number; toMs: number } }]
>(
  {
    channelBase: "praxis.memory.episodic",
    log,
    webContentsGetter,
    activeAbortControllers,
  },
  { handle, on },
  {
    iterate: ([opts], _signal) => {
      const studentId = getStudentId();
      return services.memory.episodic({
        studentId,
        ...(opts.sessionId !== undefined && {
          sessionId: brandId<"SessionId">(opts.sessionId),
        }),
        ...(opts.range !== undefined && { range: opts.range }),
      });
    },
  },
);
```

## Implementation notes

- Each adoption is a SEPARATE drop-in — they're textually independent within
  ipc-server.ts. Read the file in two slices (lines 195-250, 613-675) before
  editing to confirm nothing else depends on the existing local variables
  (`t0`, `eventCount`, `errorCount`, `messageLength`).
- Observability deltas — to be **dropped** unless we find evidence of ops
  dependency:
  - `messageLength` in `session.send.start` opening log
  - `errorCount` in `session.send.done` closing log
  - `eventCount` in `memory.episodic.done` / `ingest.done` (covered by the
    helper's default `count` field already)
  - `durationMs` (covered by the helper's default already)

  If a downstream log consumer needs `messageLength` or `errorCount`,
  surface that as a finding during implementation — don't bundle the
  preservation work here. The default `onDone` log fields (`count`,
  `durationMs`) should suffice.
- `memory.episodic` does NOT pass the signal into the producer — its
  `iterate` callback receives `_signal` but doesn't use it. The for-await
  loop still checks `signal.aborted` between events (helper does this
  internally), so cancellation still works. If you discover the producer
  should accept the signal (because the underlying query is long-running),
  flag for a separate story.
- The two ipc-server adoptions delete ~80 LoC from that file — single commit
  with both is fine.

## Tests to verify

- `pnpm --filter @praxis/desktop test`
- Critical: `packages/desktop/electron/main/__tests__/streaming-channel-error-redaction.test.ts`
- Critical: `packages/desktop/electron/main/__tests__/ipc-server.envelope-migration.test.ts`
- Ingest channel tests

## Acceptance criteria

- [ ] Typecheck/lint/test green (baseline preserved)
- [ ] `wc -l packages/desktop/electron/main/ipc-server.ts` drops by ~80
      lines from current
- [ ] `wc -l packages/desktop/electron/main/ingest-channel.ts` drops by
      ~50 lines
- [ ] No wire-format change — `praxis.session.send.start`,
      `praxis.session.send.cancel`, `praxis.session.send.events.<id>`,
      `praxis.memory.episodic.*`, `praxis.ingest.*` all preserved
- [ ] Cancel semantics preserved — controllers register, signal aborts
      the for-await loop, finally cleans up
- [ ] Streaming envelope error-redaction test passes unmodified

## Risk

**Low-Medium** — ipc-server.ts is large and the cancel path is load-bearing
for live tutor sessions. Strong test coverage exists. Read the relevant
ipc-server.ts blocks fully before editing to catch any local-state surprises.

## Rollback

`git revert <commit>` per file/channel is clean. Recommend splitting commits
per channel (ingest, session.send, memory.episodic) so any regression is
isolated to one channel's adoption.
