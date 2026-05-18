---
id: feature-ipc-envelope-validation-coverage
kind: feature
stage: drafting
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
