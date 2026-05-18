---
id: feature-ipc-envelope-validation-coverage
kind: feature
stage: implementing
tags: []
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Feature: bring all IPC channels under the envelope + withSchema validation pattern

## Brief

The `ipc-envelope-handler` pattern (documented at
`.claude/skills/patterns/ipc-envelope-handler.md`) standardizes mutating
and validating IPC channels behind
`wrapEnvelope(channel, log, withSchema(zod, fn))`. This ensures:

- Uniform `{ ok, value | error: { code, message, requestId } }` wire shape
- Consistent `VALIDATION_FAILED` error code on bad input
- One place to add observability (request id, log child)
- Clients reliably peel via `unwrapEnvelope` + catch `IpcError`

Discovery found three channels that **bypass** the validation layer:

1. **activity-channel.ts:27-32** — `praxis.activity.dismiss` accepts
   `(_event, id: string)` directly with no Zod validation; an empty
   string or oversized payload would reach the service.
2. **quick-check-channel.ts:70-79** — `praxis.quickCheck.resolve` accepts
   an unvalidated input object; the service trusts the field shapes.
3. **recommendations-channel.ts:26-41** — uses `wrapEnvelope` but
   inlines a manual `nextInputSchema.parse(raw)` call inside the handler
   instead of delegating to `withSchema`. Result: validation failures
   throw a ZodError that escapes the envelope shape and reaches the
   client as an unstructured error.

This is **NOT a pure refactor** — wrapping unvalidated channels with
Zod **changes wire behavior on bad input**:

- Before: bad input either reaches the service (silent corruption risk)
  or throws an uncaught error that breaks the renderer
- After: bad input is rejected at the boundary with
  `{ ok: false, error: { code: "VALIDATION_FAILED", … } }`

Renderer code that today silently relies on these channels accepting
loose input would start to see typed errors. Hence this carries a
`[refactor]`-adjacent tag set is INTENTIONALLY EMPTY — feature-design
should pick this up and verify the impact on renderer consumers before
implementing.

## Surface area

Channels to bring under envelope + withSchema:

- `packages/desktop/electron/main/activity-channel.ts:27-32`
  - Add `withSchema(z.string().min(1), fn)` for `praxis.activity.dismiss`
- `packages/desktop/electron/main/quick-check-channel.ts:70-79`
  - Define a `quickCheckResolveInputSchema` Zod schema and pass via
    `withSchema`
- `packages/desktop/electron/main/recommendations-channel.ts:26-41`
  - Replace the inline `nextInputSchema.parse(raw)` call with
    `wrapEnvelope(channel, log, withSchema(nextInputSchema, fn))`

Also: scan for any other channels that don't follow the canonical shape.
A possible audit grep:

```
grep -rn 'handle\|on' packages/desktop/electron/main/*-channel.ts \
  packages/desktop/electron/main/ipc-server.ts \
  | grep -v 'wrapEnvelope\|withSchema' | grep '"praxis\.'
```

## Why behavior-changing

Validation rejection at the boundary is observable behavior:

- Renderer callers will receive `IpcError` on bad input instead of
  whatever the channel previously did (often a silent corrupt write or
  an uncaught throw)
- Tests that exercise these channels with loose input may need to be
  tightened
- A renderer hook or component passing wrong-shaped input will see a
  predictable error, but if any such caller exists today and isn't
  caught by tests, this surfaces it

## Out of scope (split into separate refactor stories if useful)

- Extracting the validation schemas into a shared `validation-schemas.ts`
  module (refactor follow-up; not required here).
- Re-homing the channels themselves out of ipc-server.ts (covered by
  `refactor-ipc-server-extract-domain-channels`).

## Acceptance Criteria (drafting will refine)

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (envelope tests for the three channels updated to
      cover validation-failure path)
- [ ] Grep for `handle.*"praxis\.` outside `wrapEnvelope(withSchema(` and
      `_utils/` returns 0 results in the channel files
- [ ] Each newly-wrapped channel has a test verifying that bad input
      returns `{ ok: false, error: { code: "VALIDATION_FAILED" } }`
      (mirror existing envelope-test patterns)
- [ ] Renderer callers verified not to depend on the prior loose shape
      (manual audit per channel during design)

## Risk

**Medium** — wire behavior changes on bad input. The "happy path" is
unchanged; the "sad path" gains structure. Tests must cover both paths
for each channel touched, and a manual audit of renderer call sites is
recommended before merge.

## Rollback

`git revert <commit>` per channel adoption is clean. Recommend landing
one channel per commit so any consumer regression is isolated.

## Design decisions

- **Per-channel inline schemas vs centralized**: per-channel. Each schema is small (1-30 LoC), channel-specific, and has no cross-channel reuse. Centralizing would require a new module with no other consumers — over-engineering. Matches the existing `recommendations-channel.ts:21` pattern (`const nextInputSchema = z.object({...})` at top of file).
- **Where the QuickCheckAnswer Zod schema lives**: in the channel file (`quick-check-channel.ts`), NOT exported from `@praxis/core/types`. The TS type stays where it is; the Zod schema is wire-format validation at the IPC trust boundary. Mixing them risks Zod becoming a core runtime dependency.
- **Strictness of the QuickCheckAnswer schema**: mirrors the TS discriminated union exactly. Indices use `z.number().int().nonnegative()`. Strict bounds turn silently-corrupt input into observable `VALIDATION_FAILED` envelopes — that's the value the refactor unlocks.
- **`activity.dismiss` id schema**: `z.string().min(1)` matches the existing `assignmentInputSchema.assignmentId` pattern. No length cap (internal IPC, paranoid).
- **`recommendations.next` outer `.optional()`**: keep. Renderer can call with no payload; service defaults limit.

## Architectural choice

The codebase already has the canonical helper for this exact composition:
**`handleEnvelope(channel, log, schema, fn)`** at
`packages/desktop/electron/main/ipc-helpers.ts:54`. It composes
`wrapEnvelope` + `withSchema` with the Electron `(event, payload)` calling
convention (strips the event, forwards only payload to the schema, wraps
the whole thing in the envelope contract).

In use at multiple sites: `ipc-server.ts:117` (session.start),
`citations-channel.ts:28,48` (citations.record + others), the
`ipc-server.envelope-migration.test.ts` documents the full migration
catalog.

All 3 target channels switch to this helper. No new infrastructure
needed; just pattern adoption.

## Implementation Units

### Unit 1: `praxis.activity.dismiss` — add string-min-1 validation
**File**: `packages/desktop/electron/main/activity-channel.ts:26-31`
**Story**: `feature-ipc-envelope-validation-coverage-step-1-add-validation`

**Current**:
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

Add `import { z } from "zod";` and `import { handleEnvelope } from "./ipc-helpers.js";`. Drop the `wrapEnvelope` import if no other use remains in the file.

**Acceptance**:
- Bad input (`null`, `""`, non-string, missing arg) → `{ ok: false, error: { code: "VALIDATION_FAILED", ... } }`
- Good input (`"some-activity-id"`) → service `dismiss` invoked; envelope `{ ok: true, value: undefined }`

### Unit 2: `praxis.quickCheck.resolve` — add discriminated-union validation
**File**: `packages/desktop/electron/main/quick-check-channel.ts:31-40`
**Story**: `feature-ipc-envelope-validation-coverage-step-1-add-validation` (same story)

**Current**: handler accepts `input: { callId: string; answer: QuickCheckAnswer }` directly with no Zod validation.

**Target schema** (top of file, near imports):
```ts
const QuickCheckAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("single-choice"), selectedIndex: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("multi-select"), selectedIndices: z.array(z.number().int().nonnegative()) }),
  z.object({ kind: z.literal("short-answer"), text: z.string() }),
  z.object({
    kind: z.literal("matching"),
    pairs: z.array(z.object({ leftId: z.string().min(1), rightId: z.string().min(1) })),
  }),
  z.object({ kind: z.literal("confidence"), rating: z.number() }),
  z.object({
    kind: z.literal("structured-question"),
    answers: z.array(z.object({
      questionIndex: z.number().int().nonnegative(),
      selectedIndices: z.array(z.number().int().nonnegative()),
    })),
  }),
  z.object({ kind: z.literal("abandoned") }),
]);

const QuickCheckResolveInputSchema = z.object({
  callId: z.string().min(1),
  answer: QuickCheckAnswerSchema,
});
```

**Target handler**:
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

Add `import { z } from "zod";` and `import { handleEnvelope } from "./ipc-helpers.js";`. Drop the `wrapEnvelope` import.

**SSOT note**: the Zod schema mirrors `QuickCheckAnswer` from `@praxis/core/types/quick-check.ts:16`. If the TS type changes, this schema must update in lockstep. Add a comment above the schema: `// Wire validation for QuickCheckAnswer (see @praxis/core/types/quick-check.ts). Keep in sync.`

**Acceptance**:
- Bad input (missing `callId`, missing `answer`, `answer.kind` not in enum, `selectedIndex` negative) → VALIDATION_FAILED
- Good input for each of the 7 answer kinds → service `resolve` invoked correctly

### Unit 3: `praxis.recommendations.next` — switch inline `.parse` to `handleEnvelope`
**File**: `packages/desktop/electron/main/recommendations-channel.ts:26-41`
**Story**: `feature-ipc-envelope-validation-coverage-step-1-add-validation` (same story)

**Current**: uses `wrapEnvelope` + inlines `nextInputSchema.parse(raw)` inside the handler body. Functionally equivalent (ZodError → caught by wrapEnvelope → VALIDATION_FAILED) but pattern-inconsistent.

**Target**:
```ts
const nextInputSchema = z.object({ limit: z.number().int().positive().optional() }).optional();

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

Drop the `wrapEnvelope` import. Behavior is unchanged for the renderer — same VALIDATION_FAILED envelope on bad input — but the composition shape now matches the rest of the channels.

**Acceptance**:
- Existing recommendations-channel tests still pass unmodified (the behavior is equivalent)
- Code review shows the pattern matches `citations-channel.ts:28`, `ipc-server.ts:117`, etc.

## Implementation Order

1. Single story implements all 3 units. They're independent (different files), but small enough to batch.

## Testing

### Test files
- `packages/desktop/electron/main/__tests__/recommendations-channel.test.ts` — already exists; should still pass with no modification (behavior equivalent)
- `packages/desktop/electron/main/__tests__/misc-and-domain-channel-envelope.test.ts` — covers activity.dismiss; add VALIDATION_FAILED case for empty-string / non-string input
- New or existing: a quick-check-channel test for VALIDATION_FAILED on each shape of bad input

### Test patterns to follow
- `ipc-server.envelope-migration.test.ts` is the catalog of envelope-migration tests; mirror the validation-failure case shape (e.g., expect `{ ok: false, error: { code: "VALIDATION_FAILED", ... } }`)
- The `electron-ipc-test-harness` pattern (in `.claude/skills/patterns/`) describes the harness; tests stub electron at module boundary, capture handlers, invoke directly

## Risks

- **Renderer callers passing wrong-shaped input today get a different failure**: previously, bad input either silently corrupted state or threw an uncaught error; now it returns a structured VALIDATION_FAILED envelope. If any renderer code today swallows IPC errors loosely, it may start seeing validated rejection that it wasn't handling. Mitigation: the renderer-side `unwrapEnvelope` already throws `IpcError` on `{ ok: false }`, so well-behaved callers already handle this; manual audit during implementation of any consumer of these 3 channels to confirm.
- **QuickCheckAnswer schema drift**: the Zod schema and the TS type are duplicated by necessity (different layers). If the TS type changes and the Zod schema doesn't, the IPC will reject otherwise-valid answers. Mitigation: comment links the two, plus add a typecheck for "schema parses match the TS type" via a `z.infer<typeof QuickCheckAnswerSchema>` `satisfies QuickCheckAnswer` line that compile-checks shape parity (test file can hold this).
