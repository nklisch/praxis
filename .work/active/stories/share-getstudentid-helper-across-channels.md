---
id: share-getstudentid-helper-across-channels
kind: story
stage: implementing
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
