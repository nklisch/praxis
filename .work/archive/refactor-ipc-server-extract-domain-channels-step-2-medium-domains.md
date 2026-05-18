---
id: refactor-ipc-server-extract-domain-channels-step-2-medium-domains
kind: story
stage: done
tags: [refactor]
parent: refactor-ipc-server-extract-domain-channels
depends_on: [refactor-ipc-server-extract-domain-channels-step-1-small-domains]
release_binding: v0.1.3
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

## Implementation notes

### Per-domain summary

| Domain | File | Handlers |
|---|---|---|
| config | `config-channel.ts` | 12 handlers (isLocked, setLockCode, unlock, selectedEngine, setSelectedEngine, engineConfig, engineConfig.reveal, setEngineConfig, courseCreateConfig, setCourseCreateConfig, firstRunCompleted, markFirstRunComplete) |
| memory | `memory-channel.ts` | 6 non-streaming + 1 streaming (studentModel, misconceptions, procedural, affective, export, delete, episodic stream) |
| assignments | `assignments-channel.ts` | 5 handlers (get, list, recordResponse, getResponses, submit) |
| notes | `notes-channel.ts` | 7 handlers (create, update, get, list, delete, setAnnotations, getAnnotations) |
| flashcards | `flashcards-channel.ts` | 7 handlers (create, update, get, list, delete, review, dueCount) |
| tabs | `tabs-channel.ts` | 9 handlers (listOpen, list, get, open, openDocument, reopen, close, touch, rename) |
| sketches | `sketches-channel.ts` | 3 handlers (put, get, getSummary) |
| conceptMaps | `concept-maps-channel.ts` | 10 handlers (create, get, list, rename, delete, updateScene, listVersions, setNodeLink, computeRipples, convertFromSketch) |

**Total**: 8 new channel files, 59 handlers extracted.

### getStudentId regressions

9 inline regressions across the 8 domains (config: 0, memory: 6, assignments: 0, notes: 7, flashcards: 7, tabs: 5, sketches: 1, conceptMaps: 4). Each uses `brandId<"StudentId">(services.getDefaultStudentId()) as StudentId` directly. A future shared helper can consolidate.

### config: requireUnlocked

config-channel.ts defines its own local `requireUnlocked()` (closes over `services.lock`), mirroring the pattern. The author section in ipc-server.ts retains its own `requireUnlocked`.

### Shared schema duplications

None. All schemas in these 8 domains were exclusive to their respective domains after the move.

### Memory streaming verification

`praxis.memory.episodic.start/.cancel` streaming path tested and passing: `ipc-server.cancel.test.ts` (3/3), `streaming-channel-error-redaction.test.ts` (6/6), `memory-channel-envelope.test.ts` (16/16).

### ipc-server.ts LoC delta

1811 (end of step 1) → 972 (end of step 2) — reduction of 839 lines.

### Baseline confirmation

- Pre-existing typecheck errors (3 in UI files) preserved — not introduced by this step.
- Pre-existing biome suppression warning (lessonAssessments) preserved.
- All 31 test files, 493 tests passing.
- Biome clean on all 8 new channel files (1 format fix applied to notes-channel.ts).

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- Per-domain getStudentId regression counts in the implementation notes (config: 0, memory: 6, notes: 7, flashcards: 7, tabs: 5, sketches: 1, conceptMaps: 4) sum to 30, not the headline "9" — minor inconsistency in the note. Doesn't affect correctness; the regressions are tracked for the future shared helper either way.
- `config-channel.ts` defines its own local `requireUnlocked()` — same as the author section in ipc-server.ts. Once step 3 lands, both will live in their own channel files; consider whether a shared `require-unlocked.ts` helper consolidates them. Out of scope for this step.

**Notes**: Massive mechanical refactor executed cleanly. 8 new channel files, 59 handlers. ipc-server.ts down 839 LoC (-46%). Memory's streaming endpoint moved cleanly to memory-channel.ts using the established activity-channel.ts pattern. Critical cancel + streaming + envelope tests all pass unmodified. Pattern from step 1 mirrored faithfully.
