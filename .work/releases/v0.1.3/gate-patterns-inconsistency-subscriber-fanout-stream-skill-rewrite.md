---
id: gate-patterns-inconsistency-subscriber-fanout-stream-skill-rewrite
kind: story
stage: done
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

## Implementation notes (2026-05-18)

Replaced Example 2 in `.claude/skills/patterns/subscriber-fanout-stream.md`:
- Old: ~40-line inline boilerplate (`bootstrap-drafts-channel.ts`, channel
  `praxis.bootstrap.drafts.events.*`) showing manual AbortController setup,
  push closure with `isDestroyed()` check, hold-open Promise, separate cancel
  handler.
- New: 12-line `registerSubscriberStream<DraftStreamEvent>` call sourced from
  `course-create-drafts-channel.ts:27` (channel `praxis.courseCreate.drafts.events`).

Also updated:
- Rationale paragraph: clarified that the `*-channel.ts` fanout layer uses
  `registerSubscriberStream` / `registerGeneratorStream`, with cross-reference
  to `streaming-ipc-channel-helpers.md`.
- Trailing summary sentence: noted all channel-layer fanout uses the helper.
- Common Violations: replaced the now-obsolete `wc.isDestroyed()` /
  `controller.signal.aborted` bullets (helper handles both) with a single
  "inline boilerplate instead of helper" violation and a "skipping *.cancel"
  violation for custom channels.
- Fixed stale "bootstrap drafts" / `praxis.bootstrap.drafts.events.*` channel
  names throughout; `services.bootstrap` field key preserved by intent.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Example 2 replaced with 12-line registerSubscriberStream call from course-create-drafts-channel.ts. Rationale updated to point to streaming-ipc-channel-helpers. Common violations updated — inline boilerplate violation replaces the now-obsolete wc.isDestroyed()/signal.aborted bullets. All stale "bootstrap drafts" channel names replaced. Four-layer architecture description preserved.
