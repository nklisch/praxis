---
id: bug-chat-documents-sidebar-flicker
kind: story
stage: drafting
tags: [bug, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-17
---

# Chat documents sidebar flickers between library view and loading state

## Brief

In the chat window, the documents sidebar flashes between the library view and a loading state. The flicker suggests the sidebar is re-mounting or refetching on each render cycle (or a `loading` boolean flips back to true mid-stream) instead of holding a stable view once the library has loaded. Worth investigating the document list data source for the chat-scoped sidebar and confirming the loading state is only true on initial fetch — not on every dependency change.

## Suspected area

`packages/ui/src/components/` chat documents sidebar — likely a `useResource`/`useEffect` whose dependencies include a freshly-constructed object every render, or a stream subscription that flips `loading` back true on each event. Related pattern: `use-resource-hook`, `subscriber-fanout-stream`.

## Acceptance criteria

- After the initial library load, the sidebar holds the loaded view across normal chat-stream activity (no visible flash).
- `loading` is `true` only on first fetch, not on subsequent re-renders or stream events.
- A regression test pins the stable-after-loaded behavior.
