---
id: epic-ui-rendering-stability
kind: epic
stage: drafting
tags: [ui, bug]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# UI rendering stability — kill the flickers, ghosts, and broken layouts

## Brief

After the v0.1.1 ship, four UI bugs surfaced that share a common shape:
**components rendering incorrectly because of state-machine or
re-render-cycle bugs, not because of missing features**. The documents
sidebar flashes between library and loading on every dependency change.
The question card stays on screen after the student submits an answer
instead of retiring. Toggling the sub-agents panel leaves dead vertical
space. The audit log re-renders in a tight loop, presumably from an
unstable `useEffect` dep or a re-subscribing stream.

None of these are deep architecture issues — they're React-state hygiene
bugs that cluster naturally: identify-the-bad-state-cycle, stabilize-the-
dep, or fix-the-final-height. Bundling them gives us one design pass on
"how do we audit a component for re-render cycles" and applies it four
times.

## Scope absorbed from backlog

All four UI rendering bugs in `.work/backlog/`:

- `bug-chat-documents-sidebar-flicker` — sidebar flashes between library
  view and a loading state during chat; loading boolean likely flipping
  back to true on every dep change instead of only on initial fetch.
- `bug-question-card-persists-after-answer` — inline quick-check card
  remains visible after answer submission instead of collapsing /
  retiring. State-machine probably missing the answered transition.
- `bug-sub-agents-panel-collapse` — sub-agents panel doesn't reclaim
  vertical space when hidden; likely a flex/grid rule keyed on mount
  rather than visibility, or a `display:none` vs unmount mismatch.
- `idea-audit-log-render-flicker` — audit log re-renders in a tight loop;
  classic `useEffect` deps include freshly-constructed object/array each
  render, or a subscription update triggers re-subscribe.

## Anchors (current implementation)

- Documents sidebar — `packages/ui/src/components/` (chat-scoped sidebar
  variant; probably uses `useDerivedScope` or `useResource`)
- Question card — `packages/ui/src/components/` (inline assessment / quick-check
  card; reads from session state and tool-result events)
- Sub-agents panel — `packages/ui/src/components/` (renders the
  `subscriber-fanout-stream` from `SubAgentRegistry`)
- Audit log — `packages/ui/src/components/` (subscribes to audit events;
  likely also subscriber-fanout-stream shape)
- Patterns to consult: `use-resource-hook`, `subscriber-fanout-stream`,
  `tab-body-isolation` (display:none vs unmount idiom)

## Why now

Three of the four are user-visible distractions on the primary tutor
surface — flicker erodes trust faster than missing features do. The
fourth (audit log) is a developer-experience drag because the panel
becomes unreadable during debugging. None of them is blocking, but they
all live in the same hygiene category and any of them in isolation feels
too small to justify an epic-design pass. Bundled, they justify one.

## Decomposition direction (for epic-design)

Likely flattens to 4 child stories (one per bug) under the epic, since
each is a discrete component fix. But epic-design should look for shared
infrastructure:

- Is there an `audit-component-for-rerender-cycles` checklist worth
  writing as a skill / pattern? (Subscription identity stability,
  useEffect dep memoization, display:none vs unmount choice.)
- Are any of these symptoms of a deeper pattern in our
  `subscriber-fanout-stream` consumers? If so, the fix may need to
  land in the shared hook rather than per-component.

## Decomposition risks

- **The audit-log flicker may NOT be a tight render loop** — could be
  many real updates from a chatty stream, in which case the fix is
  upstream throttling rather than identity stabilization. Reproduce
  with React Profiler before committing to a framing.
- **Sub-agents panel collapse might need a layout refactor** — if the
  chat workspace uses CSS grid with named track heights, the fix may be
  more invasive than expected. Surface the layout shape during design.
- **Question card state machine may be entangled with grade events** —
  the "answered" transition might depend on the grade tool's `ok: true`
  result arriving via the engine stream, not on the answer-submit
  event. Pin the trigger source first.
