---
id: refactor-ipc-server-extract-domain-channels-step-1-small-domains
kind: story
stage: done
tags: [refactor]
parent: refactor-ipc-server-extract-domain-channels
depends_on: []
release_binding: v0.1.3
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

## Implementation notes

### Per-domain extraction summary

| Domain | File | Handlers moved |
|---|---|---|
| `auth` | `auth-channel.ts` | 3 (`praxis.auth.claude.status`, `.login.start` stream, `.login.cancel`) |
| `shell` | `shell-channel.ts` | 1 (`praxis.shell.openExternal`) |
| `update` | `update-channel.ts` | 1 (`praxis.update.checkLatest`) |
| `lock` | `lock-channel.ts` | 6 (`isSet`, `isUnlocked`, `setLockCode`, `unlock`, `lock`, `clearLock`) |
| `library` | `library-channel.ts` | 1 (`praxis.library.search`) |
| `documents` | `documents-channel.ts` | 4 (`list`, `get`, `delete`, `pageImage`) |
| `packs` | `packs-channel.ts` | 3 (`listAvailable`, `listImported`, `import`) |

**Total: 19 handlers moved** across 7 new files.

### `getStudentId` inline regression

- `library-channel.ts`: 1 occurrence inlines `brandId<"StudentId">(services.getDefaultStudentId()) as StudentId`
- All other extracted domains don't use `studentId`
- Future cleanup: a shared `student-id.ts` helper (or exporting `getStudentId` from ipc-server.ts) would clean this up

### Shared schema duplications

None. The `librarySearchSchema` was local to the library block and moved cleanly into `library-channel.ts`. The `pageImageSchema` was local to the documents block and moved into `documents-channel.ts`. No shared schemas duplicated.

### Auth domain note

The `auth` channel has a manual streaming handler (`praxis.auth.claude.login.start`) that predates the `registerGeneratorStream` helper (it uses a bespoke `for await` push loop). The handler was moved verbatim. `registerAuthHandlers` accepts `webContentsGetter` and `activeAbortControllers` because of this streaming endpoint.

### Final ipc-server.ts LoC

- Before: 1996 LoC
- After: 1811 LoC
- Reduction: 185 lines

### Baseline confirmation

- 3 pre-existing UI typecheck errors (chat-tab-body.tsx, chat.tsx, notes-list.tsx) — unchanged
- Pre-existing biome suppression warning in ipc-server.ts (`suppressions/unused` at the `lessonAssessments` handler) — unchanged
- All 31 electron/main test files (493 tests) pass unmodified
- All critical tests pass: `streaming-channel-error-redaction`, `ipc-server.envelope-migration`, `ipc-server.cancel`, `misc-and-domain-channel-envelope`

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- The `auth` channel's manual streaming handler (`praxis.auth.claude.login.start`) was moved verbatim — pre-dates the `registerGeneratorStream` helper. A future follow-up could migrate it to the helper for consistency. Not blocking; documented in the agent's notes.
- `getStudentId` regression in `library-channel.ts` (1 inline brand cast). A future shared `student-id.ts` helper would consolidate this — relevant especially once steps 2 + 3 add more `getStudentId` regressions.

**Notes**: Clean mechanical extraction. 7 new channel files, 19 handlers moved, 0 wire-format changes. All 493 electron/main tests pass unmodified, including the critical envelope + cancel + streaming tests. The pattern from already-extracted channels (citations, recommendations) was followed faithfully.
