---
id: share-getstudentid-helper-across-channels
kind: story
stage: review
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Extract a shared `getStudentId()` helper across all channel modules

## Brief

The `refactor-extract-default-student-id-helper` story (commit `46112a8`)
collapsed 41 inline `brandId<"StudentId">(services.getDefaultStudentId()) as StudentId`
casts in ipc-server.ts into a single `getStudentId` closure.

The subsequent `refactor-ipc-server-extract-domain-channels` feature
(steps 1-3, commits `b660850`, `8489e3b`, `dd9f96c`) extracted 18 domain
channels into per-domain files. Since `getStudentId` lived in ipc-server.ts's
closure, the extracted channels couldn't reach it — each inline-regression
the brand cast.

Total inline regressions across the 3 steps: ~42 (step 1: 1 in library, step
2: 30 across memory/notes/flashcards/tabs/sketches/conceptMaps, step 3: 11
across artifacts/author/session).

## Implementation plan

Extract a shared helper module
`packages/desktop/electron/main/student-id.ts`:

```ts
import type { Services } from "./services.js";
import { brandId } from "@praxis/core/types";
import type { StudentId } from "@praxis/core/types";

export function getStudentId(services: Services): StudentId {
  return brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
}
```

Adopt across all channel files. Single commit, ~42 sites collapse to single
`getStudentId(services)` calls.

Story-sized. Mechanical. After this lands, ipc-server.ts itself can drop its
own local `getStudentId` closure (if any remained — verify) and use the
shared helper too.

## Implementation notes

**Files touched**: 13 total — 1 new file created, 12 channel files modified.

New file:
- `packages/desktop/electron/main/student-id.ts` — shared helper

Modified channel files (12):
- `artifacts-channel.ts` — 6 sites replaced; `StudentId` type import removed
- `author-channel.ts` — 3 sites replaced; `StudentId` type import removed
- `concept-maps-channel.ts` — 3 sites replaced; `StudentId` type import removed
- `document-scopes-channel.ts` — 1 site replaced; `StudentId` type import removed
- `flashcards-channel.ts` — 7 sites replaced; `StudentId` type import removed
- `library-channel.ts` — 1 site replaced; `StudentId` type import removed
- `memory-channel.ts` — 7 sites replaced; `StudentId` type import removed
- `notes-channel.ts` — 7 sites replaced; `StudentId` type import removed
- `recommendations-channel.ts` — 1 site replaced; `StudentId` type import + `brandId` runtime import removed (only consumer)
- `session-channel.ts` — 2 sites replaced; `StudentId` type import removed
- `sketches-channel.ts` — 1 site replaced; `StudentId` type import + `brandId` runtime import removed (only consumer)
- `tabs-channel.ts` — 4 sites replaced; `StudentId` type import + `brandId` runtime import removed (only consumer)

**Total inline regressions collapsed**: 44 (story estimated ~42).

**ipc-server.ts**: no local `getStudentId` closure found — nothing to remove.

**Grep audit result**: `grep -rn 'brandId<"StudentId">' packages/desktop/electron/main/` returns exactly 2 hits after landing:
1. `student-id.ts:6` — the helper itself (expected)
2. `services.ts:521` — a lazy lambda for the conceptMaps service construction (different pattern, not an IPC channel inline regression)

Zero regression sites remain.

**Verification**:
- `pnpm --filter @praxis/desktop build` — PASSED
- `pnpm --filter @praxis/desktop typecheck` — only pre-existing `session-service.ts(42,51) TS2345` error (documented baseline)
- `pnpm typecheck` (workspace) — same single pre-existing error, no new errors
- `pnpm --filter @praxis/desktop test` — pre-existing startup failure (vitest config references non-existing `tests/` dir); unrelated to this story
