---
id: gate-docs-context-hook-pair-tabs-now-shared
kind: story
stage: review
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: docs
created: 2026-05-14
updated: 2026-05-14
---

# `context-hook-pair` pattern actively forbids putting tabs state in context, but tabs state was lifted to `TabsContext`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/context-hook-pair.md:121-123`
- Code: `packages/ui/src/context/tabs-context.tsx:1-130`, `packages/ui/src/app.tsx:14-18`, `packages/ui/src/hooks/use-tabs.ts:1-20`

## Current doc text
> ## When NOT to Use
> - Server data (courses, sessions, tabs) that lives in the database — use `useResource` + `client.*` calls; don't put server data in context
> - Per-tab state (message logs, composer value) — those belong inside `<ChatTabBody>`; context here would break tab isolation

## Reality
Tabs state was lifted into `TabsContext`
(`packages/ui/src/context/tabs-context.tsx`), with `<TabsProvider>`
mounted in `app.tsx` between `<AuthProvider>` and `<RouterProvider>`.
The pattern is used precisely because two parallel `useTabs()`
consumers (`ChatRoute` and `useDerivedScope`) were each producing their
own state + duplicate `client.tabs.listOpen()` fetches. The "tabs"
exclusion in the "When NOT to Use" list contradicts the present
design. (Per-tab message-log / composer state remains inside
`<ChatTabBody>` — that part is still accurate, so the carve-out for
*per-tab* state should be preserved.)

## Required edit
Remove `tabs` from the "server data" exclusion list (leave
`courses, sessions`). Add an Example 3 for `TabsProvider` / `useTabs`
from `packages/ui/src/context/tabs-context.tsx` showing the
snapshot-loading provider and the in-context state that lets sibling
consumers share one `client.tabs.listOpen()` fetch. Keep the
"Per-tab state" bullet as-is — the open-tab *list* is shared, but each
tab's message log and composer remain inside `<ChatTabBody>`.

## Implementation

Changes to `.claude/skills/patterns/context-hook-pair.md`:

1. **Rationale** (line ~13): Added `TabsProvider` to the list of Praxis examples alongside
   `PraxisClientProvider` and `AuthProvider`.

2. **"When NOT to Use" bullet** (was line 122): Removed `tabs` from the "server data"
   exclusion list. Rewrote the bullet to make the actual rule clearer — the heuristic is
   "consumed by only one component"; when sibling consumers would issue duplicate fetches,
   lifting to context is the correct call. `courses` and `sessions` remain as examples of
   data that stays in `useResource`.

3. **Example 3** (new, inserted before old "Adding to tests" example): Added a full
   `TabsProvider`/`useTabs` example drawn from
   `packages/ui/src/context/tabs-context.tsx`. Shows the `UseTabsResult` interface shape,
   the provider delegating to an internal `useTabsState()` hook, the guard-throwing
   `useTabs()` consumer, and the mounting location in `app.tsx`. Commentary calls out that
   the internal hook loads via `client.tabs.listOpen()` on mount (manual `refresh()`
   wired into `useEffect`, not `useResource`), and that one shared fetch serves all
   consumers per route navigation.

4. **Old Example 3 → Example 4**: The "Adding to tests" section was renumbered to Example 4.

Per-tab state bullet ("Per-tab state (message logs, composer value)...") is unchanged.
