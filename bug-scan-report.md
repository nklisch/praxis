# Bug-Scan Report

**Generated**: 2026-06-01
**Scope**: whole repo
**Files scanned**: 2564 tracked files; scanners focused on 1346-1507 code-bearing files by domain
**Overall score**: **3.6/10**

## Stack profile

- Languages: TypeScript/TSX, JavaScript config, SQL migrations, JSON, CSS modules.
- Frameworks: Electron 41 desktop app, React 19 UI, TanStack Router, Vite/electron-vite, Vitest.
- Data layer: Drizzle ORM 0.45, better-sqlite3, sqlite-vec, FTS5, migration files under `drizzle/`.
- Concurrency primitives: async generators, AsyncIterable IPC streams, AbortController, child_process spawn, timers, EventEmitter-style subscriptions, worker-backed embeddings.
- Notable entry points: Electron IPC channels, session send/end flows, ingestion, pack import, grading, gates, update/auth flows, UI hooks.

## Domain scores

Counts in this table are scanner-level counts before cross-domain dedupe. Findings below are deduped and parked once.

| Domain | Relevance | Score | Findings (C/H/M/L) |
|---|---:|---:|---:|
| Concurrency & races | most | 4/10 | 0/1/5/0 |
| Async / promises | most | 3/10 | 1/0/3/1 |
| State & closures | relevant | 4/10 | 0/1/4/0 |
| Resource leaks | most | 4/10 | 0/1/2/2 |
| Time & numbers | relevant | 4/10 | 0/1/3/2 |
| Error handling | most | 3/10 | 0/3/1/1 |
| Data layer | most | 3/10 | 0/3/3/0 |
| Language footguns | relevant | 5/10 | 0/0/2/2 |

**Overall**: 3.6/10, weighted average with most-relevant domains weighted 2x.

## Top critical findings

1. **Python sandbox timeout reports timeout without stopping Pyodide execution** - `packages/tools/src/runtime/pyodide-host.ts:72` (Async / promises, Critical)

Only one Critical was found. The highest-priority High findings are concurrent session sends, half-indexed ingestion, assignment submission races, and failed pack import recovery.

## Findings by severity

### Critical (1)

#### Python sandbox timeout reports timeout without stopping Pyodide execution
- **Domain**: Async / promises
- **Pattern**: Promise.race leaving losers running
- **Location**: `packages/tools/src/runtime/pyodide-host.ts:72`
- **Parked**: `bug-scan-pyodide-timeout-keeps-running`
- **Evidence**:
  ```ts
  await Promise.race([
    py.runPythonAsync(opts.code),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new PyodideTimeoutError(`Python execution exceeded ${opts.timeoutMs}ms`)), opts.timeoutMs),
    ),
  ]);
  ```
- **Why it's a bug**: The timeout can return while Pyodide execution continues in the same host, or not fire at all for blocking WASM work. Later sandbox calls can inherit stale execution state.
- **Remediation direction**: Use real Pyodide interruption or disposable worker/process termination, and clear timeout handles in cleanup.
- **Also flagged by**: Error handling

### High (8)

#### Concurrent sends can reuse one EngineSession and corrupt turn routing
- **Domain**: Concurrency & races
- **Pattern**: Reentrancy and non-atomic shared session state
- **Location**: `packages/core/src/services/session-service.ts:319`
- **Parked**: `bug-scan-concurrent-engine-send-corrupts-turn`
- **Evidence**:
  ```ts
  capturedEntry.turnInFlight = true;
  try {
    for await (const event of capturedEntry.handle.send(message, signal)) {
      // ...
    }
  } finally {
    capturedEntry.turnInFlight = false;
  }
  ```
- **Why it's a bug**: A second send for the same session can enter the same engine session while the first is streaming, overwriting per-turn routing in the Claude conversation path.
- **Remediation direction**: Add a per-session mutex or queue before `handle.send()`.

#### Rapid double-send can start concurrent session streams instead of queueing
- **Domain**: State & closures
- **Pattern**: React stale state used as an async lock
- **Location**: `packages/ui/src/hooks/use-streamed-send.ts:374`
- **Parked**: `bug-scan-double-send-bypasses-queue`
- **Evidence**:
  ```ts
  if (isStreaming) {
    queue.enqueue(entry, setItems);
    return;
  }
  await sendInternal(sessionId, message, sketchId, null);
  ```
- **Why it's a bug**: `isStreaming` is render state, so rapid double-submit can still see `false` and start two streams.
- **Remediation direction**: Use a synchronous ref-backed lock for queue decisions.

#### Closing Claude auth modal does not abort the login stream or child process
- **Domain**: Resource leaks
- **Pattern**: child_process / async stream not cancelled on UI teardown
- **Location**: `packages/ui/src/components/claude-auth-modal.tsx:39`
- **Parked**: `bug-scan-auth-modal-leaves-cli-running`
- **Evidence**:
  ```ts
  const stream = client.claudeAuth.login();
  let canceled = false;
  cancelRef.current = () => {
    canceled = true;
  };
  ```
- **Why it's a bug**: Closing the modal only flips a flag; the iterator can remain blocked and never send IPC cancellation, leaving the auth subprocess alive.
- **Remediation direction**: Call `return()` on the async iterator or expose an AbortSignal-aware auth stream.
- **Also flagged by**: State & closures

#### Pack re-import cannot recover failed embedding writes
- **Domain**: Data layer
- **Pattern**: Distributed transaction as sequential calls / idempotency gap
- **Location**: `packages/curriculum/src/packs/import-service.ts:91`
- **Parked**: `bug-scan-pack-import-skips-embeddings`
- **Evidence**:
  ```ts
  const existing = await this.findImportRecord(manifest.id, manifest.version);
  if (existing) {
    return existing;
  }
  this.deps.db.transaction((tx) => {
    // writes import rows
  });
  ```
- **Why it's a bug**: `pack_imports` can commit before embedding writes fail, causing retries to return early and never rebuild missing embeddings.
- **Remediation direction**: Track completion, verify and repair embeddings on existing imports, or commit the import marker after vector writes succeed.
- **Also flagged by**: Error handling

#### Document ingestion can persist half-indexed documents
- **Domain**: Data layer
- **Pattern**: Distributed transaction as sequential calls / cancellation leaves partial state
- **Location**: `packages/core/src/ingestion/service.ts:120`
- **Parked**: `bug-scan-half-indexed-ingested-doc`
- **Evidence**:
  ```ts
  this.deps.db.insert(documents).values({ id: documentId, /* ... */ }).run();
  if (chunkRows.length > 0) this.deps.db.insert(documentChunks).values(chunkRows).run();
  await Promise.all([
    this.deps.vectorStore.upsertBatch(vectorUpserts),
    this.deps.ftsStore.upsertBatch(ftsUpserts),
  ]);
  ```
- **Why it's a bug**: Visible document rows can be persisted before vector and FTS indexing completes.
- **Remediation direction**: Stage ingestion with pending/ready state or compensate by deleting partial artifacts on failure.
- **Also flagged by**: Error handling

#### Streaming IPC startup failures are swallowed and leave consumers waiting forever
- **Domain**: Error handling
- **Pattern**: Silent swallow / logged-but-not-propagated
- **Location**: `packages/client/src/transport/ipc.ts:76`
- **Parked**: `bug-scan-ipc-stream-startup-hangs`
- **Evidence**:
  ```ts
  bridge.invoke(startChannel, streamId, ...args).catch(() => {});
  while (queue.length === 0 && !done) {
    await new Promise<void>((resolve) => {
      wakeup = resolve;
    });
  }
  ```
- **Why it's a bug**: If stream startup rejects before an event can be emitted, the iterator waits forever.
- **Remediation direction**: Convert startup rejection into an iterator error and wake pending readers.

#### Concurrent assignment submissions can both grade and overwrite
- **Domain**: Data layer
- **Pattern**: Wrong isolation / check-then-update race across async work
- **Location**: `packages/core/src/services/assignment-service.ts:249`
- **Parked**: `bug-scan-assignment-submit-race`
- **Evidence**:
  ```ts
  if (assignment.submittedAt) {
    throw new Error(`Assignment already submitted: ${input.assignmentId}`);
  }
  const grade: Grade = await this.orchestrator.gradeAssignment({ assignment, responses, mode });
  this.deps.db.update(assignments).set({ submittedAt, gradeJson: grade }).where(eq(assignments.id, input.assignmentId)).run();
  ```
- **Why it's a bug**: Two submit calls can both see `submittedAt` as null, both grade, and last-write-wins the result.
- **Remediation direction**: Atomically claim or finalize with `WHERE submitted_at IS NULL` and use an idempotency key for long grading work.

#### Empty gate-threshold edits silently save as a zero-percent mastery gate
- **Domain**: Time & numbers
- **Pattern**: Implicit numeric coercion / grade thresholds
- **Location**: `packages/ui/src/components/gate-inspector.tsx:103`
- **Parked**: `bug-scan-empty-gate-threshold-zero`
- **Evidence**:
  ```ts
  const score = Number(minScore) / 100;
  saveAction.trigger({
    gateId: gate.id,
    patch: { successCriteria: { ...gate.successCriteria, minScore: score } as SuccessCriteria },
  });
  ```
- **Why it's a bug**: Clearing the numeric input converts to `0`, making the gate always pass.
- **Remediation direction**: Treat empty input as invalid and validate finite range-bounded criteria before persistence.

### Medium (18)

#### Duplicate session.end calls rerun session-end indexers
- **Domain**: Concurrency & races
- **Pattern**: Atomicity violation across multi-step state transition
- **Location**: `packages/core/src/services/session-service.ts:380`
- **Parked**: `bug-scan-session-end-reruns-indexers`
- **Evidence**:
  ```ts
  await this.deps.indexerOrchestrator.runAtSessionEnd({ studentId, sessionId });
  this.deps.db.update(sessions).set({ endedAt }).where(eq(sessions.id, sessionId)).run();
  ```
- **Why it's a bug**: A retry or second tab can rerun non-idempotent end indexers.
- **Remediation direction**: Atomically claim `ended_at IS NULL` before side effects.

#### Streaming subscription hooks leave IPC/server subscriptions alive after unmount
- **Domain**: Resource leaks
- **Pattern**: AsyncIterable subscription teardown discarded
- **Location**: `packages/ui/src/hooks/use-sub-agent.ts:33`
- **Parked**: `bug-scan-stream-hooks-leak-subscriptions`
- **Evidence**:
  ```ts
  for await (const event of client.subAgent.events({ parentCallId })) {
    if (cancelled) break;
  }
  return () => {
    cancelled = true;
  };
  ```
- **Why it's a bug**: A cleanup flag does not wake a pending iterator, so IPC cancellation may never be sent.
- **Remediation direction**: Capture iterators and call `return()` in cleanup, or make streams AbortSignal-aware.
- **Also flagged by**: Async / promises, State & closures, Concurrency & races

#### Sub-agent registry keys collide across sessions
- **Domain**: Concurrency & races
- **Pattern**: Shared-state key collision
- **Location**: `packages/core/src/services/subagent-registry.ts:69`
- **Parked**: `bug-scan-subagent-callid-collision`
- **Evidence**:
  ```ts
  if (this.items.has(parentCallId)) {
    return this.makeHandle(parentCallId);
  }
  parentCallId: ctx.callId,
  ```
- **Why it's a bug**: Global registry keys use per-conversation tool-call IDs, so two sessions can collide.
- **Remediation direction**: Use a globally unique ID or `{ sessionId, parentCallId }`.

#### Overlapping post-turn indexer runs can double-apply mastery signals
- **Domain**: Concurrency & races
- **Pattern**: Atomicity violation across multiple async operations
- **Location**: `packages/core/src/services/indexers/orchestrator.ts:62`
- **Parked**: `bug-scan-post-turn-indexer-overlap`
- **Evidence**:
  ```ts
  const timer = setTimeout(() => {
    this.timers.delete(input.sessionId);
    this.runScope("post-turn", input, true).catch(/* ... */);
  }, debounce);
  ```
- **Why it's a bug**: In-flight runs are not serialized and can reprocess the same events.
- **Remediation direction**: Add a per-session run queue/mutex and make mastery updates idempotent by event ID.

#### Spawned PID registry writes can persist stale PIDs out of order
- **Domain**: Concurrency & races
- **Pattern**: Non-atomic read-modify-write on shared persistent state
- **Location**: `packages/desktop/electron/main/services.ts:157`
- **Parked**: `bug-scan-spawned-pid-race`
- **Evidence**:
  ```ts
  pidRegistry.register(pid).catch(() => {});
  pidRegistry.deregister(pid).catch(() => {});
  ```
- **Why it's a bug**: Fire-and-forget writes can complete out of order, leaving a dead PID for later sweeping.
- **Remediation direction**: Serialize persistence and write atomically via temp-file plus rename.

#### Draft finalization stream can reject as an unhandled promise
- **Domain**: Async / promises
- **Pattern**: Unhandled promise rejection / fire-and-forget async
- **Location**: `packages/ui/src/components/course-create-tab-body.tsx:153`
- **Parked**: `bug-scan-draft-stream-unhandled-reject`
- **Evidence**:
  ```ts
  (async () => {
    for await (const event of client.drafts.events()) {
      if (cancelled) break;
    }
  })();
  ```
- **Why it's a bug**: IPC stream errors reject the IIFE without a catch.
- **Remediation direction**: Wrap the loop in `try/catch` and explicitly cancel on cleanup.

#### Concept map concepts can be overwritten by an older course response
- **Domain**: State & closures
- **Pattern**: React async effect race / out-of-order response
- **Location**: `packages/ui/src/routes/concept-map-editor.tsx:126`
- **Parked**: `bug-scan-concept-map-stale-concepts`
- **Evidence**:
  ```ts
  client.artifacts
    .concepts(courseId as CourseId)
    .then(setConcepts)
    .catch(() => {});
  ```
- **Why it's a bug**: Older course requests can resolve last and populate wrong-course concepts.
- **Remediation direction**: Add cancellation/version guards tied to the latest `courseId`.
- **Also flagged by**: Async / promises

#### PDF page component keeps old image when its document changes
- **Domain**: State & closures
- **Pattern**: Ref gate captures old load state across prop changes
- **Location**: `packages/ui/src/components/document-viewer/pdf-renderer.tsx:55`
- **Parked**: `bug-scan-pdf-page-keeps-old-image`
- **Evidence**:
  ```ts
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!visible || fetchedRef.current) return;
    fetchedRef.current = true;
  }, [client, documentId, page, visible]);
  ```
- **Why it's a bug**: `fetchedRef` is never reset for a new document/page.
- **Remediation direction**: Key by document/page or reset fetch state on prop change.

#### Ingestion activity item can stay running forever after post-parse failures
- **Domain**: Resource leaks
- **Pattern**: Resource handle acquired without guaranteed release
- **Location**: `packages/core/src/ingestion/service.ts:67`
- **Parked**: `bug-scan-ingestion-activity-stuck`
- **Evidence**:
  ```ts
  const actHandle = this.deps.activity?.start({ label: `reading ${prettyName}` });
  this.deps.db.insert(documents).values({ ... }).run();
  await Promise.all([this.deps.vectorStore.upsertBatch(vectorUpserts), this.deps.ftsStore.upsertBatch(ftsUpserts)]);
  actHandle?.finish("done");
  ```
- **Why it's a bug**: Exceptions after parse can exit without finishing the activity handle.
- **Remediation direction**: Finish failed in a full-body `try/catch/finally`.

#### query.sessionId remains pending when the CLI fails before init
- **Domain**: Error handling
- **Pattern**: Partial error propagation leaves companion promise unresolved
- **Location**: `packages/claude-cli-sdk/src/query.ts:104`
- **Parked**: `bug-scan-query-sessionid-hangs`
- **Evidence**:
  ```ts
  const sessionId = createDeferredPromise<string>();
  const result = createDeferredPromise<ResultEvent>();
  // ...
  } catch (err) {
    result.reject(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
  ```
- **Why it's a bug**: Startup failure rejects `result` but leaves `sessionId` pending.
- **Remediation direction**: Reject `sessionId` when init has not arrived.

#### Concurrent gate evaluation can duplicate unlock events
- **Domain**: Data layer
- **Pattern**: Missing row lock / non-idempotent state transition event
- **Location**: `packages/core/src/services/gates-service.ts:113`
- **Parked**: `bug-scan-gate-unlock-duplicates`
- **Evidence**:
  ```ts
  const gatesList = await this.gates(input.courseId);
  const result = await evaluator.evaluate({ studentId: input.studentId, gates: gatesList, /* ... */ });
  tx.insert(gateUnlockEvents).values({ id: uuidv7(), gateId: transition.gateId }).run();
  ```
- **Why it's a bug**: Two evaluators can both see locked state and insert separate unlock events.
- **Remediation direction**: Make transition conditional and add a unique unlock key.

#### Vector search applies filters after a fixed global KNN fetch
- **Domain**: Data layer
- **Pattern**: Wrong query semantics / post-filtered top-K
- **Location**: `packages/tools/src/runtime/sqlite-vec-store.ts:77`
- **Parked**: `bug-scan-vector-search-post-filters`
- **Evidence**:
  ```ts
  const candidateK = input.topK * 4;
  const allRows = this.sqlite.prepare(knnSql).all(...knnParams) as Array<SqliteVecSearchRow>;
  filtered = filtered.filter((r) => idSet.has(r.document_id));
  return filtered.slice(0, input.topK);
  ```
- **Why it's a bug**: Scoped searches can miss matching chunks outside the first global candidate window.
- **Remediation direction**: Push filters into KNN or iterate candidates until enough scoped results exist.

#### Library FTS search passes raw user query to MATCH
- **Domain**: Data layer
- **Pattern**: Raw FTS query construction / malformed query crash
- **Location**: `packages/core/src/services/library-service.ts:103`
- **Parked**: `bug-scan-raw-fts-query-crashes`
- **Evidence**:
  ```ts
  WHERE notes_fts MATCH ?
    AND n.student_id = ?
  `;
  const params: any[] = [query, studentId];
  let hits = stmt.all(...params).map(rawRowToNoteHit);
  ```
- **Why it's a bug**: Parameterization does not prevent FTS5 query parser errors from malformed user input.
- **Remediation direction**: Sanitize or quote terms and catch parse errors as empty results.

#### Valid zero gate thresholds can produce NaN progress
- **Domain**: Time & numbers
- **Pattern**: Division by zero / NaN propagation
- **Location**: `packages/curriculum/src/gates/criteria.ts:71`
- **Parked**: `bug-scan-zero-gate-threshold-nan`
- **Evidence**:
  ```ts
  const progress = Math.min(1, minScore / c.minScore);
  const progress = Math.min(1, grade.total / c.minScore);
  ```
- **Why it's a bug**: `0 / 0` produces `NaN`, which can propagate through gate progress.
- **Remediation direction**: Reject zero thresholds or special-case zero with finite progress.

#### Matching grader can award scores above 100 percent for duplicate correct pairs
- **Domain**: Time & numbers
- **Pattern**: Grade score normalization / duplicate-counting arithmetic
- **Location**: `packages/core/src/services/graders/matching-grader.ts:57`
- **Parked**: `bug-scan-matching-grader-over-100`
- **Evidence**:
  ```ts
  const correctCount = submittedPairs.filter((p) =>
    correctSet.has(`${p.leftId}|${p.rightId}`),
  ).length;
  const score = correctCount / match.correctPairs.length;
  ```
- **Why it's a bug**: Duplicate submitted pairs can count multiple times and produce item scores greater than `1`.
- **Remediation direction**: Score unique submitted pairs and clamp deterministic scores to `[0, 1]`.

#### BKT exam weights linearly extrapolate and clamp instead of applying repeated Bayesian updates
- **Domain**: Time & numbers
- **Pattern**: BKT probability math / weighted probability update
- **Location**: `packages/core/src/services/memory/bkt.ts:118`
- **Parked**: `bug-scan-bkt-weight-extrapolates`
- **Evidence**:
  ```ts
  case "exam_pass":
    return { correct: true, weight: 2 };
  const blended = clamp01(pKnown + (updated - pKnown) * weight);
  ```
- **Why it's a bug**: Integer weights extrapolate one update instead of repeating Bayesian updates.
- **Remediation direction**: Repeat integer updates and blend only fractional remainders, with tests.

#### Tool results can lose content or crash when JSON.stringify receives non-JSON values
- **Domain**: Language footguns
- **Pattern**: JSON.stringify drops fields / throws on BigInt
- **Location**: `packages/claude-cli-sdk/src/conversation.ts:530`
- **Parked**: `bug-scan-tool-result-json-stringify`
- **Evidence**:
  ```ts
  content: results.map((r) => ({
    type: "tool_result",
    content: JSON.stringify(r.value),
  })),
  ```
- **Why it's a bug**: `undefined`, `BigInt`, functions, and symbols can omit content, throw, or silently lose data.
- **Remediation direction**: Normalize values through a JSON-safe encoder and surface serialization failures as tool errors.

#### Tool handler results with a natural value field are silently unwrapped
- **Domain**: Language footguns
- **Pattern**: Structural trust of unknown tool output
- **Location**: `packages/claude-cli-sdk/src/conversation.ts:409`
- **Parked**: `bug-scan-tool-result-value-unwrapped`
- **Evidence**:
  ```ts
  if (result !== null && typeof result === "object" && "value" in (result as Record<string, unknown>)) {
    const r = result as { value: unknown; isError?: boolean };
    return { toolUseId: event.toolId, value: r.value, isError: r.isError };
  }
  ```
- **Why it's a bug**: Normal payloads with a `value` property lose sibling fields.
- **Remediation direction**: Use an explicit wrapper discriminator or dedicated helper.

### Low (7)

- **Feynman annotation load drops IPC failures into an unhandled rejection** - `packages/ui/src/components/note-editor-feynman.tsx:74`; parked as `bug-scan-feynman-annotations-unhandled`. Add a `.catch` around `client.notes.getAnnotations(noteId).then(...)`.
- **Pasted-text ingestion writes temp files without deleting them** - `packages/desktop/electron/main/ingest-channel.ts:163`; parked as `bug-scan-pasted-temp-file-leak`. Delete owned paste temp files in `finally`.
- **Tool server setup leaks its temp directory if initialization throws before returning a handle** - `packages/claude-cli-sdk/src/tool-server.ts:124`; parked as `bug-scan-tool-server-tempdir-leak`. Clean up `mkdtemp` output in setup failure paths.
- **Relative day labels mark late-yesterday events as today** - `packages/ui/src/routes/progress.tsx:39`; parked as `bug-scan-relative-day-label-wrong`. Use calendar-day comparison instead of fixed millisecond day math.
- **Pasted-note filenames use the UTC date instead of the user's local date** - `packages/ui/src/routes/course-create.tsx:179`; parked as `bug-scan-pasted-filename-utc-date`. Format a local calendar date rather than slicing `toISOString()`.
- **Claude auth status trusts parsed JSON shape without validating loggedIn** - `packages/claude-cli-sdk/src/auth.ts:103`; parked as `bug-scan-auth-status-shape-trusted`. Validate parsed JSON shape before resolving.
- **Invalid workspace tab query blanks the workspace** - `packages/ui/src/routes/workspace.tsx:41`; parked as `bug-scan-invalid-workspace-tab-blank`. Validate `search.tab` against known tab IDs before assigning `activeTab`.

## Domains skipped

No domains skipped. All eight domains had concrete evidence in the repo-wide scope.

## Backlog parking summary

| Metric | Count |
|---|---:|
| Findings parked this run | 34 |
| Duplicates skipped (already in backlog) | 0 |
| Refreshed existing items | 0 |
| Cross-domain duplicates collapsed before parking | 8 |
| Opt-out (`--no-park`) | false |
| Substrate present | true |

All parked items live at `.work/backlog/bug-scan-*.md` with `bug_origin: scan`. Elevate any of them to active stories via `/agile-workflow:scope <id>`. Find them all with:

```bash
grep -l '^bug_origin: scan$' .work/backlog/*.md
```

## Scanner gaps

- None. The data-layer scanner noted that its Drizzle web check returned no usable excerpts, so that domain relied on local repository evidence.

## Next steps

- Hand the Critical to `/agile-workflow:fix bug-scan-pyodide-timeout-keeps-running`.
- Promote the High findings with `/agile-workflow:scope` before broad feature work.
- Re-run `/agile-workflow:bug-scan --no-park` after fixes to verify the findings are gone without duplicating backlog items.
