---
id: gate-docs-context-hook-pair-tabs-now-shared
kind: story
stage: implementing
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
