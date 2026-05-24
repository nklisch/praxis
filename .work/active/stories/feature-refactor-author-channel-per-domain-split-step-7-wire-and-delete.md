---
id: feature-refactor-author-channel-per-domain-split-step-7-wire-and-delete
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-author-channel-per-domain-split
depends_on:
  - feature-refactor-author-channel-per-domain-split-step-1-course
  - feature-refactor-author-channel-per-domain-split-step-2-lesson
  - feature-refactor-author-channel-per-domain-split-step-3-gate
  - feature-refactor-author-channel-per-domain-split-step-4-prompt
  - feature-refactor-author-channel-per-domain-split-step-5-memory
  - feature-refactor-author-channel-per-domain-split-step-6-configurator
created: 2026-05-24
updated: 2026-05-24
---

# Step 7: Wire new modules into ipc-server.ts and delete author-channel.ts

## Risk
Medium — touches the composition root; a missing import or typo here breaks every author channel at runtime, but the risk is mitigated by the passing build + test suite from prior steps.

## Priority
High

## Files affected
- `packages/desktop/electron/main/ipc-server.ts` (replace `registerAuthorHandlers` import + call with 6 new calls)
- `packages/desktop/electron/main/author-channel.ts` (delete — should be empty of handlers by this point)

## Precondition
Steps 1–6 must all be merged. At that point `author-channel.ts` will contain only:
- The file-level imports (some may now be unused)
- The empty `registerAuthorHandlers()` function body (or a function with zero handler registrations)

## Current state
`ipc-server.ts` line 7–8 and line 91:
```typescript
import { registerAuthorHandlers } from "./author-channel.js";
// ...
registerAuthorHandlers(services, log);
```

## Target state
Replace the single author import + call block with six module imports and six register calls:

```typescript
// ── Phase 11: Author (split into per-sub-domain modules) ──────────────────────
import { registerAuthorCourseHandlers } from "./author-course-channel.js";
import { registerAuthorLessonHandlers } from "./author-lesson-channel.js";
import { registerAuthorGateHandlers } from "./author-gate-channel.js";
import { registerAuthorPromptHandlers } from "./author-prompt-channel.js";
import { registerAuthorMemoryHandlers } from "./author-memory-channel.js";
import { registerAuthorConfiguratorHandlers } from "./author-configurator-channel.js";

// In registerIpcHandlers():
registerAuthorCourseHandlers(services, log);
registerAuthorLessonHandlers(services, log);
registerAuthorGateHandlers(services, log);
registerAuthorPromptHandlers(services, log);
registerAuthorMemoryHandlers(services, log);
registerAuthorConfiguratorHandlers(services, log);
```

Then delete `packages/desktop/electron/main/author-channel.ts`.

## Implementation notes
- All six new modules take `(services: Services, log: Logger)` — same signature as the original `registerAuthorHandlers`. The composition root call sites are therefore uniform (no `webContentsGetter` or `activeAbortControllers` needed — author channels are all invoke-only, no streaming).
- Registration order among the six calls is arbitrary (no handler depends on another being registered first). Use the order above (course → lesson → gate → prompt → memory → configurator) for consistency with the logical grouping in the original file.
- After deletion of `author-channel.ts`, verify no other file imports from it (`grep -r "author-channel" packages/`).

## Acceptance criteria
- `pnpm typecheck && pnpm lint && pnpm test` all pass.
- `author-channel.ts` does not exist.
- `grep -r "author-channel" packages/` returns no hits.
- All 25 `praxis.author.*` channels are registered and respond identically to before.

## Rollback
`git revert` the commit for this step; restore `author-channel.ts` from the prior step's state and revert `ipc-server.ts` to the single-import form.
