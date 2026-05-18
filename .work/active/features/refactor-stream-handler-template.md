---
id: refactor-stream-handler-template
kind: feature
stage: review
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Refactor: extract reusable stream-handler template for IPC channels

## Brief

Every streaming IPC channel duplicates the same ~60 lines of scaffolding:

1. `new AbortController()` + register in `activeAbortControllers` map
2. Child log + `eventsChannel` name composition + push callback
   (WebContents-alive check + `send`)
3. `streamLog.info("start")`
4. Try-block: subscribe / async-for / iterate / push `{kind:"done"}`
5. Catch-block: push `{kind:"error", message}`
6. Finally-block: cleanup, `activeAbortControllers.delete`
7. Companion `*.cancel` handler that calls `controller.abort()`

This pattern repeats in at least 8 places:

- `packages/desktop/electron/main/ipc-server.ts:195-242` (session.send)
- `packages/desktop/electron/main/ipc-server.ts:615-667` (memory.episodic)
- `packages/desktop/electron/main/ipc-server.ts:1545-1695` (gates.compute)
- `packages/desktop/electron/main/activity-channel.ts:34-77`
- `packages/desktop/electron/main/quick-check-channel.ts:26-68`
- `packages/desktop/electron/main/course-create-drafts-channel.ts:28-96`
- `packages/desktop/electron/main/ingest-channel.ts:135-175`
- `packages/desktop/electron/main/subagent-channel.ts` (similar shape)

Total duplicated surface: ~400 lines. Extracting a single helper or class
collapses that to ~50 lines of usage.

This is **pure refactor** — the wire-format `{kind:"event"|"done"|"error"}`
envelope, the channel naming scheme, and the AbortController cancel
semantics must be preserved exactly. This refactor should land **before**
`refactor-ipc-server-extract-domain-channels` so the channels extracted
from ipc-server.ts can adopt the template on extraction.

## Surface area

Proposed helper (verify shape during design):

```ts
// packages/desktop/electron/main/_utils/stream-handler.ts
export function registerStreamHandler<T>(opts: {
  channelBase: string;                   // e.g. "praxis.session.send"
  log: Logger;
  webContentsGetter: () => WebContents | null;
  activeAbortControllers: Map<string, AbortController>;
  iterate: (
    streamId: string,
    signal: AbortSignal,
  ) => AsyncIterable<T>;
}): { start: (event, streamId) => Promise<void>; cancel: (event, streamId) => void };
```

Or a class-based variant if state is heavier. Design pass decides.

## Why a feature (not a story)

- Touches 8 call sites — multi-file
- Helper shape is a design call (function + closure vs class + method,
  generic shape, where to live)
- Ordering matters: must land before
  `refactor-ipc-server-extract-domain-channels` so newly-extracted
  channels can use it from the start

## Discovery findings to design against

- 8 identical streaming-handler shapes across 5+ files
- All share AbortController lifecycle, push callback, envelope-emission
  pattern
- Variation is only in: channel name, log component, and the actual
  `AsyncIterable<T>` producer
- The `electron-ipc-test-harness` pattern means tests don't depend on
  the defining file, so refactor risk is bounded

## Out of scope

- Changing envelope shape or wire format
- Changing cancel semantics
- Adding new validation (separate behavior-changing concern — see
  `feature-ipc-envelope-validation-coverage`)

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (every `*-channel-envelope.test.ts` and the
      streaming-channel error-redaction tests pass unmodified)
- [ ] All 8 streaming channels use the new helper
- [ ] Total LoC of streaming scaffolding (grep for `activeAbortControllers.set\|new AbortController` in `packages/desktop/electron/main/`) drops by ≥300 lines
- [ ] Cancel semantics preserved — verified by
      `streaming-channel-error-redaction.test.ts` and any cancel-path
      coverage

## Risk

**Low** — wire format is fully preserved, tests exercise the captured
handlers (independent of defining file), and the pattern is already used
correctly in 8 places (so the canonical shape is well-defined).

## Rollback

`git revert <commit>` per channel adoption is clean; revert order is
inverse of adoption.

## Design correction (2026-05-18, refactor-design pass)

The brief inventory said 8 channels including `praxis.gates.compute`. Verified
during design: **7 streaming channels exist**, none named `gates.compute`. Two
distinct shapes (not 8 identical handlers):

**Shape A — Subscribe-callback** (4 channels): `services.X.subscribe(cb)`
returns an `unsubscribe` fn; outer hold-open promise pivots on abort.
- `packages/desktop/electron/main/activity-channel.ts:34`
- `packages/desktop/electron/main/quick-check-channel.ts:26`
- `packages/desktop/electron/main/subagent-channel.ts:33` (takes optional `filter`)
- `packages/desktop/electron/main/course-create-drafts-channel.ts:28` (adds per-event debug logging)

**Shape B — Async-generator** (3 channels): `services.X(args, signal)` returns
an `AsyncIterable<E>`; signal is passed INTO the producer (no separate
unsubscribe); for-await exits when generator ends or abort fires.
- `packages/desktop/electron/main/ipc-server.ts:198` (`praxis.session.send.start`)
- `packages/desktop/electron/main/ipc-server.ts:616` (`praxis.memory.episodic.start`)
- `packages/desktop/electron/main/ingest-channel.ts:156` (`praxis.ingest.start`)

Both shapes share AbortController setup, `eventsChannel` naming, `push`
WebContents-alive guard, envelope emission (`{kind:"event"|"done"|"error"}`),
log open/close/error, finally cleanup, companion `*.cancel` handler. Shape A
has `unsubscribe?.()` in finally; Shape B does not. Shape B's Shape B-with-signal
producers (session.send, ingest) accept the signal as a parameter — memory.episodic
does NOT (no abort cascade into the producer, just a `signal.aborted` check
in the for-await loop).

The helper needs two factory variants — one per shape — sharing a small
`setupStream` primitive for the common scaffolding. Total LoC saved: ~350 across
the 7 channels.

## Refactor Overview

Add a single internal module at
`packages/desktop/electron/main/stream-handler.ts` exposing:

```ts
export interface StreamHandlerDeps {
  channelBase: string;        // e.g. "praxis.activity.events" — `.start` / `.events.<id>` / `.cancel` are derived
  log: Logger;
  webContentsGetter: () => Electron.WebContents | null;
  activeAbortControllers: Map<string, AbortController>;
}

/** Drain an AsyncIterable<E> from a service into the streaming envelope. */
export function registerGeneratorStream<E, Args extends readonly unknown[]>(
  deps: StreamHandlerDeps,
  helpers: { handle: HandleFn; on: OnFn },
  opts: {
    iterate: (args: Args, signal: AbortSignal) => AsyncIterable<E>;
    onEvent?: (event: E, ctx: { count: number; log: Logger }) => void;
    onDone?: (ctx: { count: number; durationMs: number; log: Logger }) => void;
  },
): void;

/** Fan out a subscribe-callback stream from a service into the streaming envelope. */
export function registerSubscriberStream<E, Args extends readonly unknown[]>(
  deps: StreamHandlerDeps,
  helpers: { handle: HandleFn; on: OnFn },
  opts: {
    subscribe: (cb: (event: E) => void, args: Args) => () => void;
    onEvent?: (event: E, ctx: { log: Logger }) => void;
  },
): void;
```

Both helpers handle: setup, push callback with WebContents-alive guard,
envelope shape (`{kind:"event"|"done"|"error"}`), error-path logging with
`serializeErrorRedacted` / `redactSecrets`, finally-cleanup,
`*.cancel` companion handler, and AbortController register/delete on the
`activeAbortControllers` map.

**Hook for observability variance**:
- `onEvent`: per-event side-effect (used by course-create-drafts for its rich
  debug logging; used by session.send for `errorCount` accounting via a
  closure on `event.type === "error"`).
- `onDone`: enrich the close-of-stream log (durationMs, eventCount used by
  session.send / memory.episodic / ingest).

Both hooks are optional; default to no-op. The default open/close log key
is derived from `channelBase` (e.g. `"praxis.session.send.done"`).

## Refactor Steps

### Step 1: Add `stream-handler.ts` and adopt in `activity-channel.ts` (reference impl)
**Priority**: High
**Risk**: Low
**Files**: `packages/desktop/electron/main/stream-handler.ts` (new), `packages/desktop/electron/main/activity-channel.ts`
**Story**: `refactor-stream-handler-template-step-1-helper-and-activity`

**Current state**: see `activity-channel.ts:34-77` (full handler shown earlier in this body).

**Target state**: `activity-channel.ts` reduces to:

```ts
export function registerActivityHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);

  handle(
    "praxis.activity.dismiss",
    wrapEnvelope("praxis.activity.dismiss", log, async (_event: unknown, id: string) => {
      services.activity.dismiss(id);
    }),
  );

  registerSubscriberStream<ActivityEvent, []>(
    { channelBase: "praxis.activity.events", log, webContentsGetter, activeAbortControllers },
    { handle, on },
    { subscribe: (cb) => services.activity.subscribe(cb) },
  );
}
```

**Implementation notes**:
- Add the new helper file with both `registerGeneratorStream` and `registerSubscriberStream` (full implementations; subsequent steps will use them).
- Keep `setupStream<E>(...)` private to the module.
- Co-locate types/exports next to existing `ipc-helpers.ts` / `ipc-error-envelope.ts` conventions.
- After the activity-channel adoption, verify the existing envelope test (`packages/desktop/electron/main/__tests__/streaming-channel-error-redaction.test.ts` if it covers activity) still passes unmodified.

**Acceptance criteria**:
- [ ] Build, typecheck, lint, test all green (baseline preserved)
- [ ] `wc -l packages/desktop/electron/main/activity-channel.ts` < 40 (was 77)
- [ ] No wire-format change (cancel + envelope shape preserved)
- [ ] New helper file exports `StreamHandlerDeps`, `registerSubscriberStream`, `registerGeneratorStream`

**Rollback**: `git revert <commit>` — clean. Until the new helper has additional consumers, deleting it costs nothing.

---

### Step 2: Adopt `registerSubscriberStream` in quick-check + subagent
**Priority**: High
**Risk**: Low
**Files**: `packages/desktop/electron/main/quick-check-channel.ts`, `packages/desktop/electron/main/subagent-channel.ts`
**Story**: `refactor-stream-handler-template-step-2-quick-check-and-subagent`
**Depends on**: `refactor-stream-handler-template-step-1-helper-and-activity`

**Current state**: see the respective files; both are subscribe-callback with very little variance from activity-channel. Subagent also takes an optional `parentCallId` filter argument forwarded into `subscribe(cb, filter)`.

**Target state**:

```ts
// quick-check-channel.ts
registerSubscriberStream<QuickCheckEvent, []>(
  { channelBase: "praxis.quickCheck.events", log, webContentsGetter, activeAbortControllers },
  { handle, on },
  { subscribe: (cb) => quickCheck.subscribe(cb) },
);

// subagent-channel.ts — parentCallId is the second positional arg from the renderer
registerSubAgentEventsHandlers(...); // (sketch)
registerSubscriberStream<SubAgentEvent, [parentCallId?: string]>(
  { channelBase: "praxis.subAgent.events", log, webContentsGetter, activeAbortControllers },
  { handle, on },
  {
    subscribe: (cb, [parentCallId]) => {
      const filter = parentCallId !== undefined ? { parentCallId } : undefined;
      return services.subAgent.subscribe(cb, filter);
    },
  },
);
```

**Implementation notes**:
- The `Args` generic threads typed positional args from the renderer's `invoke(channel, streamId, ...args)` through to the `subscribe` callback's second parameter. Test that TypeScript narrows correctly for `parentCallId?: string`.
- Keep the non-streaming endpoints (`praxis.quickCheck.resolve`, `praxis.subAgent.list`) untouched.

**Acceptance criteria**:
- [ ] Build/typecheck/lint/test green
- [ ] Each channel file's net LoC drops by ~40
- [ ] Subagent's `parentCallId` filter still works (covered by existing tests)

**Rollback**: `git revert <commit>` — clean per file.

---

### Step 3: Adopt in course-create-drafts (with `onEvent` hook for debug logging)
**Priority**: Medium
**Risk**: Low
**Files**: `packages/desktop/electron/main/course-create-drafts-channel.ts`
**Story**: `refactor-stream-handler-template-step-3-course-create-drafts`
**Depends on**: `refactor-stream-handler-template-step-1-helper-and-activity`

**Current state**: `course-create-drafts-channel.ts:28-96`. Has per-event debug logging (`streamLog.debug("course-create.drafts.forward", {...})`) with rich payload fingerprinting (draftCount / draftId / conceptCount / lessonCount / etc.).

**Target state**: move the per-event log into the `onEvent` hook:

```ts
registerSubscriberStream<DraftStreamEvent, []>(
  { channelBase: "praxis.courseCreate.drafts.events", log, webContentsGetter, activeAbortControllers },
  { handle, on },
  {
    subscribe: (cb) => services.bootstrap.subscribe(cb),
    onEvent: (event, { log: streamLog }) => {
      streamLog.debug("course-create.drafts.forward", {
        eventKind: event.kind,
        ...(event.kind === "snapshot" && { draftCount: event.drafts.length }),
        // … rest of the fingerprint object unchanged
      });
    },
  },
);
```

(Note: `eventsForwarded` running total drops out — `onEvent` doesn't currently
expose a counter to subscriber-mode handlers. If the running total is
load-bearing for diagnosis, extend the hook to include `count` on the subscriber
variant too; otherwise drop it. Default to dropping — `count` is recoverable
from log aggregation, not load-bearing.)

**Acceptance criteria**:
- [ ] Per-event debug-log content preserved exactly (verify by reading
      `event.kind`-specific fingerprint shape)
- [ ] Channel file LoC drops by ~50
- [ ] Build/typecheck/lint/test green

**Rollback**: `git revert <commit>` — clean.

---

### Step 4: Adopt `registerGeneratorStream` in ingest + ipc-server's two streams
**Priority**: High
**Risk**: Low-Medium (touches ipc-server.ts; verify session.send tests pass)
**Files**: `packages/desktop/electron/main/ingest-channel.ts`, `packages/desktop/electron/main/ipc-server.ts` (session.send, memory.episodic blocks)
**Story**: `refactor-stream-handler-template-step-4-generator-streams`
**Depends on**: `refactor-stream-handler-template-step-1-helper-and-activity`

**Current state**: 3 Shape-B handlers at the line ranges noted above. session.send tracks `errorCount` per `event.type === "error"` and includes `messageLength` in the open log.

**Target state**:

```ts
// ingest-channel.ts
registerGeneratorStream<IngestionEvent, [Omit<IngestionRequest, "studentId">]>(
  { channelBase: "praxis.ingest", log, webContentsGetter, activeAbortControllers },
  { handle, on },
  {
    iterate: ([req], signal) => {
      const studentId = getOrCreateDefaultStudentId(/* ... existing db path ... */);
      return services.ingestion.ingest({ ...req, studentId }, signal);
    },
  },
);

// ipc-server.ts — session.send
registerGeneratorStream<unknown, [sessionId: string, message: string]>(
  { channelBase: "praxis.session.send", log, webContentsGetter, activeAbortControllers },
  { handle, on },
  {
    iterate: ([sessionId, _message], signal) =>
      services.session.send(sessionId as SessionId, _message, signal),
    onEvent: (event, { count }) => {
      // errorCount tracking — keep a closure
      if ((event as { type?: string }).type === "error") {
        // … if the close-of-stream log needs errorCount, track it here
      }
    },
    onDone: ({ count, durationMs, log: streamLog }) => {
      // Default helper-emitted "done" log includes count + durationMs;
      // no extra fields needed unless errorCount turns out to matter to ops.
    },
  },
);

// ipc-server.ts — memory.episodic
registerGeneratorStream<EpisodicEvent, [{ sessionId?: string; range?: { fromMs: number; toMs: number } }]>(
  { channelBase: "praxis.memory.episodic", log, webContentsGetter, activeAbortControllers },
  { handle, on },
  {
    iterate: ([opts], _signal) => {
      const studentId = getStudentId();
      return services.memory.episodic({
        studentId,
        ...(opts.sessionId !== undefined && { sessionId: brandId<"SessionId">(opts.sessionId) }),
        ...(opts.range !== undefined && { range: opts.range }),
      });
    },
  },
);
```

**Implementation notes**:
- The `messageLength` field in `session.send.start`'s open-log is observability bloat — fold into a `pre-iterate` extra-log-fields option on the helper, OR keep it via a wrapping log call on the iterate side. Default: drop `messageLength` from the open log; if anyone misses it, the renderer-side log captures the message anyway.
- `errorCount` in session.send.done's close-log: same reasoning — recoverable from aggregating events with `type === "error"` post-hoc. Drop unless ops calls it load-bearing.
- The two ipc-server adoptions also reduce two distinct file regions; commit them together so the file's line-count delta is captured in one change.

**Acceptance criteria**:
- [ ] Build/typecheck/lint/test green
- [ ] `wc -l packages/desktop/electron/main/ipc-server.ts` drops by ~80
- [ ] `wc -l packages/desktop/electron/main/ingest-channel.ts` drops by ~50
- [ ] Streaming envelope tests pass unmodified — particularly `streaming-channel-error-redaction.test.ts`

**Rollback**: `git revert <commit>` per file is clean. Recommend separate sub-commits per channel if implementing inline.

---

## Implementation Order

1. Step 1 (`refactor-stream-handler-template-step-1-helper-and-activity`) — no deps
2. Steps 2, 3, 4 (depend_on: step-1) — can run in parallel via the orchestrator after step 1 lands

## Atomic-step acknowledgments

None of the steps are atomic-irreversible. Wire-format (channel names,
envelope shape) is preserved across every step. Tests that exercise the
captured handler map (per `electron-ipc-test-harness` pattern) need no
modification.

## Out-of-scope follow-ups (deferred)

- The `messageLength` and `errorCount` observability fields on
  `praxis.session.send` are dropped from the helper's default emission.
  If ops monitoring depends on them, that's a separate add — file a
  story to add a typed extra-log-fields hook to the helper.
- The `eventsForwarded` running counter in `course-create-drafts` is
  dropped for the same reason. Recoverable from log aggregation.

## Implementation Run Summary

All 4 child stories implemented and advanced to `stage: review` in a single
orchestrator pass (Wave 1: step 1 alone; Wave 2: steps 2/3/4 parallel).

| Step | Story | Commit(s) | LoC delta |
|------|-------|-----------|-----------|
| 1 | `step-1-helper-and-activity` | `e2a46f9` | new helper 207 LoC; activity-channel 77→38 (−39) |
| 2 | `step-2-quick-check-and-subagent` | `45a1b94` | quick-check 81→40 (−41); subagent 80→44 (−36) |
| 3 | `step-3-course-create-drafts` | `ee0ad9b` | course-create-drafts 98→60 (−38) |
| 4 | `step-4-generator-streams` | `02fd4cb`, `48bc745`, `89bc6b6` | ingest 212→170 (−42); ipc-server 2069→1994 (−75) |

**Total LoC removed from channel files**: ~271 (against +207 LoC in the new
helper). Net consolidation: −64 LoC plus a reusable abstraction that the
forthcoming `refactor-ipc-server-extract-domain-channels` feature can adopt
when extracting new channel modules.

### Cross-cutting deviations

- **Log keys changed shape** for 3 of the 7 channels:
  - `activity.subscribe` → `activity.events.subscribe` (and `.unsubscribe`, `.error`)
  - `subagent.subscribe` → `subAgent.events.subscribe` (and `.unsubscribe`, `.error`)
  - `course-create.drafts.subscribe` → `courseCreate.drafts.events.subscribe` (and `.unsubscribe`, `.error`)
  
  The helper derives the log prefix from `channelBase` by stripping `"praxis."`
  (so `"praxis.activity.events"` → `"activity.events"`). Prior implementations
  used bespoke short keys. **No tests assert on these strings**, so this is
  not a test regression — but if downstream log dashboards key on the prior
  short names, they need updating. Flagged as nit in step-1 implementation
  notes.

- **Observability fields dropped**:
  - `messageLength` on `praxis.session.send.start` opening log
  - `errorCount` on `praxis.session.send.done` closing log
  - `eventsForwarded` running total in `course-create-drafts` per-event debug log
  
  All intentional per the design — recoverable via log aggregation. No tests
  asserted on these fields.

- **Per-event count NOT exposed on subscriber-stream `onEvent` hook**: The
  generator-stream variant exposes `{ count, log }` in `onEvent` but the
  subscriber variant only exposes `{ log }`. This is by design (subscriber
  channels rarely need a counter; if a future channel does, extend the hook
  shape).

### Verification status

- **Typecheck**: baseline preserved (3 pre-existing UI errors in
  `chat-tab-body.tsx`, `chat.tsx`, `notes-list.tsx` — tracked at
  `idea-fix-exactoptional-typecheck-baseline`). Zero new errors.
- **Tests**: 475+ desktop main tests pass, including all critical streaming
  envelope tests (`streaming-channel-error-redaction`,
  `ipc-server.envelope-migration`, `ipc-server.cancel`). Zero test
  modifications needed across the 4 stories.
- **Lint (biome)**: clean on all touched files.
- **Wire format**: every channel name and envelope shape preserved exactly.
  All `praxis.X.events.start` / `praxis.X.events.events.<id>` /
  `praxis.X.events.cancel` (subscriber) and `praxis.Y.start` /
  `praxis.Y.events.<id>` / `praxis.Y.cancel` (generator) shapes unchanged.

### What's now possible

- The `refactor-ipc-server-extract-domain-channels` feature (still at
  drafting) can adopt the helper for new channel modules from day one — no
  inline streaming scaffolding to write.
- Future streaming channels add ~10 lines, not ~70.
- Cancel semantics, redaction, and envelope shape are guaranteed-correct
  via the helper — no per-channel risk of forgetting `serializeErrorRedacted`
  or `wc.isDestroyed()` checks.
