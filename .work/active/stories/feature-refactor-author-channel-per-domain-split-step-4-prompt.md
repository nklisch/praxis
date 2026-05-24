---
id: feature-refactor-author-channel-per-domain-split-step-4-prompt
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-author-channel-per-domain-split
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: Extract author-prompt-channel.ts (10 handlers)

## Risk
Low

## Priority
High

## Files affected
- `packages/desktop/electron/main/author-prompt-channel.ts` (new)
- `packages/desktop/electron/main/author-channel.ts` (remove extracted handlers)

## Current state
`author-channel.ts` registers these handlers inside `registerAuthorHandlers()`:
- `praxis.author.customizePrompt` (lines 289–304)
- `praxis.author.listFragmentOverrides` (lines 306–312)
- `praxis.author.clearFragmentOverride` (lines 314–328)
- `praxis.author.setStyleSliders` (lines 330–345)
- `praxis.author.setGlobalPrompt` (lines 349–360)
- `praxis.author.getGlobalPrompt` (lines 362–368) — uses `wrapEnvelope` (no payload)
- `praxis.author.setModeAppend` (lines 370–385)
- `praxis.author.getModeAppend` (lines 387–393)
- `praxis.author.previewPrompt` (lines 395–404)
- `praxis.author.previewPromptWithAttribution` (lines 406–421)

Two shared local schemas in the original function scope are used by handlers in this group:
- `modeIdSchema = z.object({ modeId: z.string().min(1, "modeId") })` — used by `listFragmentOverrides` and `getModeAppend`
- `previewPromptSchema = z.object({ ... })` — used by `previewPrompt` and `previewPromptWithAttribution`

`getGlobalPrompt` uses `wrapEnvelope` (no input); the rest use `handleEnvelope`.

## Target state
New file `packages/desktop/electron/main/author-prompt-channel.ts`:

```typescript
import type { Logger } from "@praxis/core/types";
import { z } from "zod";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

export function registerAuthorPromptHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

  const modeIdSchema = z.object({ modeId: z.string().min(1, "modeId") });

  const previewPromptSchema = z.object({
    modeId: z.string().min(1, "modeId"),
    draftGlobal: z.string().nullable().optional(),
    draftAppend: z.string().nullable().optional(),
  });

  // customizePrompt, listFragmentOverrides, clearFragmentOverride, setStyleSliders,
  // setGlobalPrompt, getGlobalPrompt, setModeAppend, getModeAppend,
  // previewPrompt, previewPromptWithAttribution handlers (verbatim from author-channel.ts)
}
```

`author-channel.ts` removes the ten extracted handler blocks and the two shared schema declarations.

## Implementation notes
- `requireUnlocked` is local, not exported.
- `modeIdSchema` and `previewPromptSchema` move into this module; they were only used by handlers in this group.
- `wrapEnvelope` import is needed for `getGlobalPrompt` (no-input channel).
- No branded types needed in this module (no `ConceptId`, `CourseId`, etc.).
- Handler bodies copy verbatim — no logic changes.
- 10 handlers is at the upper edge but they share a tight theme (prompt customization layers) and the two local schemas tie them together — keeping them in one module is correct.

## Acceptance criteria
- `pnpm typecheck && pnpm lint && pnpm test` all pass.
- All 10 channel names unchanged on the wire.
- The new file exports only `registerAuthorPromptHandlers`.
- `modeIdSchema` and `previewPromptSchema` are NOT exported (module-private).

## Rollback
`git revert` the commit for this step; the ten handlers and shared schemas remain in `author-channel.ts`.
