---
id: epic-ui-rendering-stability
kind: epic
stage: implementing
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

## Decomposition

Split by bug-shape pattern, not by code area. The four bugs cleanly
split into "re-render loops where the data didn't actually change"
(sidebar flicker, audit log flicker) and "the component reached the
wrong final state" (question card stays visible after answer, sub-
agents panel doesn't reclaim space). Each pair shares a diagnostic
playbook: for loop flickers, profile and stabilize identity; for state
transitions, identify the missing terminal-state event or layout-
contract bug. Two features over four was chosen because each
individual bug is 1–3 implementation units — four solo features would
have spent more on scope overhead than on fixes. Independent — runs in
one wave.

Important update from anchor verification: **the audit log surface is
a one-shot fetch via `useConfiguratorActions`, NOT a `subscriber-
fanout-stream` consumer** (contrary to the epic body's initial sketch).
This refocuses that bug onto useEffect-dep stability rather than
subscription churn.

### Child features

- `epic-ui-rendering-stability-loop-flickers` — documents sidebar
  flicker + audit log re-render loop — depends on: `[]`
- `epic-ui-rendering-stability-state-transitions` — question card
  persists after answer + sub-agents panel collapse — depends on: `[]`

### Decomposition risks

- **The epic may be on the small side for two features** — total
  ~8 implementation units across the four bugs. If feature-design
  finds the bugs collapse further (e.g., one shared `useResource`
  pattern fix repairs both flickers), the second feature may shrink
  to 2-3 units. That's acceptable — the win is parallel scheduling,
  not unit count.
- **The audit-log flicker may not be a `useEffect`-dep issue at all**
  — could be the configurator-actions hook re-fetching on a parent
  re-render, in which case the fix is in the hook, not the AuditTab.
  Feature-design must profile with React Profiler before committing
  to a framing.
- **Sub-agents panel collapse may require a layout refactor** — if
  the chat workspace uses CSS grid with named track heights, the fix
  is more invasive than a visibility toggle. Feature-design needs to
  surface the layout container's contract.
- **Question card state machine may be entangled with the grade tool
  event flow** — the "answered" transition probably triggers from a
  grade tool result on the engine stream rather than from a local
  submit handler. Feature-design must pin the trigger source before
  designing the transition.
