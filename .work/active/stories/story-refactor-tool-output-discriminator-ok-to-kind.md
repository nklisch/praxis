---
id: story-refactor-tool-output-discriminator-ok-to-kind
kind: story
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Standardize 4 outlier tool-output discriminators (`"ok"` → `"kind"`)

## Brief
Praxis convention (CLAUDE.md → Discriminated unions): use `z.discriminatedUnion("kind", [...])`
for stored / transmitted domain objects. 18 tool/output schemas in the codebase follow
this; 4 outliers use `discriminatedUnion("ok", ...)` instead. This is a
consistency-only refactor.

## Sites (verified by grep)
- `packages/tools/src/course/confirm-draft.ts:8`
- `packages/tools/src/course/draft-add-unit.ts:36`
- `packages/tools/src/course/draft-set-assessment-plan.ts:10`
- `packages/tools/src/course/start-drafting.ts:65`

## Current shape (example: `confirm-draft.ts`)
```ts
const OutputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), courseId: z.string(), ... }),
  z.object({ ok: z.literal(false), issues: z.array(...) }),
]);
```

## Target shape
Add a `kind` discriminator alongside the existing `ok` boolean (keeping `ok` lets
existing consumers branch on it without churn):
```ts
const OutputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("success"), ok: z.literal(true), courseId: z.string(), ... }),
  z.object({ kind: z.literal("error"), ok: z.literal(false), issues: z.array(...) }),
]);
```

Handlers that build these outputs need `kind: "success"` / `kind: "error"` in their
return objects. Consumers reading `result.ok` keep working.

## Value tier: Low
This is bureaucratic conformance — `discriminatedUnion("ok")` works fine. The win is
"every tool output now shares one shape convention" and "grep for `discriminatedUnion`
returns one form". Drain only when there's budget for hygiene work.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` green
- All 4 schemas use `discriminatedUnion("kind", ...)`
- All handler return sites updated to include `kind: "success" | "error"`
- Consumers in `course-create-service.ts` and the drafter tool dispatch keep working
  (no consumer-side changes required if they read `.ok` only)
