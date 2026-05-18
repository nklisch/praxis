---
id: wire-logger-into-quick-check-service
kind: story
stage: review
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Wire production logger into QuickCheckServiceImpl

## Brief

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

## Implementation plan

Update the production wiring (likely
`packages/desktop/electron/main/services.ts`, search for `new
QuickCheckServiceImpl`) to pass the appropriate child logger:

```ts
new QuickCheckServiceImpl(log.child({ component: "quick-check-service" }))
```

1. Find every `new QuickCheckServiceImpl(...)` call site.
2. Thread a real Logger through from the wiring.
3. Verify `quick-check-service.listener_threw` appears in real logs when a
   synthetic throwing listener is added to a smoke test (optional).

Trivial change. Story-sized.

## Implementation notes

**What landed:** Single-line wiring change in `packages/desktop/electron/main/services.ts:204` — `new QuickCheckServiceImpl()` → `new QuickCheckServiceImpl(log.child({ component: "quick-check-service" }))`. Uses the same `child({ component: "..." })` pattern already present in the file (e.g. `SubAgentRegistryImpl` at line 198). `log` was already in scope.

**Grep audit:** `grep -rn "new QuickCheckServiceImpl" packages/` confirmed exactly one production call site (now fixed) and seven test call sites in `quick-check-service-structured.test.ts` (all legitimately left as no-arg, using the noop-logger fallback — correct for unit tests).

**Verification:**
- `pnpm --filter @praxis/desktop build` — pass
- `pnpm --filter @praxis/desktop typecheck` — pre-existing unrelated error only (`session-service.ts(42,51) TS2345`, noted in story as expected)
- `pnpm lint` — pre-existing failures only (530 errors unrelated to this change)
- `pnpm --filter @praxis/core test` — 1060 tests passed (86 test files)
- `pnpm --filter @praxis/desktop test` — pre-existing failure (missing `packages/desktop/tests/` directory, unrelated)

**Optional smoke test:** Deferred. This is a pure wiring change; the logger infrastructure was already proven in prior refactor. Adding a throwing-listener test would verify the warning path but is not required for correctness — the `notifyListeners` implementation already has test coverage in the structured tests.
