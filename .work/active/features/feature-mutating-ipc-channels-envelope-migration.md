---
id: feature-mutating-ipc-channels-envelope-migration
kind: feature
stage: implementing
tags: [refactor, security]
parent: null
depends_on: [fix-wrapenvelope-withschema-arg-routing-and-client-unwrap]
release_binding: v0.1.2
gate_origin: patterns
created: 2026-05-14
updated: 2026-05-14
---

# Migrate mutating IPC channels in `ipc-server.ts` to the `ipc-envelope-handler` pattern

## Existing pattern
`ipc-envelope-handler` (`.claude/skills/patterns/ipc-envelope-handler.md`) — `wrapEnvelope` and `handleEnvelope` helpers in `packages/desktop/electron/main/ipc-helpers.ts` produce `{ ok: true, value } | { ok: false, error: { code, message, requestId } }` instead of throwing. The client peels via `unwrapEnvelope`, which throws `IpcError` carrying `.code` and `.requestId`.

## Refactor Overview

The arg-routing bug in `wrapEnvelope + withSchema` was fixed in `fix-wrapenvelope-withschema-arg-routing-and-client-unwrap` (the `handleEnvelope` helper composes the event-stripping correctly). With that helper available, this refactor migrates the remaining ~56 invoke channels from raw `handle(...)` (which throws unwrapped `Error` to renderer) to the envelope contract.

**Scope is invoke channels only.** Streaming channels (`*.events.start` / `.cancel`) use the `subscriber-fanout-stream` pattern with their own per-event envelope and are out of scope.

**Per-step recipe** (applied per channel family):
1. Replace `handle("praxis.X.Y", async (_event, payload) => services.foo(...))` with `handle("praxis.X.Y", handleEnvelope("praxis.X.Y", log, <ZodSchema>, async (input) => services.foo(...)))` for channels with structured payloads.
2. For no-payload getters, use `handle("praxis.X.Y", wrapEnvelope("praxis.X.Y", log, async () => services.foo()))`.
3. Update `@praxis/client/services/<domain>-client.ts` to call `unwrapEnvelope(result)` on each migrated channel's response. For methods that previously returned `void` and ignored the result, just `unwrapEnvelope(...)` for the side-effect of throwing on failure.
4. Add an integration test in `packages/desktop/electron/main/__tests__/<family>-envelope.test.ts` exercising one success path and one validation-failure path per family. Use the `electron-ipc-test-harness` pattern.
5. Run `pnpm --filter @praxis/desktop test`, `pnpm --filter @praxis/client test`, `pnpm --filter @praxis/desktop typecheck && pnpm --filter @praxis/client typecheck` for each step.

**Sequential, not parallel**: every step modifies `ipc-server.ts`. Steps are chained via `depends_on` so the orchestrator processes them one at a time — no merge conflicts.

**Behavior preservation**: this refactor does NOT change which mutations succeed. It only changes the wire shape (envelope) and the client-side error type (`IpcError` instead of generic `Error`). Renderer hooks already catch errors from these calls; the new `IpcError` is a strict-subtype-compatible replacement.

## Refactor Steps

### Step 1: `praxis.session.*` invoke channels
**Priority**: High (security — live session interaction is high-traffic)
**Risk**: Medium (in-flight sessions; coordinate with hooks)
**Files**: `packages/desktop/electron/main/ipc-server.ts`, `packages/client/src/services/session-client.ts`
**Story**: `feature-mutating-ipc-channels-envelope-migration-step-1-session`
**Channels**: `praxis.session.active`, `praxis.session.end`, `praxis.session.spawnFromAssignment`

### Step 2: `praxis.documents.*` invoke channels
**Priority**: Medium
**Risk**: Low
**Files**: `packages/desktop/electron/main/ipc-server.ts`, `packages/client/src/services/documents-client.ts`
**Story**: `feature-mutating-ipc-channels-envelope-migration-step-2-documents`
**Channels**: `praxis.documents.list`, `praxis.documents.get`, `praxis.documents.delete`

### Step 3: `praxis.artifacts.*` invoke channels
**Priority**: Medium
**Risk**: Low
**Files**: `packages/desktop/electron/main/ipc-server.ts`, `packages/client/src/services/artifacts-client.ts`
**Story**: `feature-mutating-ipc-channels-envelope-migration-step-3-artifacts`
**Channels**: `praxis.artifacts.{courses, course, lessons, gates, progress, gateView, evaluateGates, markGatesViewed, newlyUnlockedCount, concepts}`

### Step 4: `praxis.memory.*` invoke channels
**Priority**: Medium
**Risk**: Low (read-mostly)
**Files**: `packages/desktop/electron/main/ipc-server.ts`, `packages/client/src/services/memory-client.ts`
**Story**: `feature-mutating-ipc-channels-envelope-migration-step-4-memory`
**Channels**: `praxis.memory.{studentModel, misconceptions, procedural, affective, export, delete}`

### Step 5: `praxis.assignments.*` invoke channels
**Priority**: High (submit is mutation-heavy, security-relevant)
**Risk**: Medium
**Files**: `packages/desktop/electron/main/ipc-server.ts`, `packages/client/src/services/assignments-client.ts`
**Story**: `feature-mutating-ipc-channels-envelope-migration-step-5-assignments`
**Channels**: `praxis.assignments.{get, getResponses, submit}`

### Step 6: `praxis.packs.*` invoke channels
**Priority**: Low
**Risk**: Low
**Files**: `packages/desktop/electron/main/ipc-server.ts`, `packages/client/src/services/packs-client.ts`
**Story**: `feature-mutating-ipc-channels-envelope-migration-step-6-packs`
**Channels**: `praxis.packs.{listAvailable, listImported, import}`

### Step 7: `praxis.lock.*` and `praxis.config.*` remaining channels
**Priority**: High (lock state is security-sensitive)
**Risk**: Medium (lock UX hooks read these directly)
**Files**: `packages/desktop/electron/main/ipc-server.ts`, `packages/client/src/services/{lock,config}-client.ts`
**Story**: `feature-mutating-ipc-channels-envelope-migration-step-7-lock-and-config`
**Channels**: `praxis.lock.{isSet, isUnlocked, lock}`, `praxis.config.{isLocked, unlock, selectedEngine, bootstrapConfig, firstRunCompleted, markFirstRunComplete}`

### Step 8: `praxis.author.*` invoke channels
**Priority**: Medium
**Risk**: Medium (~12 channels; largest family)
**Files**: `packages/desktop/electron/main/ipc-server.ts`, `packages/client/src/services/author-client.ts`
**Story**: `feature-mutating-ipc-channels-envelope-migration-step-8-author`
**Channels**: `praxis.author.{deleteGate, getCourseSummary, listFragmentOverrides, setGlobalPrompt, getGlobalPrompt, getModeAppend, exportMemory, ...}`

### Step 9: `praxis.notes.*` and `praxis.flashcards.*` invoke channels
**Priority**: Medium
**Risk**: Low
**Files**: `packages/desktop/electron/main/ipc-server.ts`, `packages/client/src/services/{notes,flashcards}-client.ts`
**Story**: `feature-mutating-ipc-channels-envelope-migration-step-9-notes-flashcards`
**Channels**: `praxis.notes.{update, get, delete}`, `praxis.flashcards.{get, delete, dueCount}`

### Step 10: `praxis.tabs.*` invoke channels
**Priority**: Medium
**Risk**: Medium (every UI surface uses tabs)
**Files**: `packages/desktop/electron/main/ipc-server.ts`, `packages/client/src/services/tabs-client.ts`, `packages/ui/src/context/tabs-context.tsx` (verify error handling)
**Story**: `feature-mutating-ipc-channels-envelope-migration-step-10-tabs`
**Channels**: `praxis.tabs.{listOpen, list, get, open, reopen, close, touch, rename}`

### Step 11: `praxis.sketches.*` and `praxis.conceptMaps.*` invoke channels
**Priority**: Low
**Risk**: Low
**Files**: `packages/desktop/electron/main/ipc-server.ts`, `packages/client/src/services/{sketches,concept-maps}-client.ts`
**Story**: `feature-mutating-ipc-channels-envelope-migration-step-11-sketches-concept-maps`
**Channels**: `praxis.sketches.{get, getSummary}`, `praxis.conceptMaps.{create, get, list, rename, delete, listVersions}`

### Step 12: `praxis.auth.claude.status` and per-domain channel modules
**Priority**: Low
**Risk**: Low
**Files**: `packages/desktop/electron/main/ipc-server.ts` (auth.claude.status only — login.start is streaming, defer), per-domain channel modules (`document-scopes-channel.ts`, `bootstrap-drafts-channel.ts`, `ingest-channel.ts`, `quick-check-channel.ts`, `subagent-channel.ts`, `activity-channel.ts`, `log-channel.ts`) — only the invoke (non-streaming) handlers within each
**Story**: `feature-mutating-ipc-channels-envelope-migration-step-12-misc-and-domain-modules`
**Channels**: `praxis.auth.claude.status`, plus invoke channels in per-domain modules
**Notes**: This is the cleanup step. Each per-domain module exposes invoke channels alongside its streaming channels — only the invoke side is in scope. Streaming side is deferred per the parent feature.

## Implementation Order

1. Step 1 (session)
2. Step 2 (documents)
3. Step 3 (artifacts)
4. Step 4 (memory)
5. Step 5 (assignments)
6. Step 6 (packs)
7. Step 7 (lock + config)
8. Step 8 (author)
9. Step 9 (notes + flashcards)
10. Step 10 (tabs)
11. Step 11 (sketches + concept-maps)
12. Step 12 (auth + per-domain cleanup)

After all 12 steps land:
- Run `grep -nE "handle\(\"praxis\.[^\"]+\", async" packages/desktop/electron/main/ipc-server.ts` — only streaming `*.events.start` / `.cancel` handlers should remain unwrapped.
- Verify `gate-security-ipc-helpers-rethrow-redactor-gap` is now subsumed (no unwrapped invoke channels left to leak raw errors).

## Acceptance

- Every mutating invoke channel in `ipc-server.ts` and per-domain modules is wrapped with `handleEnvelope` (with-schema) or `wrapEnvelope` (no-schema).
- Every client-side service method in `@praxis/client/services/` calls `unwrapEnvelope` on the response.
- One integration test per channel family asserts envelope shape on success + validation-failure paths.
- No regressions in renderer error handling — UI hooks catching `Error` continue to catch the new `IpcError` (subclass of `Error`).
- `pnpm typecheck && pnpm lint && pnpm test` pass.

## Overlap with adjacent items

- `gate-security-ipc-helpers-rethrow-redactor-gap` (drafting) — superseded by this feature. After Step 12 lands, that story should advance to done (verify-only) since its risk is closed.
- `fix-wrapenvelope-withschema-arg-routing-and-client-unwrap` (done) — sister fix that introduced `handleEnvelope`. This feature depends on it.
