---
id: refactor-ipc-server-extract-domain-channels-step-2-medium-domains
kind: story
stage: implementing
tags: [refactor]
parent: refactor-ipc-server-extract-domain-channels
depends_on: [refactor-ipc-server-extract-domain-channels-step-1-small-domains]
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 2: Extract 8 medium domain channels from ipc-server.ts

## Brief

Mirror of Step 1, applied to the next batch of 8 medium-sized domains.

## Domains to extract (this step)

- `memory` → new `memory-channel.ts` **(includes streaming `praxis.memory.episodic.start` + `.cancel` — already uses `registerGeneratorStream` inline)**
- `notes` → new `notes-channel.ts`
- `config` → new `config-channel.ts`
- `sketches` → new `sketches-channel.ts`
- `tabs` → new `tabs-channel.ts`
- `conceptMaps` → new `concept-maps-channel.ts`
- `assignments` → new `assignments-channel.ts`
- `flashcards` → new `flashcards-channel.ts`

## Files

- NEW: 8 channel files
- `packages/desktop/electron/main/ipc-server.ts`

## Dep readiness check

`depends_on: [refactor-ipc-server-extract-domain-channels-step-1-small-domains]`. Verify before starting:

```bash
grep '^stage:' /home/nathan/dev/praxis/.work/active/stories/refactor-ipc-server-extract-domain-channels-step-1-small-domains.md 2>/dev/null \
  || grep '^stage:' /home/nathan/dev/praxis/.work/archive/refactor-ipc-server-extract-domain-channels-step-1-small-domains.md
```

Expected: `stage: review` or `done`. Else note and return.

## Approach

Same as Step 1. Per domain:
1. Grep for the domain's handlers in ipc-server.ts
2. Create `<domain>-channel.ts` with `register<Domain>Handlers(services, log)` (or with `webContentsGetter, activeAbortControllers` if streaming)
3. Move handlers verbatim
4. Delete inline registrations
5. Add register call in ipc-server.ts wiring

## Special case: memory channel (streaming)

The `memory-channel.ts` signature must include `webContentsGetter` and `activeAbortControllers` because `praxis.memory.episodic.start` is a streaming handler that uses `registerGeneratorStream`. Signature:

```ts
export function registerMemoryHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void
```

Mirror the pattern from `activity-channel.ts` (which also has both streaming + non-streaming endpoints).

The `getStudentId` helper used inside `registerGeneratorStream`'s iterate callback in the memory.episodic block: since this lives inside `registerIpcHandlers`'s closure today, the extracted channel can't access it. Solutions:
- Pass `services` through and recompute: `const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;` inside the iterate
- Or accept a `getStudentId` function parameter passed by ipc-server.ts

Recommend the first (inline) — keeps the channel module self-contained.

## Reference channels

Same as Step 1. Plus: `quick-check-channel.ts` for mixed streaming + non-streaming.

## Verification

Same as Step 1. Critical to verify the memory.episodic streaming path:
- `pnpm vitest run packages/desktop/electron/main/__tests__/streaming-channel-error-redaction.test.ts`
- `pnpm vitest run packages/desktop/electron/main/__tests__/ipc-server.cancel.test.ts`
- `pnpm vitest run packages/desktop/electron/main/__tests__/memory-channel-envelope.test.ts` (if exists)

## Acceptance criteria

- [ ] 8 new channel files created
- [ ] All `handle/on("praxis.{memory,notes,config,sketches,tabs,conceptMaps,assignments,flashcards}.*")` registrations moved OUT of ipc-server.ts
- [ ] `ipc-server.ts` LoC drops by ~250 from end-of-step-1
- [ ] 8 `register<Domain>Handlers(...)` calls added to ipc-server.ts wiring block
- [ ] Memory streaming + envelope tests pass unmodified
- [ ] Typecheck/lint/test green (baseline preserved)
- [ ] No wire-format change

## Risk

**Low-Medium** — memory's streaming nature is the only added complexity over step 1.

## Rollback

`git revert <commit>` — clean.
