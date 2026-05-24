# IPC Envelope Test Triad

Each invoke-only IPC channel gets a per-`describe` envelope test that
asserts the same four outcomes: (1) `{ ok: true, value: ... }` for a valid
payload, (2) `{ ok: false, error: { code: "VALIDATION_FAILED" } }` for
missing/malformed input, (3) `{ ok: false, error: { code: "INTERNAL" } }`
(never rejects) for service throws, (4) the INTERNAL error message
contains no host-path or DB-filename leakage.

## Rationale

Praxis IPC handlers are a trust boundary — a renderer-side caller can send
anything, and a Logger or DB error can carry filesystem paths in `.message`.
The four-assertion shape locks the envelope contract end-to-end: validation
rejects bad input before it reaches the service, the service-throw path
produces `INTERNAL` (not an Electron promise rejection that the renderer
must catch), and the redacted error message can't fingerprint the install.
Repeating the shape per channel makes it mechanical to verify a new
channel — copy the four cases, swap names and payloads.

## Examples

### Example 1: Citations record — full triad with inverted-range validation

**File**: `packages/desktop/electron/main/__tests__/citations-channel-envelope.test.ts:83`

```typescript
it("returns { ok: true, value: <record> } for a valid payload", async () => { /* ... */ });

it("returns VALIDATION_FAILED for missing documentId", async () => { /* ... */ });

it("returns INTERNAL (never rejects) when service throws", async () => {
  const log = makeSpyLogger();
  registerCitationsHandlers(
    makeServices({ citationsRecord: async () => { throw new Error("db error"); } }),
    log,
  );
  const handler = handlers.get("praxis.citations.record");
  await expect(
    handler?.({}, { documentId: "doc-1", citingSessionId: "sess-1", startOffset: 0, endOffset: 10 }),
  ).resolves.toMatchObject({ ok: false, error: { code: "INTERNAL" } });
});
```

### Example 2: Session end — path-leakage assertion

**File**: `packages/desktop/electron/main/__tests__/session-channel-envelope.test.ts:447`

```typescript
it("returns INTERNAL with no path leakage when service throws a path error", async () => {
  const services = makeServices({
    sessionEnd: async () => { throw new Error("/home/user/.praxis/dev.db: disk I/O error"); },
  });
  registerIpcHandlers(services, () => null, log);
  const result = await handler?.({}, "sess-abc-123");
  expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  const envelope = result as { ok: false; error: { message: string } };
  expect(envelope.error.message).not.toContain("/home/user/.praxis");
  expect(envelope.error.message).not.toContain("dev.db");
});
```

### Example 3: Memory studentModel — same triad on a no-payload channel

**File**: `packages/desktop/electron/main/__tests__/memory-channel-envelope.test.ts:368`

```typescript
it("returns INTERNAL with no path leakage when service throws a path error", async () => {
  const services = makeServices({
    memoryStudentModel: async () => { throw new Error("/home/user/.praxis/dev.db: SQLITE_IOERR"); },
  });
  // ... same asserts: INTERNAL code + no '/home/user/.praxis' + no 'dev.db'
});
```

Also: `documents-channel-envelope.test.ts`,
`assignments-channel-envelope.test.ts`,
`artifacts-channel-envelope.test.ts`, `packs-channel-envelope.test.ts`,
`residual-channel-envelope.test.ts`,
`spawn-from-note-channel-envelope.test.ts` — 9 files repeat the triad with
~17 path-leakage assertions.

## When to Use

- Any new IPC channel that goes through `handleEnvelope` — the four
  assertions are non-optional.
- Mutating channels and channels that surface database / filesystem
  errors are the highest-priority targets (those error messages most
  likely carry paths).

## When NOT to Use

- Streaming channels (`.start`/`.events.<id>`/`.cancel`) — they have a
  different envelope contract; test via stream harnesses.
- Pure pass-through channels with no Zod schema — there's no
  `VALIDATION_FAILED` outcome to assert (still keep the INTERNAL +
  path-leakage check).

## Common Violations

- Asserting `await expect(handler(...)).rejects.toThrow(...)` —
  handlers should *never* reject; they should resolve to
  `{ ok: false, error: { ... } }`. A rejection here is a regression in
  `handleEnvelope` itself.
- Omitting the path-leakage assertion when the service can touch
  SQLite — those are the throws most likely to embed `/home/...` paths.
- Hand-checking `error.code === "VALIDATION_FAILED"` without also
  asserting `ok: false` — `toMatchObject({ ok: false, error: { code: "..." } })`
  keeps the shape contract intact.
