---
id: epic-test-coverage-adversarial-pass-state-and-config-edges
kind: feature
stage: implementing
tags: [testing]
parent: epic-test-coverage-adversarial-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# State-machine and config persistence adversarial coverage

## Brief

Three gate-tests findings cover runtime state and config persistence
edge cases that the existing suite touches at the happy-path level but
doesn't exercise adversarially. The `cancel()` operation is documented
as a no-op when not streaming, but only the `cancel-before-send` state
has a test — `cancel-after-final-arrives`, double-cancel, and
`cancel-during-loadHistory` are all reachable in practice and
unverified. `SqliteDraftStore.save()` is documented as last-writer-
wins under rapid same-tick contention, but the race window isn't
exercised. The engine-config `engineId`-rename round-trip is verified
for the "has apiKey + available safeStorage" path but not for the
"no apiKey + unavailable safeStorage" combination — a regression that
strips engineId on that path would not be caught.

This feature bundles all three because they share two scaffold needs:
deterministic timing for state transitions (vitest fake timers vs.
microtasks) and round-trip assertions on persistence after a contentious
write. Designing them together avoids three parallel "how do we
deterministically order these awaits" debates.

## Epic context

- Parent epic: `epic-test-coverage-adversarial-pass`
- Position in epic: independent. Parallelizable with the other two
  features.

## Scope absorbed from backlog

- `gate-tests-cancel-idempotency-after-final` — `cancel()` no-op
  contract across all hook states, including after-final, double-cancel,
  and during-loadHistory.
- `gate-tests-draft-store-rapid-save-ordering` — single-process rapid
  back-to-back `save()` ordering preserves last-written state.
- `gate-tests-engine-id-rename-no-key-unavailable-storage` — engineId
  rename round-trips correctly even with no apiKey and unavailable
  safeStorage.

## Foundation references

- `docs/ARCHITECTURE.md` — session cancellation contract, draft store
  contract, engine config persistence
- `CLAUDE.md` — `temp-db-test-helper` pattern (`useTempDb()`)

## Anchors (current implementation)

- Streamed-send hook test —
  `packages/ui/src/__tests__/use-streamed-send.test.tsx:985` (existing
  `cancel-before-send` test; new states go alongside)
- Draft store test — `packages/core/src/__tests__/draft-store.test.ts`
- Engine config test — `packages/core/src/__tests__/engine-config.test.ts`
- Draft store implementation —
  `packages/core/src/draft-store/sqlite-draft-store.ts` (or equivalent)
- Engine config encryption path —
  `packages/core/src/config/engine-config.ts`

## Pre-design decisions (2026-05-14)

- **Spec-silent pinning style**: tests with explicit names + one-line
  source comments. No runtime assertions for the no-op contracts.
  Test names assert intent — e.g., `it("cancel() after the stream
  finalized is a no-op (idempotent)", ...)`, `it("rapid back-to-back
  save() calls preserve the last-written state (single-process race
  window)", ...)`, `it("engineId update with no apiKey + unavailable
  storage round-trips correctly (no fields lost)", ...)`.

## Design decisions (2026-05-14, autopilot)

- **Three child stories, one per backlog item** — they span three
  different test files in three different packages with no shared
  scaffolding (the UI test uses `renderHook` + `makeFakeClient`; the
  two core tests use `useTempDb()`). The shared scaffold needs
  identified at scoping time (deterministic timing, round-trip
  asserts) turn out to be cleanly satisfied by existing patterns
  already in each test file — `act()` + `waitFor` for the UI;
  synchronous better-sqlite3 calls + `load()` round-trip for the
  store; existing `inMemorySecretStorage`/`unavailableSecretStorage`
  factories for engine-config. No new shared helper is warranted.
- **Cancel during loadHistory is structurally a no-op** — `cancel()`
  calls `iteratorRef.current?.return?.()`, and `iteratorRef` is only
  set inside the `send()` path (see `use-streamed-send.ts:345`),
  cleared in its `finally` (`:575`). During `loadHistory()` the ref
  is null. The test pins this by calling `loadHistory()` then
  `cancel()` mid-iteration and asserting no throw + items unchanged
  from history (i.e., loadHistory's `setItems(episodicToItems(...))`
  still fires).
- **Cancel-after-final is structurally a no-op** — same mechanism:
  iteratorRef is cleared in the `send()` finally before
  `isStreaming` flips back. The test awaits a complete stream
  (`final` event), then calls `cancel()` and asserts no second
  cancel-marker, no throw, no state change.
- **Double-cancel during streaming**: call `cancel()` twice
  back-to-back while `isStreaming === true`. First call sets
  `userCancelledRef = true` and triggers `iter.return()`; second
  call hits a now-nulled iteratorRef (because `return()` resolves
  and finally runs) OR re-calls `return()` on the same iterator
  (which the SDK contract treats as idempotent). The test pins:
  exactly one `cancel-marker` in `items`, no throw. We do **not**
  add timing assertions about microtask ordering — the test
  tolerates either resolution order.
- **Draft-store rapid save uses synchronous calls** — better-
  sqlite3 is synchronous, so "rapid back-to-back" in a single-
  process JS context means two `save()` calls in the same tick
  with no `await` between them. The test exercises the
  `onConflictDoUpdate` upsert: save state A, save state B (same
  draftId, different `proposed.title` + `lastTouchedAt`), then
  `load()` and assert the loaded state matches B. Pins last-
  writer-wins under the contention window the spec actually
  describes (single-process JS — cross-process contention is
  out of scope and would require SQLite WAL / busy-handler
  tests, which is a different feature).
- **Engine-config rename round-trip test**: write
  `{engineId: "claude-code"}` with `unavailableSecretStorage()`
  (no apiKey, so the write succeeds per existing line 249-255).
  Then write `{engineId: "codex"}` with the same storage. Read
  back via `readEngineConfig` and assert `engineId === "codex"`
  and `apiKey` is undefined and no `apiKeyEncrypted` key is
  present in the stored row. This adds the rename round-trip
  that's missing on the unavailable-storage path.

## Architectural choice

**Inline test additions to existing files** — chosen over a new shared
test helper. Each of the three test files already has the right
scaffolding (`useTempDb`, fake client, `renderHook`/`act`). Adding a
helper would over-abstract three independent surfaces and force a
shared API where none belongs. Rejected alternatives:

- *Shared adversarial-test helper module* — would couple three
  unrelated test files through a module they don't need. The
  scaffolding overlap is at the pattern level (already documented
  in `temp-db-test-helper`, `ui-test-helper`), not at the code level.
- *One omnibus test file* — would put UI tests, core service tests,
  and config tests in one place, violating package locality and
  forcing cross-package imports in a test file.

## Implementation Units

### Unit 1: cancel() adversarial states — use-streamed-send.test.tsx
**File**: `packages/ui/src/__tests__/use-streamed-send.test.tsx`
**Story**: `epic-test-coverage-adversarial-pass-state-and-config-edges-cancel-adversarial`

Add three `it(...)` blocks next to the existing `cancel-before-send`
test (around line 990). Each new test follows the pattern of the
existing cancel tests in the file — `renderHook(() => useStreamedSend(client))`,
drive the iterator with `makeClient([...])` for after-final and an
unresolved promise for double-cancel.

```ts
// New tests added alongside the existing "cancel() is a no-op when not streaming"
// at packages/ui/src/__tests__/use-streamed-send.test.tsx:990

it("cancel() after the stream finalized is a no-op (idempotent)", async () => {
  // Spec: cancel() is documented as a no-op when not streaming. After a
  // turn ends, iteratorRef is cleared in the send() finally — so cancel()
  // takes the same no-op path as cancel-before-send.
  // ...
});

it("double-cancel during streaming produces a single cancel-marker", async () => {
  // Spec: cancel() may be called from multiple UI handlers (Esc + Stop
  // button); the second call must not corrupt state or duplicate the marker.
  // ...
});

it("cancel() during loadHistory does not throw and does not corrupt items", async () => {
  // Spec: cancel() only targets the active send-iterator. loadHistory
  // uses its own async-iterator that is not tracked by iteratorRef, so
  // cancel() is structurally a no-op on that path.
  // ...
});
```

**Implementation Notes**:
- For `cancel-after-final`: build a `makeClient([...final event...])` stream,
  `await act(async () => result.current.send(...))` to completion, then
  call `cancel()` inside `act()` and assert `items` contains zero
  `cancel-marker` entries.
- For `double-cancel`: clone the `cancel during streaming` setup at
  line 951 (unresolved stream promise + `returnSpy`). Call `cancel()`
  twice in `act()`. Assert `returnSpy.mock.calls.length` is 1 or 2
  (both are tolerated; the spec is no-throw, not call-count). Assert
  exactly one `cancel-marker` after resolving the stream.
- For `cancel-during-loadHistory`: mock `client.memory.episodic` to
  return an async-iterable that yields a deterministic episodic event
  list. Start `loadHistory()` without awaiting; call `cancel()`; await
  the load; assert no throw and `items.length > 0` from the history.

**Acceptance Criteria**:
- [ ] Three new `it(...)` blocks exist with the exact names above.
- [ ] Each has a one-line `// Spec:` source comment pinning intent.
- [ ] All three pass under `pnpm --filter @praxis/ui test`.
- [ ] No runtime assertions added to `use-streamed-send.ts` itself.

---

### Unit 2: Draft-store rapid save — draft-store.test.ts
**File**: `packages/core/src/__tests__/draft-store.test.ts`
**Story**: `epic-test-coverage-adversarial-pass-state-and-config-edges-draft-rapid-save`

Add one `it(...)` block inside the existing `describe("SqliteDraftStore", ...)`.

```ts
// New test added at the end of the existing describe block.

it("rapid back-to-back save() calls preserve the last-written state (single-process race window)", () => {
  // Spec: save() is documented as last-writer-wins under rapid same-tick
  // contention. better-sqlite3 is synchronous, so two calls with no await
  // between them must result in load() returning the second state.
  const { db: client } = openDb({ path: db.dbPath });
  const store = new SqliteDraftStore(client);
  const now = Date.now();

  const stateA: DraftCourseState = makeDraft("draft-rapid", STUDENT_A, now);
  const stateB: DraftCourseState = {
    ...stateA,
    proposed: { ...BASE_PROPOSED, title: "Second Write" },
    lastTouchedAt: (now + 1) as Timestamp,
  };

  // Two calls in the same tick, no await — exercises the upsert race window.
  store.save(stateA);
  store.save(stateB);

  const loaded = store.load("draft-rapid");
  expect(loaded?.proposed.title).toBe("Second Write");
  expect(loaded?.lastTouchedAt).toBe(stateB.lastTouchedAt);
  // createdAt preserved from the FIRST save — upsert never overwrites it.
  expect(loaded?.createdAt).toBe(stateA.createdAt);
});
```

**Implementation Notes**:
- Reuses `makeDraft`, `BASE_PROPOSED`, `STUDENT_A` already defined at the
  top of the file.
- Reuses `db = useTempDb()` from line 67.
- No new fixture or helper needed.

**Acceptance Criteria**:
- [ ] One new `it(...)` block with the exact name above.
- [ ] One-line `// Spec:` source comment pinning intent.
- [ ] Test passes under `pnpm --filter @praxis/core test`.

---

### Unit 3: Engine-config rename round-trip — engine-config.test.ts
**File**: `packages/core/src/__tests__/engine-config.test.ts`
**Story**: `epic-test-coverage-adversarial-pass-state-and-config-edges-engineid-rename-unavailable-storage`

Add one `it(...)` block inside the existing
`describe("encrypt/decrypt round-trip — apiKey at rest", ...)`.

```ts
// New test added at the end of the existing encrypt/decrypt describe block.

it("engineId update with no apiKey + unavailable storage round-trips correctly (no fields lost)", () => {
  // Spec: writeEngineConfig with no apiKey succeeds under unavailable
  // safeStorage (already pinned at line 249). The rename round-trip on
  // that path was unverified — a regression that strips engineId on
  // the unavailable+no-key path would not be caught by any existing test.
  const { db: client } = openDb({ path: db.dbPath });
  const ss = unavailableSecretStorage();

  writeEngineConfig(client, ss, { engineId: "claude-code" });
  writeEngineConfig(client, ss, { engineId: "codex" });

  const config = readEngineConfig(client, ss);
  expect(config.engineId).toBe("codex");
  expect(config.apiKey).toBeUndefined();

  // Stored row has neither key field — confirms no stray plaintext or
  // encrypted blob slipped through on the unavailable-storage path.
  const rows = client.select().from(configKv).where(eq(configKv.key, "engine")).all();
  const stored = rows[0]?.valueJson as Record<string, unknown> | undefined;
  expect(stored?.apiKey).toBeUndefined();
  expect(stored?.apiKeyEncrypted).toBeUndefined();
});
```

**Implementation Notes**:
- Reuses `unavailableSecretStorage`, `inMemorySecretStorage`,
  `writeEngineConfig`, `readEngineConfig` already imported at the top
  of the file.
- The `eq` + `configKv` import is already present.

**Acceptance Criteria**:
- [ ] One new `it(...)` block with the exact name above.
- [ ] One-line `// Spec:` source comment pinning intent.
- [ ] Test passes under `pnpm --filter @praxis/core test`.

---

## Implementation Order

All three stories are fully independent — no `depends_on` edges.
`/agile-workflow:implement-orchestrator` should fan out all three
in a single wave:

1. `epic-test-coverage-adversarial-pass-state-and-config-edges-cancel-adversarial`
2. `epic-test-coverage-adversarial-pass-state-and-config-edges-draft-rapid-save`
3. `epic-test-coverage-adversarial-pass-state-and-config-edges-engineid-rename-unavailable-storage`

## Testing

All three units ARE tests. There's no production code change. Each
story's acceptance is: the new test exists with the specified name,
has a one-line `// Spec:` comment, and passes locally + in CI.

Cross-cutting check: after all three land, `pnpm typecheck && pnpm
lint && pnpm test` from the repo root must pass.

## Risks

- **Cancel-during-loadHistory may be too thin a test** — since
  `cancel()` is structurally a no-op on that path (iteratorRef is
  null), the test mostly proves the assumption holds. If a future
  refactor adds an iteratorRef-or-similar mechanism to loadHistory,
  this test would still pass (no-op no-throw) but the underlying
  contract would have shifted. Mitigation: the `// Spec:` comment
  names the structural invariant ("loadHistory uses its own
  async-iterator that is not tracked by iteratorRef") so a future
  reviewer can spot the divergence.
- **Double-cancel call-count tolerance** — by accepting `1 or 2`
  `returnSpy` calls, the test under-pins exact behavior. This is
  intentional: the spec is "idempotent / no-op", not "exactly N
  calls". A future regression that calls `return()` ten times would
  still pass this test. Mitigation: if that becomes a real concern,
  add a separate test asserting an upper bound; for now, the
  existing assertion ("exactly one cancel-marker") covers the
  user-visible contract.
- **Draft-store test doesn't exercise true concurrency** — single-
  process JS can't simulate multi-writer SQLite contention. The
  spec only claims "single-process rapid back-to-back" semantics,
  which this test pins. If we ever need cross-process contention
  coverage, that's a separate feature (likely involving worker
  threads or subprocesses).
