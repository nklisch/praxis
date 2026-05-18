---
id: refactor-extract-default-student-id-helper
kind: story
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
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
