---
id: refactor-ipc-server-extract-domain-channels-step-1-small-domains
kind: story
stage: implementing
tags: [refactor]
parent: refactor-ipc-server-extract-domain-channels
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 1: Extract 7 small/medium domain channels from ipc-server.ts

## Brief

Extract 7 domains from `packages/desktop/electron/main/ipc-server.ts` into
their own `*-channel.ts` modules. Mirror the established pattern from
existing channel files (`activity-channel.ts`, `recommendations-channel.ts`,
`quick-check-channel.ts`).

## Domains to extract (this step)

- `auth` → new `auth-channel.ts` (likely just `praxis.auth.claude.status`)
- `shell` → new `shell-channel.ts`
- `update` → new `update-channel.ts`
- `lock` → new `lock-channel.ts`
- `library` → new `library-channel.ts`
- `documents` → new `documents-channel.ts`
- `packs` → new `packs-channel.ts`

## Files

- NEW: `packages/desktop/electron/main/{auth,shell,update,lock,library,documents,packs}-channel.ts`
- `packages/desktop/electron/main/ipc-server.ts` (remove inline registrations + add 7 register calls)

## Approach (per domain)

1. **Grep ipc-server.ts** for all `handle("praxis.<domain>.*"`/`on("praxis.<domain>.*"` lines + their immediate handler bodies.
2. **Create the new channel file** `<domain>-channel.ts` with this skeleton:
   ```ts
   import type { Logger } from "@praxis/core/types";
   import { createIpcHelpers } from "./ipc-helpers.js";
   import type { Services } from "./services.js";
   // ...other imports as the handlers need them (z, brandId, handleEnvelope, etc.)

   export function register<Domain>Handlers(services: Services, log: Logger): void {
     const { handle } = createIpcHelpers(log);
     // (or `const { handle, on } = ...` if needed)

     // Each extracted handler, verbatim
     handle("praxis.<domain>.<action>", handleEnvelope(...));
     // ...
   }
   ```
3. **Move** each handler verbatim (preserve all envelope wrapping, Zod
   schemas, brandId casts, service dispatches).
4. **Delete** the inline registrations from ipc-server.ts.
5. **Add** `register<Domain>Handlers(services, log);` to the wiring block in
   `registerIpcHandlers`.
6. **If the domain has streaming handlers** (none of the 7 in this step do,
   but verify), preserve the `webContentsGetter` and
   `activeAbortControllers` arguments in the register signature.
7. **Preserve `removeAllListeners` cleanup** at the bottom of ipc-server.ts
   if it references this domain's channels.

## Reference channels (mirror these exactly)

- `packages/desktop/electron/main/citations-channel.ts` — non-streaming with `handleEnvelope`
- `packages/desktop/electron/main/recommendations-channel.ts` — non-streaming
- `packages/desktop/electron/main/activity-channel.ts` — has both streaming + non-streaming endpoints (post step-1 of stream-handler refactor)

## Shared schemas

If a Zod schema is currently defined at the top of ipc-server.ts and used
by multiple domain handlers (e.g., `courseIdSchema`), move it to the
domain file where it's primarily used. If it's used by more than one
domain after extraction, leave it in ipc-server.ts (or move to a shared
`validation-schemas.ts` if there's a clear cluster — judgment call,
document in implementation notes).

`getStudentId` is a closure inside `registerIpcHandlers` (from the
`refactor-extract-default-student-id-helper` story). The extracted channel
files can't access it directly — each extracted handler that needs the
student id should inline the brand cast:
```ts
const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
```

That's a temporary regression of the helper's reach until a future
follow-up extracts a shared `student-id.ts` helper. Note in
implementation notes.

## Verification

```bash
pnpm --filter @praxis/desktop typecheck
pnpm --filter @praxis/desktop test  # especially *-channel-envelope.test.ts, ipc-server.envelope-migration.test.ts
pnpm biome check packages/desktop/electron/main/
```

Pre-existing baseline: 3 UI typecheck errors, ~524 `.mockups/**` lint debt,
one flaky test. Treat as baseline.

## Acceptance criteria

- [ ] 7 new channel files created
- [ ] All `handle("praxis.{auth,shell,update,lock,library,documents,packs}.*")` registrations moved OUT of ipc-server.ts
- [ ] `ipc-server.ts` LoC drops by ~150
- [ ] 7 `register<Domain>Handlers(services, log)` calls added to ipc-server.ts wiring block
- [ ] Typecheck/lint/test green (baseline preserved)
- [ ] No wire-format change (channel names + envelope shapes unchanged)
- [ ] All existing channel-envelope tests pass unmodified

## Risk

**Low** — pure mechanical extraction; pattern established by 7 already-extracted channels.

## Rollback

`git revert <commit>` — clean.

## Design-flaw escape hatch

If a domain has handlers that share state in a way that's hard to thread
through (e.g., a closure over a per-`registerIpcHandlers` local variable),
flag it and consider passing the state as an additional parameter to the
register function. If the design genuinely doesn't work, append `## Implementation discovery`, set stage back to `drafting`, commit `revisit: ...`.
