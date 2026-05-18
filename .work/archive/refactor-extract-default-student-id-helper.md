---
id: refactor-extract-default-student-id-helper
kind: story
stage: done
tags: [refactor]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Story: extract getDefaultStudentId helper in ipc-server.ts

## Brief

`packages/desktop/electron/main/ipc-server.ts` repeats the pattern

```ts
const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
```

at ~40 sites (discovery flagged lines 161, 183, 420, 484, 494, 506, 518,
530, 544, 557, 565, 577, 585, 605, 635, and more). The pattern is
identical at every site; extract a single helper inside the
`registerIpcHandlers` scope and call it.

This is **pure refactor** — every site returns the same branded value.

## Files

- `packages/desktop/electron/main/ipc-server.ts` only

## Current State

```ts
ipcMain.handle("praxis.something", async (_event, …) => {
  const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
  …
});
```

## Target State

```ts
// near top of registerIpcHandlers(services, …):
const getStudentId = () =>
  brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;

// at every former site:
const studentId = getStudentId();
```

## Implementation Notes

- The helper lives **inside** `registerIpcHandlers` (closure over
  `services`), not as a free export. This avoids a re-import surface and
  keeps the helper invisible to other files.
- This refactor may overlap with `refactor-ipc-server-extract-domain-channels`
  — when the domain channels split out, each channel module will
  independently need this same call. Sequencing options:
  1. Land this story first, then the bigger split moves the helper into
     each channel module as needed.
  2. Skip this story; the bigger split absorbs it.
  
  Either path works. If implementing independently, do this story
  first so the call sites are uniform before extraction.
- Final grep should show: 1 helper definition + ~40 callers within
  ipc-server.ts.

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `grep -cn 'brandId<"StudentId">(services.getDefaultStudentId())' packages/desktop/electron/main/ipc-server.ts` returns 1 (the helper only)
- [ ] `grep -cn 'getStudentId()' packages/desktop/electron/main/ipc-server.ts` returns ≥35

## Risk

**Low** — in-file mechanical refactor.

## Rollback

`git revert <commit>` — clean.

## Implementation notes

**Helper location**: inserted at lines 92–93 of `ipc-server.ts`, inside `registerIpcHandlers`, after the `requireUnlocked` inner function and before the session section. Typed as `(): StudentId` so callers infer the branded type without the cast.

**Sites converted**: 41 total occurrences of `brandId<"StudentId">(services.getDefaultStudentId())` before this change. The helper now contains the only remaining occurrence (the definition); all 41 former call sites use `getStudentId()`.

**Final grep counts**:
- `grep -cn 'brandId<"StudentId">(services.getDefaultStudentId())' ipc-server.ts` → **1** (helper definition only)
- `grep -cn 'getStudentId()' ipc-server.ts` → **41**

**Baseline confirmation**: 3 pre-existing typecheck errors in `ui/src` files (`chat-tab-body.tsx`, `chat.tsx`, `notes-list.tsx`) unchanged. 2 pre-existing biome warnings (unused suppression + noExplicitAny on `LessonId` passthrough) unchanged. 1 pre-existing test failure in `@praxis/ui` (`use-fragment-overrides.test.tsx`) unchanged. No new errors or failures introduced.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Closure-local helper at lines 92-93, typed `(): StudentId` so the brand flows back without per-call recast. 41 call sites collapsed to `const studentId = getStudentId();`. Grep verification confirms: 1 definition + 41 call sites, zero remaining inline brand casts. No new typecheck/lint errors beyond baseline.
