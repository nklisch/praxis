---
id: idea-wire-logger-into-quick-check-service
kind: idea
tags: [refactor]
created: 2026-05-18
---

# Wire production logger into QuickCheckServiceImpl

After `refactor-subscriber-registry-base-step-1-notify-listeners-helper`
(commit `1df6ce0`), `QuickCheckServiceImpl` gained an optional `log?: Logger`
constructor parameter:

```ts
constructor(log?: Logger) {
  this.log = log ?? NOOP_LOGGER;  // module-local noop fallback
}
```

Existing call sites (`new QuickCheckServiceImpl()`) still work but get the
noop logger — meaning `notifyListeners` warnings on listener throw are
swallowed in production, same as before.

To get the observability win the refactor enables, update the production
wiring (likely `packages/desktop/electron/main/services.ts`, search for
`new QuickCheckServiceImpl`) to pass the appropriate child logger:

```ts
new QuickCheckServiceImpl(log.child({ component: "quick-check-service" }))
```

Trivial change. Story-sized.

Scope a story when convenient:
1. Find every `new QuickCheckServiceImpl(...)` call site
2. Thread a real Logger through from the wiring
3. Verify `quick-check-service.listener_threw` appears in real logs when
   a synthetic throwing listener is added to a smoke test (optional)
