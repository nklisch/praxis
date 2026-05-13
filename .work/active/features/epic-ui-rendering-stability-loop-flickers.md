---
id: epic-ui-rendering-stability-loop-flickers
kind: feature
stage: drafting
tags: [ui, bug]
parent: epic-ui-rendering-stability
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Loop flickers — kill the re-render storms in the documents sidebar and audit log

## Brief

Two visible "flicker" bugs both come from React components re-rendering
more often than the underlying data actually changes. The documents
sidebar (inline in the chat route) flashes between its library view and
a loading state during a session — a `loading` boolean is flipping back
to true on dependency changes that don't represent a real reload, or
the data fetch is being re-triggered on every render. The audit log
sub-tab in the Memory Inspector re-renders continuously — surprising
because that surface is a **one-shot fetch via `useConfiguratorActions`**
(not a stream subscription, contrary to the epic body's initial framing),
so the loop is likely from a `useEffect` dep array containing freshly-
constructed objects or arrays, or from a re-fetch hook keyed on an
unstable identity.

This feature bundles both because the diagnostic pattern is the same —
profile in React DevTools, identify the unstable dependency or
re-fetching path, stabilize identity with `useMemo`/`useCallback` or
hoist the fetch trigger outside the render cycle — and any reusable
helper or pattern-skill that surfaces should apply to both.

## Epic context

- Parent epic: `epic-ui-rendering-stability`
- Position in epic: paired with `…-state-transitions` (the other
  half of the epic). Independent — runs in parallel.

## Scope absorbed from backlog

- `bug-chat-documents-sidebar-flicker` — sidebar in the chat workspace
  flashes between library and loading state; loading boolean likely
  flipping back to true on every dependency change.
- `idea-audit-log-render-flicker` — audit log re-renders in a tight
  loop; classic `useEffect` deps include freshly-constructed
  object/array each render, or a hook is re-keying on every render.

## Foundation references

- `docs/ARCHITECTURE.md` — chat workspace surface, configure-surface
  Memory Inspector
- `CLAUDE.md` — patterns `use-resource-hook`, `context-hook-pair`,
  `editorial-ui-primitives`

## Anchors (current implementation)

- Chat-scoped documents sidebar — inline in
  `packages/ui/src/routes/chat.tsx:48-148`; uses `useDerivedScope()`
  and calls `client.documentScopes.listForScope(scope)` conditionally
- Documents list component — `packages/ui/src/components/DocumentList.tsx`
  (or equivalent) consumed by the sidebar
- Audit log surface —
  `packages/ui/src/components/memory-inspector-tabs.tsx:268-303`
  (AuditTab sub-component within the Memory Inspector)
- Audit log data hook — `useConfiguratorActions()` at
  `packages/ui/src/hooks/use-configurator-actions.ts` (or wherever the
  hook lives) — note this is one-shot fetch, NOT a fanout-stream
- `useResource` hook — for reference; the audit hook may need a
  similar single-fetch-on-mount shape
