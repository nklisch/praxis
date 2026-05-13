---
id: epic-tutor-session-feel-tool-call-thread-persistence
kind: feature
stage: drafting
tags: [ui, chat, tutor-ux]
parent: epic-tutor-session-feel
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Tool-call thread persistence — keep tool artifacts readable

## Brief

`feature-agent-transparency-ux` (v0.1.1) added live-stream pacing —
`MIN_INTERSTITIAL_VISIBLE_MS = 800`
(`packages/ui/src/hooks/use-streamed-send.ts:56`) and the
`<ToolInterstitial>` settled-state UI
(`packages/ui/src/components/tool-interstitial.tsx:11-45`). Tool calls
also persist to the episodic log
(`packages/core/src/session/episodic.ts:19-35` writes every `EngineEvent`)
and can be replayed via `episodicToItems()`
(`packages/ui/src/hooks/episodic-to-messages.ts:59-190`). So
machinery exists — but the user reports tool calls still flash by too fast
to read, and once the turn ends the artifacts effectively disappear from
the visible thread.

The remaining gap (per the map): `episodicToItems()` produces `kind:
"interstitial"` items with `status: "settled"` instantly on replay — no
pacing on history load — and the live UI may collapse settled interstitials
out of view too aggressively. The "tool call as a first-class thread
artifact" framing is missing: a settled tool call should remain a readable,
scrollable, expandable entry in the thread, not a transient interstitial
that animates out.

This feature treats tool calls as first-class thread artifacts: settled
interstitials remain visible as compact-but-readable entries (with
expand/collapse for full args/result), replay from episodic produces the
same shape as the live stream, and the user can scroll back to any tool
call in the conversation as easily as scrolling back to a model message.
The 800ms minimum-display stays for live flow; persistence is the new
contract.

## Epic context

- Parent epic: `epic-tutor-session-feel`
- Position in epic: independent UI/UX feature — wave 1, parallelizable
  with the three other children.

## Foundation references

- `docs/ARCHITECTURE.md:310` — tool call & sub-agent transparency contract
- `feature-agent-transparency-ux` (done v0.1.1) — the foundation this
  builds on

## Anchors

- Interstitial component (current settled-state UI) —
  `packages/ui/src/components/tool-interstitial.tsx:11-45`
- Pacing timer — `packages/ui/src/hooks/use-streamed-send.ts:56,335-387`
- Episodic replay (the replay gap) —
  `packages/ui/src/hooks/episodic-to-messages.ts:59-190` (line 42-43
  produces interstitials with `status: "settled"` on history load)
- History loader — `useStreamedSend.loadHistory()`
  (`use-streamed-send.ts:524-535`)
- Sub-agent block — `packages/ui/src/components/sub-agent-block.tsx:28-85`
  (may need parallel persistence treatment)

## Design notes for feature-design

- Default state (resolved): settled tool calls render **collapsed** with
  the tool name and a one-line summary; click to expand and see full
  args and result. Keeps the thread scrollable; user opens what
  interests them. Matches Claude Code's pattern.
- Replay shape parity: a tool call read from episodic must produce the
  same component as the live stream once it settles — same collapsed
  default, same expand affordance.
- Sub-agent block: same collapsed treatment — after the parent tool
  settles, the sub-agent transcript stays available (collapsed) for the
  user to revisit. Don't auto-collapse so aggressively that the live
  step trail vanishes before the user notices it.
- Auto-scroll: ensure newly-arrived tool entries don't get scrolled out
  before the user notices.
- Reproduce-first: the user's "too fast to read" complaint may have a
  different root cause now that `MIN_INTERSTITIAL_VISIBLE_MS = 800`
  exists. Feature-design pass should reproduce the specific frustration
  first and confirm the persistence framing addresses the actual gap
  before writing code.
