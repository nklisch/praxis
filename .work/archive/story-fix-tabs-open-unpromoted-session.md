---
id: story-fix-tabs-open-unpromoted-session
kind: story
stage: done
tags: [bug]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Fix `TabsService.open` failing for lazy-persisted sessions

## Symptom
Every UI-initiated session open immediately fails with an "An internal error occurred" dialog. The main-process log shows the same envelope error per attempt:

```
ERROR: ipc.envelope.error
  channel: "praxis.tabs.open"
  code: "INTERNAL"
  err.message: "TabsService.open: session not found: <sessionId>"
  err.stack: at TabsServiceImpl.open (.../tabs-service.js:177:19)
```

Sessions DO eventually appear after they're sent a message (the user observed they were "saved" after a restart cycle) — which is the lazy-persist tell.

## Root cause
The empty-session-cleanup feature introduced lazy-persist: `SessionService.start()` registers the session in an in-memory `SessionPromotionRegistry` and defers the `sessions` table INSERT until the first `send()` call. The session row only appears once the user actually types a message.

`TabsServiceImpl.open` (in `packages/core/src/services/tabs-service.ts`) was not updated for this contract change — it does a direct `SELECT FROM sessions WHERE id = ?` to look up `modeId` for tab-title generation, and throws "session not found" when the row is missing. The renderer flow is `session.start` → `tabs.open` (no message in between), so every tab open hits the throw before the row is ever written.

The schema is already lazy-persist aware — migration 0026 dropped the `tabs.session_id` FK precisely so tabs could exist before their `sessions` row materialised. `TabsService` is the only layer that was still enforcing the old invariant.

## Fix approach
Inject the `SessionPromotionRegistry` into `TabsServiceImpl` via an optional thunk dep (`sessionPromotionRegistry?: () => SessionPromotionRegistry | undefined`). Thunk indirection is required because `TabsServiceImpl` is built in workspace step 8, before the registry exists at session-precursor step 9 — the standard `ref-cell-bridge` pattern (`.claude/skills/patterns/ref-cell-bridge.md`).

- `open()`: when the `sessions` row lookup misses, fall back to `registry.get(sessionId)`. If the registry has it, use its `modeId` for title generation and proceed with the tab INSERT. If it doesn't, throw the original "session not found" error (preserves discarded-session and genuinely-unknown-session behavior).
- `anyRowToSummary()`: when a session tab joined-row has `modeId === null` (orphan row), fall back to the registry to fill in `modeId / courseId / assignmentId`. This covers the read-path closure — `loadOrThrow → get`, `listOpen`, `list`, `get` — so the round-trip read after the INSERT (and any subsequent strip refresh while the session is still unpromoted) doesn't throw either.
- The new dep is optional, so tests and any legacy non-Electron paths that build `TabsServiceImpl` without a registry continue to throw the original error — no behavioral change for them.

## Regression test
`packages/core/src/services/__tests__/tabs-service.test.ts` — new describe block "open: lazy-persisted session (empty-session-cleanup regression)" with three cases:
1. `open()` succeeds when the sessionId is in the registry but not in the DB (the bug repro — would throw "session not found" before this fix).
2. `open()` still throws when the sessionId is in neither DB nor registry (preserves error path for discarded or unknown sessions).
3. `open()` still throws when no registry is wired at all (preserves legacy contract).

## Implementation notes
- **Files changed**:
  - `packages/core/src/services/tabs-service.ts` — added `sessionPromotionRegistry?` dep, registry-aware fallback in `open()` and `anyRowToSummary()`, `registry` accessor on the impl
  - `packages/desktop/electron/main/services/build-workspace-services.ts` — added `sessionPromotionRegistry` to `WorkspaceServiceDeps`; forwarded to `TabsServiceImpl` construction
  - `packages/desktop/electron/main/services.ts` — declared `let promotionRegistryRef: SessionPromotionRegistryImpl | undefined` before step 8, passed `() => promotionRegistryRef` to workspace deps, assigned `promotionRegistryRef = sessionPrecursors.sessionPromotionRegistry` immediately after step 9
  - `packages/core/src/services/__tests__/tabs-service.test.ts` — three new regression cases
- **Adjacent cleanup**: `pnpm exec biome check --write` on `build-workspace-services.ts` converted three pre-existing value-imports of type-only symbols (`ArtifactsServiceImpl`, `MemoryServiceImpl`, `SqliteDraftStore`) to `import type`. They were dormant `useImportType` violations adjacent to the new `type SessionPromotionRegistry` import; folded in to keep the lint output clean for the changed-file set.
- **Verification**: `pnpm typecheck` and `pnpm test` (4776 passed / 23 skipped / 0 failed) both green. `pnpm exec biome check` on the four changed files is clean.
- **Adjacent issues parked for separate consideration**: none — the broader 630 lint errors are a pre-existing baseline distinct from this bug's surface area.

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fix matches documented root cause precisely. Regression tests cover the right three-case matrix (registry-fallback succeeds; neither-source throws; no-registry-wired throws — preserves legacy contract). Uses the standard `ref-cell-bridge` pattern correctly with thorough doc comments explaining the step-8/step-9 ordering. Read-path closure via `anyRowToSummary` ensures `listOpen` / `list` / `get` all benefit from the same fallback. Adjacent `useImportType` cleanup was scoped to the changed-file set and justified. No foundation-doc drift, no breaking changes, no security surface touched.

What's now possible: UI tab open works for newly-started sessions before they're persisted, fixing the "An internal error occurred" dialog on every session-start → tab.open round-trip.
