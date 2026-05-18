---
id: gate-patterns-inconsistency-subscriber-fanout-stream-skill-rewrite
kind: story
stage: drafting
tags: [refactor, documentation]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: patterns
created: 2026-05-18
updated: 2026-05-18
---

# Rewrite `subscriber-fanout-stream` Example 2 to use the new streaming-ipc-channel-helpers

## Existing pattern
`.claude/skills/patterns/subscriber-fanout-stream.md`

## Drift
The skill's Example 2 ("Bootstrap drafts channel — main-process fanout with
AbortController hold-open") shows ~40 lines of inline boilerplate:
`activeAbortControllers.set(...)`, `push()` closure with `isDestroyed()`
check, hold-open `await new Promise(addEventListener('abort'))`, and a
separate `ipcMain.on(cancel)` handler.

That inline form is no longer present anywhere in the main process. Every
subscriber-style channel now calls `registerSubscriberStream(...)` from
`packages/desktop/electron/main/stream-handler.ts`. The new pattern skill
is `streaming-ipc-channel-helpers`.

## Required edit
- Replace Example 2 with the current implementation at
  `course-create-drafts-channel.ts:27` (or activity-channel.ts:33), which is
  a single call to `registerSubscriberStream(...)`.
- Update the rationale: "the `*-channel.ts` fanout layer is implemented via
  `registerSubscriberStream` / `registerGeneratorStream` — see
  `streaming-ipc-channel-helpers`."
- Keep the four-layer flow description (service subscribe → channel fanout →
  client events → UI hook) — that's still the architectural shape; only the
  channel-layer implementation has been factored out.

Note: there is a related gate-docs item
(`gate-docs-ipc-server-extraction-pattern-skill-references`) that addresses
the file-path/channel-name drift in Example 2; this item is specifically
about replacing the inline-boilerplate form with the helper call.
