# streaming-ipc-channel-helpers

Two factories — `registerSubscriberStream` and `registerGeneratorStream` —
encapsulate the AbortController lifecycle, WebContents-alive push guard,
`{kind:"event"|"done"|"error"}` envelope emission, error redaction, and
companion `*.cancel` handler that every streaming Electron IPC channel
previously duplicated.

## Rationale

Every streaming IPC channel in Praxis follows the same `.start` /
`.events.<streamId>` / `.cancel` triplet (see
[ipc-channel-convention](ipc-channel-convention.md)). Before the
stream-handler-template refactor, each channel inlined ~60 lines of
boilerplate: a controller registration, an `eventsChannel` string, a
`push()` closure with `isDestroyed()` check, the `try/catch/finally` with
`redactSecrets + serializeErrorRedacted`, the hold-open
`await new Promise(addEventListener('abort'))`, and a separate
`ipcMain.on(*.cancel)` handler.

The helpers factor that into two variants matching the two stream shapes
Praxis actually has:

- **`registerSubscriberStream`** — for services that expose
  `subscribe(cb) → unsubscribe`. The helper sends the listener's snapshot
  first (when applicable), holds the AbortController until the renderer
  cancels, and unsubscribes on close.
- **`registerGeneratorStream`** — for services that return an
  `AsyncIterable<E>` and accept an `AbortSignal`. The helper iterates the
  generator, pushes each yield as a `{kind:"event"}` envelope, and emits
  `{kind:"done"}` or `{kind:"error", ...}` on completion.

Both derive `channelStart`, `eventsChannel`, and `channelCancel` from a
single `channelBase`. This sits ABOVE
[ipc-channel-convention](ipc-channel-convention.md) and
[subscriber-fanout-stream](subscriber-fanout-stream.md) and provides the
canonical implementation shape for the main-process leg.

## Examples

### Example 1: Subscriber-style stream — activity rail

**File**: `packages/desktop/electron/main/activity-channel.ts:33`

```ts
registerSubscriberStream<ActivityEvent>(
  { channelBase: "praxis.activity.events", log, webContentsGetter, activeAbortControllers },
  { handle, on },
  { subscribe: (cb) => services.activity.subscribe(cb) },
);
```

### Example 2: Subscriber-style stream with filter args — sub-agent transparency

**File**: `packages/desktop/electron/main/subagent-channel.ts:31`

```ts
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

### Example 3: Generator-style stream — session.send turn loop

**File**: `packages/desktop/electron/main/session-channel.ts:154`

```ts
registerGeneratorStream<unknown, [sessionId: string, message: string]>(
  { channelBase: "praxis.session.send", log, webContentsGetter, activeAbortControllers },
  { handle, on },
  {
    iterate: ([sessionId, message], signal) =>
      services.session.send(sessionId as SessionId, message, signal),
  },
);
```

### Example 4: Generator-style stream — ingestion

**File**: `packages/desktop/electron/main/ingest-channel.ts:172`

```ts
registerGeneratorStream<IngestionEvent, [Omit<IngestionRequest, "studentId">]>(
  { channelBase: "praxis.ingest", log, webContentsGetter, activeAbortControllers },
  { handle, on },
  {
    iterate: ([req], signal) => {
      const studentId = getOrCreateDefaultStudentId(/* … */);
      return services.ingestion.ingest({ ...req, studentId }, signal);
    },
  },
);
```

Additional call sites: `course-create-drafts-channel.ts:27` (subscriber),
`quick-check-channel.ts:69` (subscriber), `memory-channel.ts:105` (generator).
Seven total in the main process.

## When to Use

- Any Electron IPC channel that streams events from main to renderer over
  the `.start` / `.events.<streamId>` / `.cancel` triplet.
- Subscriber variant when the underlying service exposes
  `subscribe(cb) → unsubscribe`.
- Generator variant when the underlying service is an `async function*` or
  returns an `AsyncIterable<E>` and accepts an `AbortSignal`.

## When NOT to Use

- One-shot RPCs — use `handleEnvelope` (single-channel invoke) instead.
- Fire-and-forget renderer→main pushes (e.g. `log-channel.ts`) —
  `ipcMain.on` is enough.
- Streams whose lifecycle deviates substantially (e.g. multiple
  `.events.*` channels per stream, custom envelope kinds). Add a new
  variant rather than parameterize the existing two.

## Common Violations

- Inlining the AbortController/push/finally boilerplate in a new channel —
  every new streaming channel must go through the helper.
- Constructing `eventsChannel = ${channelBase}.events.${streamId}` by hand;
  the helper owns that derivation.
- Forgetting the companion `*.cancel` handler when rolling your own — the
  helper registers both for you.
- Emitting the wrong envelope shape (e.g. raw event instead of
  `{kind:"event", payload}`).
