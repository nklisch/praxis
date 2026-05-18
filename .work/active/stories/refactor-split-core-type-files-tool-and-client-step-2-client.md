---
id: refactor-split-core-type-files-tool-and-client-step-2-client
kind: story
stage: implementing
tags: [refactor]
parent: refactor-split-core-type-files-tool-and-client
depends_on: [refactor-split-core-type-files-tool-and-client-step-1-tool]
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 2: Move client API interfaces from client.ts to per-domain homes

## Brief

`packages/core/src/types/client.ts` is 944 LoC because ~20 client-side
API interfaces are crammed into one file. Move each to its natural
per-domain home (existing per-domain type file from Step 1, or a new
per-domain client file). Update the barrel's explicit re-export block.
Public surface unchanged including the `MemoryService as MemoryClientService`
alias.

See the parent feature body's "Step 2" section for the destination map.

## Files (extract from + many destinations + barrel)

- `packages/core/src/types/client.ts` — extract every client API interface and its supporting wire-shape types; what remains is `PraxisClient` aggregate (~150 LoC after extraction)
- Existing destinations (post-Step-1): `notes.ts`, `flashcards.ts`, `artifacts.ts`, `document-scopes.ts`, `quick-check.ts`, `subagent.ts`, `tabs.ts`, `sketches.ts`, `concept-map-service.ts`, `recommendation.ts`, `citation.ts`, `activity.ts`, `ingestion.ts`, `library-service.ts`, `lock-service.ts`
- New per-domain client files: `client-memory.ts`, `config-service.ts`, `session-client.ts`, `assignments-client.ts`, `authoring-client.ts`, `shell-client.ts`, `update-client.ts`
- `index.ts` — barrel: replace the explicit `export type { ... } from "./client.js"` block at lines ~14-47 with per-file re-exports

## Dep readiness check

`depends_on: [refactor-split-core-type-files-tool-and-client-step-1-tool]`. Verify before starting:

```bash
grep '^stage:' /home/nathan/dev/praxis/.work/active/stories/refactor-split-core-type-files-tool-and-client-step-1-tool.md 2>/dev/null \
  || grep '^stage:' /home/nathan/dev/praxis/.work/archive/refactor-split-core-type-files-tool-and-client-step-1-tool.md
```

Expected: `stage: review` or `stage: done`. If `implementing`, the dep is unmet — append a one-line "Dep unmet: step 1 still at implementing" note to your story body and return without implementing.

## Destination map

| Client API | Destination |
|---|---|
| `NotesClient` | `notes.ts` (alongside `NotesService`) |
| `FlashcardsClient` | `flashcards.ts` |
| `ArtifactsClientSurface` + `ProgressSnapshot`, `PackSummaryClient`, `ImportedPackClient`, `PacksClient` | `artifacts.ts` (if too large, split off as `artifacts-client.ts` — judgment call) |
| `MemoryService` (client-side) | new `client-memory.ts` (avoid collision with server `MemoryService` in `memory.ts`) |
| `ConfigService` + `EngineConfigSnapshot`, `CourseCreateConfigSnapshot` | new `config-service.ts` |
| `SessionService` + `SessionHandle`, `SessionEndSummary`, `SessionSummary`, `BootstrapOpts`, `CreateCourseInput`, `FileRef` | new `session-client.ts` |
| `AssignmentsClient` | new `assignments-client.ts` (or merge into `artifacts.ts` if natural) |
| `AuthoringClient` | new `authoring-client.ts` |
| `LockClient` | `lock-service.ts` (alongside `LockService` from Step 1) |
| `IngestionClient` + `DocumentSummary`, `DocumentDetail` | `ingestion.ts` |
| `QuickCheckClientApi` | `quick-check.ts` |
| `SubAgentClientApi` | `subagent.ts` |
| `TabsClientApi` | `tabs.ts` |
| `SketchClientApi` | `sketches.ts` |
| `ConceptMapClientApi` | `concept-map-service.ts` (alongside `ConceptMapService`) |
| `DocumentScopesClientApi` | `document-scopes.ts` |
| `ShellClient` | new `shell-client.ts` |
| `RecommendationsClientApi` | `recommendation.ts` |
| `UpdateClientApi` | new `update-client.ts` |
| `CitationsClientApi` | `citation.ts` |
| `DocumentsClient` | `ingestion.ts` (or new `documents-client.ts` if natural) |
| `LibraryClientApi` | `library-service.ts` (alongside `LibraryService` from Step 1) |
| `ActivityClient` | `activity.ts` |

**Stays in client.ts**: `PraxisClient` aggregate (its body composes references to each `*Client*` API from their new homes).

## Approach

Same shape as Step 1:
1. Read client.ts in full. Inventory every interface.
2. For each destination, copy + delete + verify with typecheck.
3. After all moves, update the barrel's explicit-list block at lines ~14-47 to per-file re-exports.
4. Update the `MemoryService as MemoryClientService` re-export to point at the new `client-memory.ts`:
   ```ts
   export type { MemoryService as MemoryClientService } from "./client-memory.js";
   ```
5. Run full typecheck + test sweep.

## Implementation notes

- Same import-type and ESM-extension rules as Step 1.
- The destinations that come from Step 1 (e.g., `notes.ts` now also gets `NotesClient`, alongside the `NotesService` that Step 1 added) — that's fine. Same domain, related types.
- Some client APIs may NOT have a natural existing home (Shell, Update, Authoring-client) — create new files following the `<domain>-client.ts` naming pattern.
- The `PraxisClient` aggregate in client.ts becomes a thin interface that composes references:
  ```ts
  // client.ts (post-extraction)
  import type { NotesClient } from "./notes.js";
  import type { FlashcardsClient } from "./flashcards.js";
  // ... import each *Client* from its new home
  
  export interface PraxisClient {
    notes: NotesClient;
    flashcards: FlashcardsClient;
    // ... composes the rest
  }
  ```
- If the import list becomes unwieldy in either tool.ts or client.ts (post-extraction), consider an intermediate `services-barrel.ts` (server-side) and `clients-barrel.ts` that re-exports everything. Then `ToolServices` / `PraxisClient` import from those. Optional — only if the import count exceeds ~20.

## Barrel update — concrete shape

The current barrel block at lines ~14-47:
```ts
export type {
  ArtifactsClientSurface,
  AssignmentsClient,
  AuthoringClient,
  // ... 30+ explicit names
  MemoryService as MemoryClientService,
  // ...
} from "./client.js";
```

becomes (after this step):
```ts
// Just the aggregate
export type { PraxisClient } from "./client.js";

// Per-domain re-exports — automatic for `export type *` since interfaces
// flow through their new home files. Add new files explicitly:
export type * from "./client-memory.js";
export type * from "./config-service.js";
export type * from "./session-client.js";
export type * from "./assignments-client.js";
export type * from "./authoring-client.js";
export type * from "./shell-client.js";
export type * from "./update-client.js";

// The MemoryService alias survives the move
export type { MemoryService as MemoryClientService } from "./client-memory.js";
```

(Existing per-domain files already have `export type * from "./notes.js"` etc., which auto-picks up the moved client interfaces.)

## Tests

No new tests. Existing tests pass unmodified.

## Acceptance criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm test` green from repo root (baseline preserved)
- [ ] `wc -l packages/core/src/types/client.ts` < 200 (currently 944)
- [ ] Every previously-exported symbol from `@praxis/core/types` still exported including `MemoryClientService`
- [ ] New per-domain client files created as listed
- [ ] Barrel updated with per-file re-exports replacing the explicit-list block

## Risk

**Low** — same shape as Step 1; type-only.

## Rollback

`git revert <commit>` — clean.

## Design-flaw escape hatch

Same as Step 1 — if a client API's supporting types are entangled with types in another domain, adapt the destination map and document.
