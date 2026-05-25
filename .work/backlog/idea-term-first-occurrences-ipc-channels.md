---
id: idea-term-first-occurrences-ipc-channels
kind: idea
stage: parked
tags: [content, ipc, memory, follow-up]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Wire client-side IPC for `hasSeenTerm` / `markTermSeen`

## Brief
`feature-content-renderer-pipeline-step-5-definition-tracking` (commit `30c3c6d1`) shipped the SERVICE side: `TermFirstOccurrencesService` with `hasSeenTerm` + `markTermSeen` methods, wired into `ServiceDeps.memory.termFirstOccurrences`. But the CLIENT-side IPC channels that the UI calls into don't exist.

## Current state (interim)
`feature-content-renderer-pipeline-step-8-pipeline-wiring` (commit `fae33f8d`) wires the `useFirstOccurrence` hook into the `<Definition>` component. To ship something that doesn't crash, the hook uses NOOP stubs:
- `NOOP_HAS_SEEN` always returns `false` (treating every term as first-seen)
- `NOOP_MARK_SEEN` is a no-op

Consequence: `<Definition>` ALWAYS renders as a plain `<dfn>` without the first-occurrence styling — the definition-tracking feature is effectively inert at runtime. The renderer pipeline is otherwise complete; only this client-side IPC link is missing.

## What needs to land
1. Add IPC channel `praxis.memory.has_seen_term` (envelope-wrapped per `ipc-envelope-handler` pattern) — request `{studentId, term}`, response `{seen: boolean}`
2. Add IPC channel `praxis.memory.mark_term_seen` — request `{studentId, term, sessionId}`, response `{ok: true}`
3. Add corresponding `client.memory.hasSeenTerm` / `client.memory.markTermSeen` methods in `@praxis/client`
4. Replace the NOOPs in `packages/ui/src/hooks/use-first-occurrence.ts` (or wherever the hook consumes them) with `useService(client => client.memory.hasSeenTerm)` etc.
5. Verify per-turn cache + recording behavior with the real IPC bridge

## Sizing
Small story (~1 file per IPC channel + client method + hook wiring). Estimate ~150 LoC total.

## Origin
- Story: `feature-content-renderer-pipeline-step-8-pipeline-wiring` (commit `fae33f8d`)
- Service shipped in `feature-content-renderer-pipeline-step-5-definition-tracking` (commit `30c3c6d1`)
- IPC client gap noted by the step-8 implementation agent.
