---
id: wire-logger-into-quick-check-service
kind: story
stage: done
tags: [refactor]
parent: null
depends_on: []
release_binding: v0.1.3
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

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- Component string `"quick-check-service"` (kebab-case) matches the pattern used elsewhere in this file (no change needed; flagging only because PascalCase variants exist nearby — kebab-case is the right call).

**Notes**: 4-line diff. `log.child({ component: ... })` follows the established pattern at `services.ts:198` (`SubAgentRegistryImpl`). Existing test coverage in `quick-check-service-structured.test.ts` exercises the listener-throw path with a recording logger spy, so the warning emission itself is verified there. The optional smoke test was correctly deferred — it would be an integration test, not a unit test, and adds no risk-reduction value.
