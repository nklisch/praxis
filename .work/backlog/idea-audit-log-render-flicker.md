---
id: idea-audit-log-render-flicker
created: 2026-05-13
tags: [bug]
---

The audit log view flickers visibly, as if it's re-rendering in a tight loop — likely a React effect/state cycle where a subscription update triggers a state change that re-subscribes, or a `useEffect` whose deps include a freshly-constructed object/array each render. Worth investigating the audit-log component's subscription/data-loading path (useResource? subscriber-fanout-stream? polling?) and stabilizing identities (`useMemo`, `useCallback`, or moving the stream subscription outside the render path) so the list paints once per real change instead of continuously.
