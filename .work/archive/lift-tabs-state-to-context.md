---
id: lift-tabs-state-to-context
kind: story
stage: done
tags: [ui, refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Lift tabs state into a React context

## Why

The sidebar story (`epic-document-library-viewer-tab-scoped-sidebar-sidebar`) added `useDerivedScope`, which internally calls `useTabs()`. `ChatRoute` also calls `useTabs()` at the route level. Both calls create their own state instances and fire their own `client.tabs.listOpen()` IPC calls. They stay in sync, but the duplication is wasteful — two state copies, two reconciliation paths, two network round-trips per route navigation.

Discovered during /agile-workflow:review (2026-05-13). The implementation note in the sidebar story acknowledges this and explicitly defers it as a refactor opportunity.

## Scope

1. Create `TabsContext` / `TabsProvider` (likely `packages/ui/src/context/tabs-context.tsx`) that hosts the state and methods currently produced by `useTabs`.
2. Mount `<TabsProvider>` near the router root so all children share a single instance.
3. Change `useTabs()` to consume the context instead of producing its own state.
4. Verify: only one `client.tabs.listOpen()` fires per route navigation.

## Acceptance Criteria

- [ ] `useTabs()` reads from a single context instance.
- [ ] `chat-route.test.tsx` can assert `listOpen` is called once (currently loosened to `toHaveBeenCalled()`).
- [ ] No regressions in tab strip + sidebar behaviour.

## Out of scope

- Migrating other shared state (documents, sessions, etc.) to the same context pattern.

## Implementation notes (2026-05-14)

- Created `packages/ui/src/context/tabs-context.tsx` containing
  `TabsProvider`, `useTabs`, and the `UseTabsResult` interface. The
  provider owns the state and memoises the result value; the consumer
  hook reads from the context and throws if no provider is mounted
  (matches the `context-hook-pair` pattern).
- Rewrote `packages/ui/src/hooks/use-tabs.ts` as a thin re-export
  shim — `useTabs`, `TabsProvider`, and `UseTabsResult` all forward
  from the new context module. Every existing caller (`useTabs`,
  `UseTabsResult` typed imports) keeps working without changes.
- Mounted `<TabsProvider>` in `packages/ui/src/app.tsx` between
  `<AuthProvider>` and `<RouterProvider>` so every route renders
  beneath the same shared instance.
- Updated tests that rendered hooks/routes which call `useTabs`:
  - `packages/ui/src/__tests__/use-tabs.test.tsx` — wrapper wraps with
    `<PraxisClientProvider><TabsProvider>…</TabsProvider></PraxisClientProvider>`.
  - `packages/ui/src/hooks/__tests__/use-tabs.test.tsx` — same.
  - `packages/ui/src/__tests__/chat-route.test.tsx` — wrapper now
    includes `<TabsProvider>`; the previously-loosened
    `toHaveBeenCalled()` assertion tightened to
    `toHaveBeenCalledTimes(1)` — the acceptance criterion.
  - `packages/ui/src/__tests__/library-route.test.tsx` — wrapper now
    includes `<TabsProvider>` because `LibraryRoute` uses `useTabs` via
    the recent-sessions handler.
- `useDerivedScope` test still mocks `useTabs` at module level, so the
  refactor is invisible to it.

## Verification

- `pnpm --filter @praxis/ui typecheck`: green.
- `pnpm --filter @praxis/ui test`: 1010 tests across 111 files pass.
  Key cluster: `use-tabs.test.tsx` (11), `chat-route.test.tsx` (12),
  `use-derived-scope.test.tsx` (18), `library-route.test.tsx` (16) —
  46 tests covering the lifted-state surface plus its callers.
- The acceptance criterion `chat-route.test.tsx can assert listOpen
  is called once` is met (line 187 of that file).

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Textbook `context-hook-pair` refactor. The old `useTabs` is
a thin re-export shim from `hooks/use-tabs.ts` → `context/tabs-context.ts`,
so no caller had to be touched. Provider mounted between AuthProvider
and RouterProvider in `app.tsx`. The previously-loosened
`toHaveBeenCalled()` assertion is now `toHaveBeenCalledTimes(1)` —
that's the cleanest possible confirmation that the duplicate fetch is
gone. 1010 ui tests stay green. Ready to advance.
