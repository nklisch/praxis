---
id: epic-ui-rendering-stability-state-transitions-sub-agent-panel-unmount
kind: story
stage: done
tags: [ui, bug]
parent: epic-ui-rendering-stability-state-transitions
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Sub-agents panel unmounts chrome when hidden

## Scope

Fix `<SubAgentPanel>` so that when the user toggles the transcript
hidden, the surrounding panel chrome (border-top, top margin,
padding) disappears with it. Collapsed footprint shrinks to a single
toggle-button line so the bootstrap right-pane's flex column
redistributes vertical space naturally.

This story implements Unit 2 of
`epic-ui-rendering-stability-state-transitions` — see the parent
feature body for full design (component sketch, CSS notes,
acceptance criteria).

## Files touched

- `packages/ui/src/components/sub-agent-panel.tsx` — split into two
  render branches: collapsed = `<button>` only (no outer `.panel`
  div); expanded = full `.panel` chrome + `<SubAgentTranscript>`.
- `packages/ui/src/components/sub-agent-panel.module.css` — add
  `.toggleCollapsed` (no border, no top margin, flush in flow).
- `packages/ui/src/components/__tests__/sub-agent-panel.test.tsx`
  — NEW test file mirroring `sub-agent-block.test.tsx`'s shape.

## Out of scope

- Persisted visibility preference across sessions.
- Refactoring `<SubAgentBlock>` (the inline chat-thread variant) —
  different surface, different bug, not a "hide" concept.
- Subscriber re-mount semantics — `useSubAgent(parentCallId)`
  already handles snapshot-on-subscribe via
  `subscriber-fanout-stream`; the inner `<SubAgentTranscript>` is
  already lazy-mounted, so no additional caching is needed.

## Acceptance criteria

Reproduces parent feature Unit 2 acceptance criteria verbatim:

- [ ] When `parentCallId === null`, returns null (unchanged).
- [ ] When `parentCallId` set and `visible === false`: output is a
  single `<button>` with text "show sub-agent transcript" and
  `aria-expanded={false}`. No surrounding `<div>`, no border, no
  top margin.
- [ ] When `visible === true`: full `.panel` chrome and
  `<SubAgentTranscript>` rendered, with "hide sub-agent transcript"
  toggle and `aria-expanded={true}`.
- [ ] Toggle round-trip preserves intent across the component
  lifetime (local state; not persisted).
- [ ] New test file `__tests__/sub-agent-panel.test.tsx`:
  - Renders null when `parentCallId === null`.
  - Renders only the toggle (no `.panel` div) when collapsed.
  - Renders the transcript after clicking show.
  - Snapshot: collapsed DOM = `<button>` + text, nothing else.
- [ ] `pnpm --filter @praxis/ui test` green.
- [ ] `pnpm typecheck && pnpm lint` green.

## Implementation hint

The current implementation conditionally renders only the inner
`<SubAgentTranscript>` (`{visible && <SubAgentTranscript />}`) but
keeps the outer `<div className={styles.panel}>` always mounted
with `margin-top: 1rem; border-top: ...; padding-top: 0.5rem;` —
that's the reserved vertical space the bug describes. Move the
outer `<div>` inside the visible branch and use a stripped-down
class (no top spacing) for the collapsed-state toggle button.

Pattern reference: `subscriber-fanout-stream` — the
`SubAgentRegistry` is SSOT in core; the UI is a pure projection
that can mount/unmount freely without state loss. The pre-design
already locked the decision to unmount rather than `display:none`
because there's no local state worth preserving.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: 4 tests pass. Two-branch split is correct: collapsed = just the button (no outer div); expanded = full `.panel` chrome. CSS `.toggleCollapsed` strips top spacing as designed.
