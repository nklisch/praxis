---
id: epic-tutor-session-feel-cancellation-propagation
kind: feature
stage: drafting
tags: [core, engines, tools, chat]
parent: epic-tutor-session-feel
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Cancellation propagation — stop actually stops everything

## Brief

The Stop button visibly returns control to the user but tool calls and
sub-agent invocations keep running behind it. Tracing the abort signal:

- `Composer` Stop / Escape → `useStreamedSend.cancel()` →
  `iterator.return()` → fires `praxis.session.send.cancel` IPC channel
  (`packages/ui/src/hooks/use-streamed-send.ts:136-138`)
- `SessionServiceImpl.send(..., signal)` receives the `AbortSignal`
  (`packages/core/src/services/session-service.ts:125-250`)
- Signal is threaded into the engine session's `*send` generator
  (line 211: `for await (const event of capturedEntry.handle.send(message, signal))`)
- Engine adapter wires `signal.addEventListener("abort", ...) → conv.abort()`
  (`packages/core/src/engines/src/claude-code/adapter.ts:198-216`)

**The signal then dies.** `DispatchMeta` at
`packages/tools/src/registry.ts:17-20` carries only `callId` — there is no
`signal` field. Tool handlers don't receive it, and neither do the
sub-agent entries `runConceptExplorer`
(`packages/curriculum/src/bootstrap/explorer.ts:105-120`) and
`grade_with_rubric`. So when the user clicks Stop while bootstrap is
running, the engine turn aborts but the sub-agent's own engine session
continues, emitting tool calls and writing drafts until it finishes
naturally. That's the bug.

This feature adds an `AbortSignal` to `DispatchMeta` / `ToolContext`,
threads it through tool dispatch in all three engine adapters
(`claude-code`, `codex`, `direct`), and propagates it into sub-agent
entries. Sub-agent sessions get the parent's signal wired into their own
engine's abort handler. The `SubAgentRegistry` finishes any in-flight
sub-agent items with status `interrupted` when the parent aborts.

## Epic context

- Parent epic: `epic-tutor-session-feel`
- Position in epic: independent core/plumbing feature — wave 1,
  parallelizable. Largest feature in the epic; touches 3 engine adapters
  + tools + sub-agent flow.

## Foundation references

- `docs/ARCHITECTURE.md:310` — "Tool implementations may themselves call
  sub-agents… Sub-agent activity is published through `SubAgentRegistry`."
  Cancellation needs to walk that tree, not just the top engine session.

## Anchors

- Tool dispatch (the gap) — `packages/tools/src/registry.ts:17-20`
  (`DispatchMeta` shape) and `packages/tools/src/registry.ts:79-120`
  (`dispatch()`)
- Tool context — wherever `ToolContext` is constructed (typically per
  adapter, threaded into handler calls)
- Engine adapter dispatch call sites:
  - `packages/core/src/engines/src/claude-code/adapter.ts` (signal already
    threaded at the engine level — line 198-216)
  - `packages/core/src/engines/src/codex/`
  - `packages/core/src/engines/src/direct/`
- Sub-agent entries (need signal):
  - `packages/curriculum/src/bootstrap/explorer.ts:61,86-145`
    (`runConceptExplorer`; `subAgentHandle` is passed but no signal)
  - Any other sub-agent uses (`grade_with_rubric`, etc.)
- `SubAgentRegistry` —
  `packages/core/src/services/subagent-registry.ts:45-118` (today
  transparency-only; needs an abort hook on parent cancellation)
- Session cancel path — `SessionServiceImpl.send`
  (`packages/core/src/services/session-service.ts:125-250`, esp.
  233-249 where `signal?.aborted` already short-circuits)

## Design notes for feature-design

- Signal shape on `DispatchMeta`: `signal?: AbortSignal` — optional so
  test paths and direct invocations still work.
- `ToolContext.signal` — same shape, exposed to handlers.
- Sub-agent abort semantics: when parent aborts, sub-agent's engine
  session aborts (using the same `conv.abort()` path as parent). The
  sub-agent's tools mid-flight then receive the new aborted signal too —
  recursive walk for free.
- Idempotency: re-aborting an already-aborted signal is a no-op. Handlers
  must tolerate `signal.aborted` being true at entry (return promptly).
- `SubAgentRegistry` lifecycle: when the parent session emits
  `interrupted`, any sub-agent items still `running` should settle as
  `interrupted` too.
- Tool-side contract: handlers should periodically check `signal.aborted`
  during long loops (e.g., per-page reads in `document.read_pages`,
  per-chunk in `retrieve_from_documents`).
