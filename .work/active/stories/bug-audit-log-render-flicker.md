---
id: bug-audit-log-render-flicker
kind: story
stage: drafting
tags: [bug, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-17
---

# Audit log view flickers in a tight render loop

## Brief

The audit log view flickers visibly, as if it's re-rendering in a tight loop — likely a React effect/state cycle where a subscription update triggers a state change that re-subscribes, or a `useEffect` whose deps include a freshly-constructed object/array each render. Worth investigating the audit-log component's subscription/data-loading path (`useResource`? `subscriber-fanout-stream`? polling?) and stabilizing identities (`useMemo`, `useCallback`, or moving the stream subscription outside the render path) so the list paints once per real change instead of continuously.

## Suspected area

The audit log surface in `packages/ui/src/` — check for unstable dep arrays in `useEffect`/`useResource`, fresh-object dependencies, or a subscriber that triggers state changes on every event.

## Acceptance criteria

- The audit log view paints once per real audit-event change (no continuous re-render).
- Subscription identity is stable across renders.
- A regression test or render-count assertion pins the stable-paint behavior.
