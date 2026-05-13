---
id: epic-ui-rendering-stability-state-transitions
kind: feature
stage: drafting
tags: [ui, bug]
parent: epic-ui-rendering-stability
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# State transitions — question-card retirement and sub-agents panel collapse

## Brief

Two bugs both land on "the component is showing the wrong final state."
The inline quick-check question card remains visible after the student
submits an answer, instead of retiring (collapse to a compact summary
row or disappear). The expected resolved-state event — likely a
`gradeQuestion` tool result or an episodic write of kind
`question-answered` — isn't reaching the card's state machine, or the
machine doesn't have an answered branch. Separately, the sub-agents
panel doesn't collapse the layout when toggled hidden: the panel's
allocated vertical space stays reserved. Either the flex/grid sizing
rule is keyed on mount instead of visibility, or the toggle is
`display:none`-ing without telling the parent container to redistribute
the space.

This feature bundles both because they share the diagnostic shape —
identify the missing or incorrect terminal state, decide whether the
fix is in the component's local state machine, in the parent's layout
contract, or in the dispatch path that should be sending the
state-change event — and because both are small (1–2 implementation
units each) but worth one consolidated design pass on "what does
'finished / hidden' actually mean for these surfaces."

## Epic context

- Parent epic: `epic-ui-rendering-stability`
- Position in epic: paired with `…-loop-flickers`. Independent — runs
  in parallel.

## Scope absorbed from backlog

- `bug-question-card-persists-after-answer` — quick-check card stays
  visible after answer submit; needs a resolved-state transition.
- `bug-sub-agents-panel-collapse` — panel's vertical space doesn't
  collapse when hidden; likely a flex/grid rule keyed on mount, or a
  `display:none`-vs-unmount mismatch.

## Foundation references

- `docs/ARCHITECTURE.md` — quick-check / assessment flow, sub-agent
  transparency contract
- `CLAUDE.md` — patterns `tab-body-isolation` (display:none vs unmount
  idiom), `subscriber-fanout-stream` (sub-agent panel data source)

## Anchors (current implementation)

- Quick-check card —
  `packages/ui/src/components/QuestionCard.tsx` (or equivalent;
  search for the inline assessment card)
- Question card grade / answered event source — the tool that grades
  the question is in `packages/tools/src/runtime/`; episodic events
  flow through the engine session loop
- Sub-agents panel —
  `packages/ui/src/components/SubAgentBlock.tsx` (or similar) plus the
  parent container that allocates its vertical space (likely a chat
  workspace layout component)
- Sub-agent toggle —
  search for `subAgentsVisible` or `showSubAgents` state in the chat
  workspace
- Tab-body-isolation pattern reference for the display:none vs.
  unmount design call
