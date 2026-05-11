---
id: feature-agent-transparency-ux
kind: feature
stage: drafting
tags: [ui, chat]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# Agent transparency UX

## Brief

The tutor is an agent looping over tools. Today its inner work — thinking
blocks, tool calls, and sub-agent activity — flashes by too fast to read, gets
silently dropped, or hides behind developer-facing names. This feature makes the
agent legible: the user can see what it's doing, why, and at a pace they can
follow. Three concerns share one surface (the chat thread) and one root cause
(streaming UX that prioritizes throughput over comprehension), so they're
designed together.

**Concern 1 — Stream pacing for thinking and tool calls.** Two contributing
factors:

1. `packages/ui/src/hooks/use-streamed-send.ts` has no handler for
   `event.type === "thinking"`. Thinking content arrives off the engine stream
   and is silently dropped — only the `thinking` boolean (toggled at stream
   start and around `tool_result`) drives `<ThinkingIndicator />`. The model's
   actual reasoning text never renders.
2. `<ToolInterstitial>` (`packages/ui/src/components/tool-interstitial.tsx`)
   transitions `in_flight → settled` instantly. A fast tool can flash in and
   out before the user reads it. No minimum display time, no easing, and the
   auto-scroll on `messageCount` change races past the interstitial.

Likely shape of the fix: add a `thinking` event branch in `use-streamed-send`
that surfaces a reasoning summary (truncated or collapsible), add a
hold-time / min-visible-ms to tool interstitials, and pair with a non-smooth or
scroll-only-when-near-bottom heuristic so users can pause to read mid-stream.

**Concern 2 — Sub-agent activity as a first-class UX concept.** Currently the
explorer (bootstrap mode's sub-agent) runs and shows a single activity-rail
line; the user can't see what it's actually doing turn-by-turn. Possible
directions: an inline sub-agent stream rendered into the chat thread as a
collapsed turn block; a dedicated sub-agent surface with its own tab; some
formalization of the general "sub-agent / Task agent" pattern (similar to
Claude Code's Task agents). Design pass should pick one.

**Concern 3 — Rename "bootstrap" and "explore" to student-facing names.**
Developer terminology leaked into the student UX. Concrete renames:
- "Bootstrap" mode → "Course creator" / "Set up a course" / "Plan a course"
  (design pass to choose).
- The explorer sub-agent — a name that describes what it does for the user,
  not for the developer.

Touch points: mode names in the mode registry, mode-fragment files, button
copy ("Open bootstrap mode" → "Plan a course"), tab titles, ROADMAP / SPEC
references that surface to the user. SPEC.md and VISION.md keep "bootstrap"
internally (architectural term); UI strings shift to student-facing names.

## Scope notes

These three are deeply intertwined: surfacing sub-agent activity is meaningless
if the underlying stream pacing is unreadable, and renaming the explorer makes
sense as part of formalizing the sub-agent surface. The design phase should
sequence them — likely (1) stream pacing first because it's a foundation for
the others; (2) sub-agent surface design (which probably extends the chat
thread, not adds a tab); (3) the rename, which is a copy/registry change that
lands cleanly after the new surface exists. Three child stories with a
linear `depends_on` chain is the likely shape.

Tied to existing patterns: `activity-rail-producer`, `tab-body-isolation`,
`async-generator-event-stream`, `sdk-event-mapping`.

Origins: `.work/backlog/idea-chat-stream-pacing-thinking-toolcalls.md`,
`.work/backlog/idea-sub-agent-activity-as-core-concept.md`,
`.work/backlog/idea-rename-bootstrap-and-explore.md`.

<!-- Design and Implementation Notes accumulate here as work progresses. -->
