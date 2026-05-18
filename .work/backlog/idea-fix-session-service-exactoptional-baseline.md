---
id: idea-fix-session-service-exactoptional-baseline
kind: idea
tags: [tech-debt, typecheck]
created: 2026-05-18
---

# Fix the 4th `exactOptionalPropertyTypes` baseline error in session-service.ts

Surfaced during the review of `fix-exactoptional-typecheck-baseline` (the 3
UI-side `TS2375` errors fixed cleanly). A 4th, same-shape baseline error
remains:

```
packages/core/src/services/session-service.ts(42,51): error TS2345
  Argument of type '{ ... 5 more ...; engineFactory?: (...) => Engine; }'
  is not assignable to parameter of type 'EngineSessionManagerDeps'.
    Types of property 'indexerOrchestrator' are incompatible.
      Type 'IndexerOrchestrator | undefined' is not assignable to type 'IndexerOrchestrator'.
        Type 'undefined' is not assignable to type 'IndexerOrchestrator'.
```

Same root cause as the three already-fixed UI sites: an optional source field
flows into a destination slot typed as required (`T` not `T | undefined`).
The fix shape is also the same — conditional-spread at the construction
site, or making `indexerOrchestrator?: IndexerOrchestrator` optional on
`EngineSessionManagerDeps`.

Quick triage decision needed at scope-time:
- If `EngineSessionManagerDeps` legitimately needs an `indexerOrchestrator`
  (i.e. it's not optional) → look at the caller in `session-service.ts:42`,
  add a guard / non-null assert with a clear comment, or thread a real
  orchestrator through (preferred).
- If `EngineSessionManagerDeps` could accept undefined → mark the field
  `?:` in `EngineSessionManagerDeps` and rely on a default inside the
  manager.

Story-sized. ~10-line delta. After this lands, `pnpm typecheck` exits
clean across the workspace and the baseline is restored.
