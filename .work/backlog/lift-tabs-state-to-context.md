---
id: lift-tabs-state-to-context
kind: story
stage: implementing
tags: [ui, refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
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
