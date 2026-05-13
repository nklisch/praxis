---
id: epic-document-library-bootstrap-session-scoped-attachment
kind: feature
stage: done
tags: [bootstrap, documents, tutor-ux]
parent: epic-document-library
depends_on: [epic-document-library-scopes-primitive]
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Bootstrap-session-scoped document attachment

## Brief

Today bootstrap reads documents that were already attached to a course
(via `course_documents`). That means re-bootstraps or parallel exploration
runs share the same doc set — there's no way to say "this textbook is for
*this* exploration only, not the course yet." Documents also leak into
the next bootstrap run because they were attached to a course-shaped
scope from the start.

This feature gives bootstrap sessions their own document scope. Attaching
a document inside a bootstrap session writes a `document_scopes` row with
`scope_kind='session'`, `scope_id=<sessionId>`. The explorer's document
tools (`document.outline`, `document.list_sections`, `document.read_pages`,
`retrieve_from_documents`) read from the session's scope during the
exploration. On `confirmDraft`
(`packages/core/src/services/bootstrap-service.ts:527-576`), the
session-scoped documents are **promoted** to course-scope rows alongside
the existing session rows — both survive, so the doc remains durably
attached to the course while the audit trail of "this session pulled in
these docs" is preserved.

## Epic context

- Parent epic: `epic-document-library`
- Position in epic: consumer of the new scoping primitive; wave 2 alongside
  `document-viewer-tab-scoped-sidebar` and `library-view-tabs-and-filters`.

## Foundation references

- `docs/ARCHITECTURE.md` "Document scoping" section — describes the
  session→course promotion this feature implements

## Anchors

- Bootstrap explorer entry — `packages/tools/src/course/start-exploration.ts:22-25`
  (currently takes `documentIds` array)
- Explorer document tools — `packages/tools/src/document/*.ts`
- Bootstrap confirm flow —
  `packages/core/src/services/bootstrap-service.ts:527-576` (and
  `persistDraftTx` 1220-1350; line 1279 stores `documentIds` in
  `sourceJson`)
- Draft storage — `packages/core/src/schema.ts:71-93` (durable drafts
  carry `documentIds`)
- Bootstrap UI — `packages/ui/src/components/bootstrap-tab-body.tsx:40-80`
- Session table — already exists with `modeId='bootstrap'`; no new table
  for bootstrap sessions

## Design notes for feature-design

- Promotion semantics: write a `course` scope row at confirmation; keep
  the `session` scope row for audit. Both queries succeed afterward.
- Cleanup (resolved): **keep** session-scoped rows when a bootstrap
  session is abandoned without `confirmDraft`. Don't garbage-collect.
  They surface under the library's Orphaned tab (see
  `library-view-tabs-filters`). Mechanism for detecting "abandoned"
  vs. "active" session is for feature-design — likely a flag on
  `sessions` (e.g., `abandoned_at` timestamp, set when the user
  explicitly discards or starts a fresh bootstrap run), or a derived
  rule ("no events in N days + never confirmed").
- Tool surface: do the explorer tools take the scope explicitly, or
  derive from `ctx.sessionId`? Latter is simpler if `ToolContext` carries
  it.
- Confirm-path data flow: today `documentIds` in the draft `stateJson` is
  the trigger for `attachMany`. New flow either uses the scope query
  directly (`listForScope(session_id)`) or keeps the `documentIds` array
  and adds the promotion step.

## Architectural choice

**Implicit session-scope attach at `start_exploration` entry; scope-tracked draft; `promoteScope` at confirm.** No UI surface change for v1 — the model still receives `documentIds` from `course.list_library_documents`; the new behavior is invisible glue (attach as side-effect, promote at confirm) that gives the doc set durable session ownership without disturbing the existing select-then-explore UX. A v2 affordance (mid-session "attach more" button in `bootstrap-tab-body`) can land later if real usage demands it.

Two alternatives rejected:
- *Explicit user-facing "attach to this bootstrap session" UI affordance.* Larger surface, requires UI design pass for the bootstrap-tab-body, and the v1 model (user picks docs once at session start) doesn't actually need it. Defer until usage shows the need.
- *Drop `documentIds` from `start_exploration`; derive purely from session scope.* Breaking change to the tool surface; also forces the bootstrap UI to attach BEFORE invoking start_exploration, which inverts the current "click to start exploration with these docs" flow.

## Design decisions (resolved by autopilot)

- **Where the session attach happens**: at the top of `course.start_exploration`'s handler — before the explorer sub-agent spawns. The tool's `ctx.sessionId` is the parent bootstrap session's id (the explorer's own session id is irrelevant for scoping).
- **Idempotency**: re-running `start_exploration` with the same `documentIds` (e.g., for continuation of an exhausted-budget exploration) re-attaches the same rows. `documentScopes.attachMany` is already idempotent (skips existing).
- **`DraftCourseState` extension**: add `sessionId: SessionId` field. Populated by `BootstrapServiceImpl.initDraft` from a new `sessionId` parameter; `course.draft_init` passes `ctx.sessionId` through (this is the EXPLORER's session id, not the parent — but the parent's id is already stored in the session scope rows we wrote at start_exploration). Actually: pass `parentSessionId` separately. See Unit 1 for the exact threading.
- **Promotion semantics**: `confirmDraft` calls `documentScopes.promoteScope({ from: {kind:"session", id:parentSessionId}, to: {kind:"course", id:courseId}, source: "bootstrap" })`. Session rows persist (audit trail); course rows are newly inserted. `documentScopes.promoteScope` is idempotent — re-confirming is a no-op.
- **Replacement of existing `attachMany` call at confirmDraft**: the existing `attachMany({ scope: { kind: "course", id: courseId }, documentIds: d.documentIds, source: "bootstrap" })` at `bootstrap-service.ts:553-566` is replaced by `promoteScope`. Same end state for course-scope rows, plus the audit trail.
- **Abandoned sessions**: NO garbage collection. Session-scope rows persist; the wave-2 "Orphaned" tab in `library-view-tabs-filters` exposes them. This matches the design note.
- **`course.list_library_documents` `attachedToCurrentSession` flag**: ADD. The tool currently exposes `attachedToCurrentCourse`; add a sibling `attachedToCurrentSession: boolean` derived from `ctx.sessionId` + `listScopesForDocument`. Useful in bootstrap mode for the explorer (and any future UI) to see which library docs the current bootstrap session is exploring.
- **`ToolContext.sessionId` already exists** (verified at `packages/core/src/services/tool-context-factory.ts` or similar — set per-turn from the session). No new context field needed for the session attach side-effect.
- **`course.attach_document` (manual attach tool)**: this tool currently writes course-scope rows (`packages/tools/src/course/attach-document.ts`). It STAYS course-scoped — it's the "add to active course" affordance, not the bootstrap one. No change to its handler.

## Anchors (verified)

- `BootstrapServiceImpl.initDraft` — `packages/core/src/services/bootstrap-service.ts:160-200` (signature accepts `documentIds`; needs new `sessionId` param)
- `BootstrapServiceImpl.confirmDraft` — `packages/core/src/services/bootstrap-service.ts:527-576` (current `attachMany` call replaced by `promoteScope`)
- `DraftCourseState` type — `packages/core/src/services/bootstrap-service.ts:165-200` and `packages/core/src/schema.ts:71-93` (durable drafts schema)
- `course.start_exploration` handler — `packages/tools/src/course/start-exploration.ts:120-200` (the side-effect attach goes here, before the explorer spawn)
- `course.draft_init` handler — `packages/tools/src/course/draft-init.ts` (needs to pass `sessionId` to initDraft; gets it from ctx — but this is the EXPLORER's ctx, so the parent session id needs a different flow — see Unit 2)
- `course.list_library_documents` — `packages/tools/src/course/list-library-documents.ts` (add `attachedToCurrentSession` flag)
- `DocumentScopesService.promoteScope` — `packages/core/src/services/document-scopes-service.ts` (already implemented; ready to call)
- `DocumentScopesService.attachMany` — same file (already implemented)

## Architectural detail: how the parent session id reaches the draft

The bootstrap session opens with id `S1`. `start_exploration` runs in `S1`'s ctx (so `ctx.sessionId === S1`). The explorer sub-agent has its own session `S2`. The explorer's `course.draft_init` runs in `S2`'s ctx — `ctx.sessionId === S2`. The `S1` id needs to reach `initDraft` somehow.

Options:
- **Pass via explorer input**: `start_exploration` passes `parentSessionId` to `runConceptExplorer`; the explorer threads it into the system prompt or as a synthetic context field. Awkward — the explorer shouldn't need to know.
- **Pass via the draft store**: when `start_exploration` does its side-effect attach, it ALSO writes a hint somewhere the draft can pick up. The draft is created by the explorer's `draft_init`; if we attach the session-id hint via the draft store, `draft_init` reads it.
- **Best: synthetic `parentSessionId` on `ToolContext` for sub-agent tools** — the explorer's sub-agent ToolContext is constructed by `runConceptExplorer` from the parent ctx; carry `parentSessionId` through as a new (optional) field. `draft_init` reads `ctx.parentSessionId ?? ctx.sessionId`.

Going with the third option: extend `ToolContext` with `parentSessionId?: SessionId`. Populated by `runConceptExplorer` (or its `baseContext` factory) from the parent ctx's `sessionId`. For top-level sessions (not sub-agents), `parentSessionId` is undefined and consumers fall back to `ctx.sessionId`.

`course.draft_init`'s handler reads `ctx.parentSessionId ?? ctx.sessionId`, passes that as `sessionId` to `BootstrapServiceImpl.initDraft`. `initDraft` stores it on the draft. `confirmDraft` reads it from the draft and uses it for `promoteScope`.

## Implementation Units

Single-stride. The work is tightly cohesive (one new field threaded through 4 files, one tool handler edit, one core method change). All can land in one commit; tests cover the new flow end-to-end.

### Unit 1: `DraftCourseState.sessionId` + `BootstrapServiceImpl.initDraft` accepts sessionId

**Files**:
- `packages/core/src/services/bootstrap-service.ts` (DraftCourseState type, initDraft, confirmDraft, persistDraftTx)
- `packages/core/src/schema.ts` (durable drafts schema — add `sessionId` column if drafts are persisted; check if it's already there)

```typescript
// DraftCourseState extension:
export interface DraftCourseState {
  draftId: string;
  studentId: StudentId;
  /** Parent bootstrap session id (S1, not the explorer's S2). Used by confirmDraft for promoteScope. */
  sessionId: SessionId;
  documentIds: DocumentId[];
  // … existing fields …
}

// initDraft signature:
async initDraft(input: {
  studentId: StudentId;
  sessionId: SessionId;
  documentIds: DocumentId[];
  courseTitle: string;
  subject: string;
  gradeLevel: string;
}): Promise<{ draftId: string }>;
```

If `bootstrap_drafts` is a persisted table (per schema.ts:71-93), add `session_id text not null` column via a Drizzle migration. If drafts are only in-memory (single-process store) the type extension is sufficient.

**Acceptance Criteria**:
- [ ] `DraftCourseState.sessionId` typed.
- [ ] `initDraft` requires `sessionId` parameter.
- [ ] Existing tests that build `DraftCourseState` fixtures or call `initDraft` updated to pass `sessionId`.
- [ ] If `bootstrap_drafts` is persisted: new migration adds `session_id` column (NOT NULL with a backfill default for any historical rows, OR drop-and-recreate if no production data).

---

### Unit 2: `ToolContext.parentSessionId` + explorer sub-context

**Files**:
- `packages/core/src/types/tool.ts` (ToolContext interface — add `parentSessionId?: SessionId`)
- `packages/curriculum/src/bootstrap/explorer.ts` (runConceptExplorer constructs the explorer's tool context — set `parentSessionId` from the parent ctx)

```typescript
// ToolContext:
export interface ToolContext {
  // … existing fields …
  /**
   * Set by sub-agent harnesses (e.g., bootstrap concept explorer) to the
   * PARENT session's id. Top-level sessions leave this undefined.
   * Used by tools that need to operate on the parent session's scope
   * (e.g., bootstrap session-scoped document attachment).
   */
  parentSessionId?: SessionId;
}
```

In `runConceptExplorer`: when constructing the sub-agent's tool context from `baseContext`, set `parentSessionId: baseContext.sessionId`.

**Acceptance Criteria**:
- [ ] `ToolContext.parentSessionId` typed optional.
- [ ] `runConceptExplorer`'s sub-context construction populates `parentSessionId` from parent ctx's `sessionId`.

---

### Unit 3: `course.start_exploration` side-effect session attach

**File**: `packages/tools/src/course/start-exploration.ts`

At the top of the handler, BEFORE `runConceptExplorer` is invoked, attach all `args.documentIds` to scope `{kind:"session", id:ctx.sessionId}`:

```typescript
async handler(args, ctx: ToolContext) {
  // …existing arg validation, engine resolution…

  // Session-scope attach (idempotent): the bootstrap session "owns" these docs
  // for the duration of the exploration. Promoted to course-scope at confirmDraft.
  await ctx.services.documentScopes.attachMany({
    scope: { kind: "session", id: ctx.sessionId },
    documentIds: args.documentIds.map((id) => brandId<"DocumentId">(id)),
    source: "bootstrap",
  });

  // …existing explorer spawn…
}
```

**Acceptance Criteria**:
- [ ] Calling `start_exploration` writes session-scope rows for each input doc.
- [ ] Re-running with the same docs is a no-op (no duplicate rows).
- [ ] Existing test cases for start_exploration get a `documentScopes` mock stub added.

---

### Unit 4: `course.draft_init` passes `sessionId`

**File**: `packages/tools/src/course/draft-init.ts`

Update the handler to read `parentSessionId` (fallback `sessionId`) and pass to `initDraft`:

```typescript
async handler(args, ctx: ToolContext) {
  const parentSessionId = ctx.parentSessionId ?? ctx.sessionId;
  const result = await ctx.services.bootstrap.initDraft({
    studentId: ctx.studentId,
    sessionId: parentSessionId,
    documentIds: args.documentIds.map((id) => brandId<"DocumentId">(id)),
    courseTitle: args.courseTitle,
    subject: args.subject,
    gradeLevel: args.gradeLevel,
  });
  return result;
}
```

**Acceptance Criteria**:
- [ ] `draft_init` reads `parentSessionId ?? sessionId` and stores it on the draft via `initDraft`.

---

### Unit 5: `confirmDraft` uses `promoteScope`

**File**: `packages/core/src/services/bootstrap-service.ts` (lines 527-576)

Replace the existing `attachMany` block with `promoteScope`:

```typescript
// Promote session-scope rows to course-scope (preserves both for audit).
if (d.sessionId) {
  try {
    await this.deps.documentScopes.promoteScope({
      from: { kind: "session", id: d.sessionId },
      to: { kind: "course", id: result.courseId },
      source: "bootstrap",
    });
  } catch (err) {
    this.deps.log.warn("confirmDraft.promoteScope_failed", {
      courseId: result.courseId,
      sessionId: d.sessionId,
      err: String(err),
    });
    // Non-fatal — course is persisted; documents can be manually re-attached.
  }
}
```

If `d.sessionId` is undefined (legacy drafts from before this feature), fall back to the existing `attachMany(d.documentIds)` path as a one-time compatibility branch. After a deploy cycle this branch can be removed.

**Acceptance Criteria**:
- [ ] `confirmDraft` promotes session-scope rows to course-scope.
- [ ] Session-scope rows survive the promotion (verified via `listForScope({kind:"session", id})` post-confirm).
- [ ] Course-scope rows match the previously-attached docs (verified via `listForScope({kind:"course", id})` post-confirm).
- [ ] Legacy drafts without `sessionId` still attach via the fallback path.

---

### Unit 6: `course.list_library_documents` adds `attachedToCurrentSession` flag

**File**: `packages/tools/src/course/list-library-documents.ts`

Extend output schema and handler:

```typescript
const OutputSchema = z.object({
  documents: z.array(
    z.object({
      // … existing fields …
      attachedToCurrentCourse: z.boolean(),
      /**
       * True when the document is attached to the current bootstrap session's
       * scope. Always false outside bootstrap mode. Useful for the explorer to
       * see which library docs this exploration is reading from.
       */
      attachedToCurrentSession: z.boolean(),
    }),
  ),
});

// In the handler:
async handler(_args, ctx: ToolContext) {
  const docs = await ctx.services.artifacts.listDocuments(ctx.studentId);
  const courseAttached = new Set(ctx.courseDocumentIds ?? []);

  // Session scope: look up which docs are session-attached in the current session.
  // Bootstrap mode uses parentSessionId (set by explorer harness); other modes use sessionId directly.
  const sessionId = ctx.parentSessionId ?? ctx.sessionId;
  const sessionAttached = sessionId
    ? new Set(await ctx.services.documentScopes.listForScope({ kind: "session", id: sessionId }))
    : new Set<string>();

  return {
    documents: docs.map((d) => ({
      // … existing fields …
      attachedToCurrentCourse: courseAttached.has(d.documentId),
      attachedToCurrentSession: sessionAttached.has(d.documentId),
    })),
  };
}
```

Update description to mention `attachedToCurrentSession`.

**Acceptance Criteria**:
- [ ] `attachedToCurrentSession` is `true` for docs the current bootstrap session has attached.
- [ ] `attachedToCurrentSession` is `false` outside bootstrap (or any session without scope rows).
- [ ] Existing `attachedToCurrentCourse` behavior unchanged.

---

### Unit 7: Tests

**Files**:
- `packages/core/src/services/__tests__/bootstrap-service.test.ts` (extend): test that `initDraft({ sessionId })` stores the session id; `confirmDraft` uses `promoteScope`; verify both session and course rows exist post-confirm.
- `packages/tools/src/course/__tests__/start-exploration.test.ts` (extend): test that the handler attaches docs to session scope as a side-effect before spawning the explorer.
- `packages/tools/src/course/__tests__/list-library-documents.test.ts` (extend): test the new `attachedToCurrentSession` flag.
- `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` (extend): test that the explorer's sub-ctx has `parentSessionId` set.

**Acceptance Criteria**:
- [ ] All new tests pass.
- [ ] Existing bootstrap + start-exploration tests pass (with updated mocks for `documentScopes`).

---

## Implementation Order

Single-stride. Suggested intra-stride order:

1. Unit 1 (`DraftCourseState.sessionId` + initDraft signature)
2. Unit 2 (`ToolContext.parentSessionId` + explorer sub-ctx)
3. Unit 4 (`draft_init` passes sessionId)
4. Unit 5 (`confirmDraft` uses promoteScope)
5. Unit 3 (`start_exploration` side-effect attach)
6. Unit 6 (`list_library_documents` session flag)
7. Unit 7 (tests, run continuously)

## Testing

Covered by Unit 7. Key invariants:
- Re-running `start_exploration` is idempotent on session-scope rows.
- `confirmDraft` produces course-scope rows AND keeps session-scope rows.
- `attachedToCurrentSession` flag correctly reflects the current session's docs.

## Risks

1. **Legacy draft compatibility** (low). Drafts created before this feature have no `sessionId`. The fallback `attachMany` branch in `confirmDraft` covers them for one deploy cycle. If durable drafts persist across the migration boundary, the schema migration's column default should be a sentinel (e.g., empty string or NULL with a code-side fallback).

2. **Sub-agent context chain** (low-medium). The `parentSessionId` field on `ToolContext` is only populated by `runConceptExplorer`. If a future sub-agent doesn't propagate it, `draft_init` and `list_library_documents` will fall back to `ctx.sessionId` — which for a sub-agent is the sub-agent's own session, not the parent. That breaks the session-scope read. Mitigation: pattern the field threading consistently (`runConceptExplorer` sets it; any new sub-agent harness should too). Document in `service-deps-injection` or a new `sub-agent-context-threading` pattern.

3. **Schema migration for `bootstrap_drafts.session_id`** (low). Verify whether drafts are persisted (durable) or in-memory only (per `bootstrap-readiness-durable-drafts` v0.1.1 feature). If persisted, the migration is real work. If in-memory, the type extension is sufficient.

4. **`promoteScope` and audit-trail intent** (low). `promoteScope` was designed for this exact case (per `scopes-primitive`'s Unit 3). Its idempotency means re-confirming the same draft (shouldn't happen — confirmDraft is one-shot) doesn't duplicate rows.

## Implementation Notes

### Design flaw assessment: bootstrap_drafts schema
Drafts ARE persisted via `SqliteDraftStore` with the full `DraftCourseState` stored as a JSON blob in the `stateJson` column (`packages/core/src/schema.ts:87`). Since `sessionId` is stored as part of the JSON blob (not a separate column), no SQL migration is needed — adding an optional field to the TypeScript type is sufficient. Legacy rows deserialize correctly (undefined `sessionId` field) and the fallback path in `confirmDraft` handles them.

### Units delivered

**Unit 1** — `DraftCourseState.sessionId?: SessionId` added to `packages/core/src/types/artifacts.ts`. `initDraft` in both the interface (`packages/core/src/types/tool.ts:719`) and implementation (`packages/core/src/services/bootstrap-service.ts`) updated to accept optional `sessionId`. Stored via the existing JSON blob path — no migration needed.

**Unit 2** — `ToolContext.parentSessionId?: SessionId` added to `packages/core/src/types/tool.ts`. `makeToolContext` test helper updated to accept `parentSessionId`.

**Unit 3** — `runConceptExplorer` in `packages/curriculum/src/bootstrap/explorer.ts` now sets `parentSessionId: input.baseContext.sessionId` on the explorer context before constructing the `InProcessToolRegistry`.

**Unit 4** — `course.draft_init` handler reads `ctx.parentSessionId ?? ctx.sessionId` and passes as `sessionId` to `initDraft`.

**Unit 5** — `course.start_exploration` handler in `packages/tools/src/course/start-exploration.ts` attaches `args.documentIds` to session scope via `ctx.services.documentScopes.attachMany({ scope: { kind:"session", id: ctx.sessionId }, ... })` BEFORE spawning the explorer.

**Unit 6** — `BootstrapServiceImpl.confirmDraft` replaced the single `attachMany` call with a two-branch strategy: if `d.sessionId` is set, call `promoteScope({ from: {kind:"session", id:d.sessionId}, to: {kind:"course", id:courseId} })`; otherwise fall back to `attachMany(d.documentIds)` for legacy compatibility. Both paths are non-fatal (warnings logged, course persists).

**Unit 7** — `list-library-documents.ts` extended with `attachedToCurrentSession: boolean` flag, derived from `documentScopes.listForScope({ kind:"session", id: ctx.parentSessionId ?? ctx.sessionId })`. Tool description updated.

### Tests
- `packages/core/src/services/__tests__/bootstrap-service.session-scope.test.ts` — 6 new tests covering `initDraft` sessionId storage, `confirmDraft` promotion path, legacy fallback, fatal non-propagation.
- `packages/tools/src/course/__tests__/start-exploration.test.ts` — 2 new tests for session-scope attach side-effect.
- `packages/tools/src/course/__tests__/list-library-documents.test.ts` — 4 new tests for `attachedToCurrentSession` flag, including `parentSessionId` fallback.
- `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` — 1 new test verifying `parentSessionId` threading through to the draft's `sessionId`.

### Build note
The `@praxis/curriculum` and `@praxis/tools` packages resolve workspace dependencies via the built `dist/` (no `vitest.config.ts` with `praxis-source` conditions). After modifying `draft-init.ts`, `pnpm --filter @praxis/tools build` was required to update `dist/course/draft-init.js` before the explorer tests could pick up the change. All tests confirmed passing after the build.

## Review (2026-05-13)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `confirmDraft` swallows `promoteScope` errors with `log.warn`, just like the legacy `attachMany` fallback. The comment says "documents can be manually re-attached" — but in the session→course promotion case, the session-scope rows DO survive the failure (good), so the recovery path is "redo confirmDraft" (which is idempotent on the course-rows side via `promoteScope`). The current comment is slightly misleading; a follow-up could say "promoteScope is idempotent — re-confirming is safe" but it's not worth a code change.

**Notes**: Threading-chain comments in `tool.ts:144-160` and `explorer.ts:140-146` are excellent — future sub-agent harnesses know exactly what to propagate. Backwards-compat is well-handled: `sessionId` on `DraftCourseState` is optional, `confirmDraft` falls back to the legacy `attachMany` path, and `list-library-documents` falls back to `ctx.sessionId` when `parentSessionId` is absent (so non-bootstrap callers get the same "always false" result without an explicit check). Foundation-doc `docs/ARCHITECTURE.md:386-390` already describes the session→course promotion; no doc drift.

What's now possible: a bootstrap exploration carries the user's selected documents as session-owned for its lifetime, and `confirmDraft` preserves the audit trail by promoting (not replacing) those rows to course-scope. The Orphaned tab in `library-view-tabs-filters` (sibling feature, not yet shipped) can now query unconfirmed-bootstrap session scopes and surface the docs that didn't make it into a course.

## Notes for downstream

- `viewer-tab-scoped-sidebar` (sibling wave-2): the sidebar needs to derive the active scope from route + tab + session. In bootstrap mode, the active scope is `{kind:"session", id:sessionId}`. The session-scope rows this feature writes are what populates that sidebar view.
- `library-view-tabs-filters` (sibling wave-2): the "Orphaned" tab surfaces docs whose only scope rows are sessions with no active state (abandoned bootstraps). This feature's "never GC session rows" decision is what makes the Orphaned tab meaningful.
