---
id: gate-patterns-v0.1.3
kind: story
stage: done
tags: [patterns]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: patterns
created: 2026-05-18
updated: 2026-05-18
---

# Patterns extracted for v0.1.3

## New patterns codified

- `streaming-ipc-channel-helpers` — `registerSubscriberStream` (callback) and
  `registerGeneratorStream` (`AsyncIterable`) factories own all
  `.start`/`.events.<id>`/`.cancel` envelope/abort/redaction boilerplate
  across 7 streaming channels (activity, sub-agent, course-create-drafts,
  quick-check, session.send, ingest, memory).
- `notify-listeners-helper` — `notifyListeners(listeners, event, log,
  component)` in `packages/core/src/services/db-helpers.ts:39` is the shared
  per-listener-try/catch fanout step used by 4 services (activity,
  quick-check, sub-agent, course-create).

## Inconsistencies flagged

- `subscriber-fanout-stream` skill's Example 2 still shows the inline
  AbortController/push boilerplate; the bundle replaced that with
  `registerSubscriberStream`. Tracked in
  `gate-patterns-inconsistency-subscriber-fanout-stream-skill-rewrite`.
- `ipc-envelope-handler` skill does not mention the new `handleEnvelope`
  helper (used in 121 call sites across 19 channel files). Tracked in
  `gate-patterns-inconsistency-ipc-envelope-handler-add-handleenvelope`.
- Informational only (no item): `services.bootstrap` field key remains
  after the mode rename — a deliberate trade-off documented in CLAUDE.md.
  No skill change needed.

## Pattern files written

- `.claude/skills/patterns/streaming-ipc-channel-helpers.md` (new)
- `.claude/skills/patterns/notify-listeners-helper.md` (new)
- `.claude/skills/patterns/SKILL.md` (added two entries to the Communication patterns section)
- `.claude/rules/patterns.md` (added two entries to the Communication patterns section + cross-reference in `subscriber-fanout-stream`)
