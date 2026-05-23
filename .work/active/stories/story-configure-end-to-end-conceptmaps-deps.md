---
id: story-configure-end-to-end-conceptmaps-deps
kind: story
stage: implementing
tags: [tech-debt, typecheck, testing]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Configure end-to-end test missing conceptMaps dep

## Brief

`tests/configure-end-to-end.test.ts:197` fails typecheck with:

```
TS2741: Property 'conceptMaps' is missing in type
'{ db, log, artifacts, memory, configuratorId, studentId, promptCustomization }'
but required in type 'AuthoringServiceDeps'.
```

This was hidden behind the now-fixed session-service.ts baseline error
(`story-fix-session-service-exactoptional-baseline`, done) — typecheck
used to short-circuit before reaching this integration test. The failure
surfaced after that fix landed.

## Fix path

1. Open `tests/configure-end-to-end.test.ts:197` and inspect the
   `AuthoringServiceDeps` shape (likely in
   `packages/core/src/services/`).
2. Thread a `conceptMaps` service into the deps bag at line 197. Use the
   real service if the test exercises concept-map paths; use a stub fake
   if not (and prefer adding to `tests/helpers/mocks.ts` per the
   `shared-test-fake-factories` pattern if 3+ tests would benefit).
3. Confirm `pnpm typecheck` is clean and the test still passes.

If the test predates the `conceptMaps` field being added to
`AuthoringServiceDeps`, the setup just needs the missing key — no behavior
change required.
