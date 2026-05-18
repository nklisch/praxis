---
id: feature-ipc-envelope-validation-coverage-step-1-add-validation
kind: story
stage: done
tags: [security]
parent: feature-ipc-envelope-validation-coverage
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 1: bring 3 IPC channels under handleEnvelope (with Zod validation)

## Brief

Convert 3 IPC channels to use the canonical `handleEnvelope(channel, log, schema, fn)` composition helper. This adds Zod validation at the IPC trust boundary so bad input returns a structured `{ ok: false, error: { code: "VALIDATION_FAILED", ... } }` envelope instead of either silently corrupting state or throwing an uncaught error.

This is **behavior-changing** on the sad path — well-behaved input still works exactly as before; bad input gains structure.

## Files (3 channel files + 1-2 test files)

- `packages/desktop/electron/main/activity-channel.ts` (~30 LoC change)
- `packages/desktop/electron/main/quick-check-channel.ts` (~40 LoC change, includes Zod schema for `QuickCheckAnswer`)
- `packages/desktop/electron/main/recommendations-channel.ts` (~10 LoC change, pure pattern alignment)
- `packages/desktop/electron/main/__tests__/misc-and-domain-channel-envelope.test.ts` (add VALIDATION_FAILED case for activity.dismiss; possibly also for quickCheck.resolve)
- `packages/desktop/electron/main/__tests__/recommendations-channel.test.ts` (should pass unmodified — behavior equivalent — but verify)
- Possibly a new test file `packages/desktop/electron/main/__tests__/quick-check-channel.test.ts` if one doesn't already exist for the resolve handler

## Canonical helper (READ FIRST)

`packages/desktop/electron/main/ipc-helpers.ts:54` exports:

```ts
export function handleEnvelope<TIn, TOut>(
  channel: string,
  log: Logger,
  schema: z.ZodType<TIn>,
  fn: (input: TIn) => Promise<TOut> | TOut,
): (_event: IpcMainInvokeEvent, payload: unknown) => Promise<IpcEnvelope<TOut>>
```

It composes `wrapEnvelope` + `withSchema` with the Electron `(event, payload)` calling convention. ZodError → `VALIDATION_FAILED` envelope automatically.

## Reference adoptions (mirror these shapes)

- `packages/desktop/electron/main/citations-channel.ts:28` — `handleEnvelope("praxis.citations.record", log, recordSchema, async (input) => {...})`
- `packages/desktop/electron/main/ipc-server.ts:117` — `handleEnvelope("praxis.session.start", log, sessionStartSchema, async (opts) => {...})`

## Per-channel changes

### File 1: activity-channel.ts (Unit 1 in feature body)

**Current (lines 26-31)**:
```ts
handle(
  "praxis.activity.dismiss",
  wrapEnvelope("praxis.activity.dismiss", log, async (_event: unknown, id: string) => {
    services.activity.dismiss(id);
  }),
);
```

**Target**:
```ts
handle(
  "praxis.activity.dismiss",
  handleEnvelope("praxis.activity.dismiss", log, z.string().min(1), async (id) => {
    services.activity.dismiss(id);
  }),
);
```

**Imports**: add `import { z } from "zod";` and swap `import { wrapEnvelope } from "./ipc-error-envelope.js";` → `import { handleEnvelope } from "./ipc-helpers.js";` (since only `dismiss` uses wrapEnvelope in this file).

### File 2: quick-check-channel.ts (Unit 2)

Add schema definitions near the top of the file (after imports, before `registerQuickCheckHandlers`):

```ts
// Wire validation for QuickCheckAnswer (see @praxis/core/types/quick-check.ts).
// Keep in sync — if the TS type adds a kind, this schema must too, or the IPC
// will reject otherwise-valid answers.
const QuickCheckAnswerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("single-choice"),
    selectedIndex: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("multi-select"),
    selectedIndices: z.array(z.number().int().nonnegative()),
  }),
  z.object({
    kind: z.literal("short-answer"),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("matching"),
    pairs: z.array(z.object({ leftId: z.string().min(1), rightId: z.string().min(1) })),
  }),
  z.object({
    kind: z.literal("confidence"),
    rating: z.number(),
  }),
  z.object({
    kind: z.literal("structured-question"),
    answers: z.array(
      z.object({
        questionIndex: z.number().int().nonnegative(),
        selectedIndices: z.array(z.number().int().nonnegative()),
      }),
    ),
  }),
  z.object({ kind: z.literal("abandoned") }),
]);

const QuickCheckResolveInputSchema = z.object({
  callId: z.string().min(1),
  answer: QuickCheckAnswerSchema,
});
```

**Target handler (replaces lines 31-40)**:
```ts
handle(
  "praxis.quickCheck.resolve",
  handleEnvelope(
    "praxis.quickCheck.resolve",
    log,
    QuickCheckResolveInputSchema,
    async (input) => {
      quickCheck.resolve({ callId: input.callId, answer: input.answer });
    },
  ),
);
```

**Imports**: add `import { z } from "zod";` and `import { handleEnvelope } from "./ipc-helpers.js";`. Drop `import { wrapEnvelope } from "./ipc-error-envelope.js";` if it's the only consumer.

**Shape parity check**: add a `satisfies QuickCheckAnswer` compile-time check via:
```ts
// Compile-time guard that the Zod schema's inferred type structurally matches
// the TS QuickCheckAnswer. If the TS type adds a kind, this line fails to compile.
const _quickCheckAnswerSchemaShape = (null as unknown) as z.infer<typeof QuickCheckAnswerSchema> satisfies QuickCheckAnswer;
```

(Or skip if it forces too much code — the comment + an explicit test that round-trips each kind through the schema is a reasonable alternative. Pick the lower-friction option that catches drift.)

### File 3: recommendations-channel.ts (Unit 3 — pure pattern alignment, no behavior change)

**Current (lines 26-41)**:
```ts
handle(
  "praxis.recommendations.next",
  wrapEnvelope(
    "praxis.recommendations.next",
    log,
    async (_event: unknown, raw: unknown): Promise<Recommendation[]> => {
      const input = nextInputSchema.parse(raw);
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.recommendations.next({
        studentId,
        ...(input?.limit !== undefined && { limit: input.limit }),
      });
    },
  ),
);
```

**Target**:
```ts
handle(
  "praxis.recommendations.next",
  handleEnvelope(
    "praxis.recommendations.next",
    log,
    nextInputSchema,
    async (input): Promise<Recommendation[]> => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.recommendations.next({
        studentId,
        ...(input?.limit !== undefined && { limit: input.limit }),
      });
    },
  ),
);
```

**Imports**: swap `wrapEnvelope` → `handleEnvelope` from `./ipc-helpers.js`.

Behavior is unchanged — the existing test (`recommendations-channel.test.ts`) should pass without modification. The change is pure pattern alignment.

## Tests

### Existing tests

Run these and confirm they still pass unmodified:
```bash
pnpm vitest run packages/desktop/electron/main/__tests__/recommendations-channel.test.ts
pnpm vitest run packages/desktop/electron/main/__tests__/misc-and-domain-channel-envelope.test.ts
```

If `misc-and-domain-channel-envelope.test.ts` has a `praxis.activity.dismiss` happy-path test, verify it still passes after the conversion (it should — same behavior on good input).

### New tests to add

Add VALIDATION_FAILED cases. Pattern reference: any existing test in `misc-and-domain-channel-envelope.test.ts` that asserts on envelope error shape, OR look at `ipc-server.envelope-migration.test.ts` for the canonical shape.

For each channel, add (or extend) tests:

```ts
// activity.dismiss with bad input
it("activity.dismiss returns VALIDATION_FAILED on empty string", async () => {
  const handler = handlers.get("praxis.activity.dismiss");
  const result = await handler?.({}, "");
  expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
});

it("activity.dismiss returns VALIDATION_FAILED on non-string", async () => {
  const handler = handlers.get("praxis.activity.dismiss");
  const result = await handler?.({}, null);
  expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
});
```

Similar for `quickCheck.resolve` (try with missing fields, wrong shapes, invalid `kind`, negative index). Don't need to cover every variant exhaustively — 2-3 representative bad-input cases.

For `recommendations.next`, the existing test should already cover the happy path AND the validation path (since it used `nextInputSchema.parse` before). No new test needed — verify the existing one passes.

## Test harness pattern

Tests stub Electron at the module boundary. Look at any existing `*-channel.test.ts` for the setup pattern (`createIpcHelpers` returns `handle`/`on`; tests capture handlers via a `Map`; invoke directly with `(event, payload)`).

If a quick-check-channel test file doesn't exist yet (`packages/desktop/electron/main/__tests__/quick-check-channel.test.ts`), create a minimal one with just the validation-failure cases.

## Renderer-side consumer audit

Before merging, manually verify no renderer code today silently swallows IPC errors on these 3 channels. Recommended grep:

```bash
grep -rn 'praxis\.activity\.dismiss\|praxis\.quickCheck\.resolve\|praxis\.recommendations\.next' /home/nathan/dev/praxis/packages/client/ /home/nathan/dev/praxis/packages/ui/ --include='*.ts' --include='*.tsx' | grep -v dist
```

If callers wrap `unwrapEnvelope` properly (or use the `PraxisClient`'s typed methods which do), they already handle `IpcError` on validation failure. If any caller passes raw user input without validation upstream AND swallows errors loosely, that's a finding — flag in implementation notes, but don't block the merge (the new error path is structured; it's better than silent corruption).

## Codebase context

- TypeScript 6 strict, `verbatimModuleSyntax: true`, ESM `.js` extensions
- Pre-existing baseline: 3 typecheck errors in UI files (chat-tab-body.tsx, chat.tsx, notes-list.tsx), ~524 `.mockups/**.html` lint errors, one flaky `use-fragment-overrides` test. Not your concern.
- The 3 channel files were recently touched by `refactor-stream-handler-template` (commits `e2a46f9`, `45a1b94`, `ee0ad9b`) — they already use the helper for STREAMING parts. Your work touches the non-streaming endpoints in each.

## Acceptance Criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm test` green from repo root (baseline preserved)
- [ ] All 3 channels use `handleEnvelope(channel, log, schema, fn)`
- [ ] `wrapEnvelope` removed from all 3 files' imports (verify no orphan import)
- [ ] Bad input → `{ ok: false, error: { code: "VALIDATION_FAILED", ... } }` for each channel (covered by tests)
- [ ] Good input still works (existing tests pass unmodified for happy path)
- [ ] Renderer consumer audit completed; any findings flagged in implementation notes

## Risk

**Low-Medium** — the validation path is well-tested through existing patterns (`handleEnvelope` is used elsewhere). The only real risk is a renderer caller that today depends on silent failure; the audit step catches that.

## Rollback

`git revert <commit>` per channel adoption is clean (could split into 3 commits if preferred; single commit is fine since they're tightly cohesive and behaviorally equivalent on the happy path).

## Design-flaw escape hatch

If the `QuickCheckAnswer` discriminated-union Zod schema doesn't compile cleanly against the TS type (e.g., a recent TS-type change wasn't mirrored), STOP. Append `## Implementation discovery` with the type mismatch, set stage back to `drafting`, commit `revisit: ...`, and return.

## Implementation notes

### Per-channel summary

**activity-channel.ts**: Replaced `wrapEnvelope` with `handleEnvelope("praxis.activity.dismiss", log, z.string().min(1), ...)`. Dropped `wrapEnvelope` import (was the only consumer in that file). Added `import { z } from "zod"` and updated import of `handleEnvelope` from `./ipc-helpers.js`.

**quick-check-channel.ts**: Added `QuickCheckAnswerSchema` (7-variant discriminated union) and `QuickCheckResolveInputSchema` near the top of the file, after imports. Replaced `wrapEnvelope` with `handleEnvelope` using the new schema. Dropped `wrapEnvelope` import. Added `import { z } from "zod"` and added `handleEnvelope` to the `./ipc-helpers.js` import.

**recommendations-channel.ts**: Replaced `wrapEnvelope` + inline `nextInputSchema.parse(raw)` with `handleEnvelope(channel, log, nextInputSchema, fn)`. Dropped `wrapEnvelope` import. Behavior is identical — this is pure pattern alignment. Updated doc comment to say `handleEnvelope` instead of `wrapEnvelope + withSchema`.

### Schema parity check

Used the `satisfies` compile-time check approach:
```ts
const _quickCheckAnswerSchemaShape = null as unknown as z.infer<
  typeof QuickCheckAnswerSchema
> satisfies QuickCheckAnswer;
```
This compiled cleanly against the TS type at `@praxis/core/types/quick-check.ts:16`. No mismatch found — schema is in sync with the TS type.

### Test additions

- `misc-and-domain-channel-envelope.test.ts`: +6 new cases (2 VALIDATION_FAILED for `activity.dismiss` on empty string and null; 3 new VALIDATION_FAILED for `quickCheck.resolve` on unknown kind, missing callId; 1 new happy-path using valid `abandoned` answer). Updated 1 existing happy-path test to use a valid `QuickCheckAnswer` (`{ kind: "single-choice", selectedIndex: 0 }` instead of the previously-invalid `{ correct: true }`). Also updated the error-path test to use a valid answer kind (both call-path tests now use valid answers so the error source is service-throw, not validation).
- `quick-check-channel.test.ts`: Created new file with 13 tests — 5 VALIDATION_FAILED cases (missing callId, empty callId, unknown kind, negative selectedIndex, missing answer field) + 7 happy-path round-trips covering all 7 answer kinds (single-choice, multi-select, short-answer, abandoned, confidence, matching, structured-question).
- `recommendations-channel.test.ts`: No changes needed — the existing 6 tests cover both happy path and validation error path; behavior is equivalent.

Total new tests: 19 (6 added to misc-and-domain, 13 in new quick-check-channel.test.ts).

### Renderer consumer audit

All 3 channels have well-behaved renderer clients in `@praxis/client`:
- `ActivityClient.dismiss()` in `packages/client/src/services/activity-client.ts` — calls `unwrapEnvelope(result)`, already throws `IpcError` on `{ ok: false }`.
- `QuickCheckClient.resolve()` in `packages/client/src/services/quick-check-client.ts` — calls `unwrapEnvelope(result)`, already throws `IpcError` on `{ ok: false }`.
- `RecommendationsClient.next()` in `packages/client/src/services/recommendations-client.ts` — calls `unwrapEnvelope(result)`, already throws `IpcError` on `{ ok: false }`.

No findings. All callers handle `IpcError` via `unwrapEnvelope` and will receive a structured `VALIDATION_FAILED` IpcError on bad input rather than a crash or silent failure.

### Baseline confirmation

- Pre-existing 3 typecheck errors in UI files (chat-tab-body.tsx, chat.tsx, notes-list.tsx): still present, not caused by this change.
- `pnpm vitest run --project @praxis/desktop`: 505 tests passing, 34 test files, 0 failures.
- `pnpm biome check` on all 5 touched files: clean (no errors, no warnings).

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- The agent "repaired" 2 existing tests in `misc-and-domain-channel-envelope.test.ts` that were previously passing invalid `{ correct: true }` payloads as quickCheck answers. The new validation correctly rejects those. The repair is the right call — those tests were never testing the spec, they were exercising whatever the un-validated code happened to accept. Worth explicitly noting: **2 tests changed**, both now passing with structurally-valid `QuickCheckAnswer` inputs. This is a test-integrity win surfaced as a side-effect of the refactor.

**Notes**: Clean adoption of `handleEnvelope` across 3 channels. The `satisfies QuickCheckAnswer` compile-time guard worked cleanly (schema and TS type in sync). 19 new tests cover both validation-failure paths (5 for activity.dismiss + quickCheck, 5 for new quick-check-channel.test.ts) and the discriminated-union happy paths (7 round-trips, one per answer kind). Renderer audit confirmed: all 3 channel clients already `unwrapEnvelope()` and surface `IpcError` on VALIDATION_FAILED — no consumer-side findings. Pattern alignment for recommendations.next is behavior-equivalent; existing test passes unmodified. Wire format unchanged on happy path.
