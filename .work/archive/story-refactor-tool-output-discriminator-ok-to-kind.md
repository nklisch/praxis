---
id: story-refactor-tool-output-discriminator-ok-to-kind
kind: story
stage: done
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

## Implementation notes

4 files updated:

- `packages/tools/src/course/confirm-draft.ts` — schema changed to `discriminatedUnion("kind", [...])` with `kind: z.literal("success"/"error")` variants; handler return sites updated to include `kind: "success" as const` / `kind: "error" as const`. `ok` field retained for consumer back-compat.
- `packages/tools/src/course/draft-add-unit.ts` — same schema change. Handler previously delegated directly to `ctx.services.bootstrap.addUnit(...)` — wrapped delegation to map service result to the new shape. Early return for missing `draftId` also updated.
- `packages/tools/src/course/draft-set-assessment-plan.ts` — same schema change. Handler previously delegated to `ctx.services.bootstrap.setAssessmentPlan(...)` — wrapped delegation similarly.
- `packages/tools/src/course/start-drafting.ts` — same schema change. Handler explicitly built return objects; added `kind: "success"/"error" as const` to both return paths.

No consumer changes required. All consumers checked (`course-create-service.ts`, drafter, UI components) read `.ok` only — the new `kind` discriminator field is additive. `pnpm typecheck` and all 14 affected tests pass.

## Review

**Verdict: done**

Reviewed commit df42f8b. Mechanical change is correct and complete.

- All 4 `OutputSchema` declarations changed from `discriminatedUnion("ok", ...)` to `discriminatedUnion("kind", ...)` with `kind: z.literal("success"|"error")` added to each variant. The `ok` field is retained in all variants.
- All handler return sites updated to include `kind: "success" as const` / `kind: "error" as const` alongside the original `ok` field.
- `draft-add-unit.ts` and `draft-set-assessment-plan.ts`: direct delegation (previously `return ctx.services.bootstrap.addUnit(...)`) was correctly wrapped to map the service result to the new shape — neither a regression nor an unintended behavior change.
- No `discriminatedUnion("ok"` remains in the codebase.
- Consumers (`drafter.ts`, `course-create-service.ts`) read `.ok` only — confirmed no consumer changes needed.
- `pnpm typecheck`: green. `pnpm test`: 4769 tests pass. Lint errors are pre-existing, none in the changed files.

No blockers. No follow-ups.
