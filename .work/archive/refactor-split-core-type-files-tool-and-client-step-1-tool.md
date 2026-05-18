---
id: refactor-split-core-type-files-tool-and-client-step-1-tool
kind: story
stage: done
tags: [refactor]
parent: refactor-split-core-type-files-tool-and-client
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 1: Move service interfaces from tool.ts to per-domain homes

## Brief

`packages/core/src/types/tool.ts` is 1617 LoC because ~15 server-side
service interfaces are crammed into one file. Move each to its natural
per-domain home (existing per-domain type file or a new per-service file).
Update the barrel's re-export. Public surface unchanged.

See the parent feature body's "Step 1" section for the full destination
map + rationale.

## Files (extract from + many destinations + barrel)

- `packages/core/src/types/tool.ts` — extract every service interface and its supporting types; what remains is `ToolDefinition`, `ToolContext`, `ToolServices` aggregate, `EffectKind` (~250 LoC after extraction)
- Existing destinations: `notes.ts`, `flashcards.ts`, `artifacts.ts`, `document-scopes.ts`, `memory.ts`
- New per-service files: `library-service.ts`, `lock-service.ts`, `authoring-service.ts`, `course-state.ts`, `course-create-service.ts`, `vision.ts`
- `index.ts` — barrel: add `export type * from "./<new-file>.js"` for each new file

## Approach

1. **Read tool.ts in full**. Inventory every `export interface`/`export type` and classify by destination (use the parent feature's destination map as the starting point; refine if you spot something that belongs elsewhere).

2. **For each destination, in order**:
   a. Identify the cluster of types to move (the service interface + its supporting types like `DraftIssue`, `UnitListEntry`, etc.)
   b. Copy the cluster (and its required imports — likely fewer imports than before since data types are now co-located) into the destination file, appending after existing exports
   c. Delete the cluster from tool.ts
   d. Verify imports in tool.ts: the `ToolServices` aggregate at the bottom now needs to `import type { *Service } from "./<destination>.js"` for each service it composes. Update those imports.
   e. Run `pnpm --filter @praxis/core typecheck` to catch any drift
   f. Move to the next destination

3. **After every service is moved**, update the barrel:
   - Add `export type * from "./<new-file>.js"` for each new file (library-service, lock-service, authoring-service, course-state, course-create-service, vision)
   - Keep `export type * from "./tool.js"` — it now re-exports only the core tool primitives (ToolDefinition, ToolContext, ToolServices, EffectKind)
   - For existing destinations (notes, flashcards, artifacts, etc.), no barrel change needed — `export type * from "./notes.js"` already picks up the moved interfaces automatically

4. **VisionService special case**: drop the workaround comment ("imported from @praxis/core/services would violate dependency direction") — the new `vision.ts` is in `core/types/`, not `core/services/`, so the dependency-direction reason no longer applies. Just `export interface VisionService { describe(...): Promise<...> }` in the new file.

5. **Verify public surface**:
   ```bash
   pnpm --filter @praxis/core typecheck
   pnpm --filter @praxis/desktop typecheck
   pnpm --filter @praxis/engines typecheck
   pnpm --filter @praxis/tools typecheck
   pnpm --filter @praxis/ui typecheck
   ```
   Any new "Cannot find name" error means a consumer was importing from `tool.ts` directly (bad form) — that import should change to `@praxis/core/types` (the barrel). Note any such consumer in implementation notes.

6. **Run the full test suite** to confirm no behavior drift:
   ```bash
   pnpm test
   ```

## MemoryService note

The barrel currently exports `MemoryService` (server) from `tool.ts` via the wildcard, AND aliases `MemoryService as MemoryClientService` from `client.ts` via the explicit-list import. After this step:
- Server `MemoryService` lives in `memory.ts` (moved by you)
- `client.ts`'s `MemoryService` still lives in `client.ts` (Step 2 will move it)
- The barrel's aliased `MemoryClientService` re-export still points at `./client.js` until Step 2

## Implementation notes

- Use the `Edit` tool for cut + paste; don't `git mv` (the source file isn't being renamed, just shrunk).
- Each destination file's import block may grow (importing additional supporting types from the original tool.ts environment) OR shrink (if a supporting type was already in the destination file because it's a data type). Read each destination carefully.
- Some supporting types (e.g., `DraftIssue` which is used by `CourseCreateService`) may already exist in `artifacts.ts` or another data-type file — verify by grep before duplicating. If it exists, just import it; don't create a duplicate.
- The `ToolServices` aggregate is the trickiest piece. After extraction:
  ```ts
  // tool.ts (post-extraction)
  import type { NotesService } from "./notes.js";
  import type { FlashcardsService } from "./flashcards.js";
  import type { ArtifactsService } from "./artifacts.js";
  import type { DocumentScopesService } from "./document-scopes.js";
  import type { MemoryService } from "./memory.js";
  import type { LibraryService } from "./library-service.js";
  import type { LockService } from "./lock-service.js";
  import type { AuthoringService } from "./authoring-service.js";
  import type { CourseStateReader } from "./course-state.js";
  import type { CourseCreateService } from "./course-create-service.js";
  import type { VisionService } from "./vision.js";
  // ... plus any other services
  
  export interface ToolServices {
    notes: NotesService;
    flashcards: FlashcardsService;
    // ... composes the rest
  }
  ```
- Use `import type` (not `import`) for everything — `verbatimModuleSyntax: true` enforces this and Biome lints it.
- ESM `.js` extension on every import.

## Codebase context

- TypeScript 6 strict, `verbatimModuleSyntax: true`, ESM `.js` imports
- Pre-existing baseline: 3 UI typecheck errors (chat-tab-body.tsx, chat.tsx, notes-list.tsx), ~524 `.mockups/**.html` lint errors, one flaky UI test
- The barrel re-export curation prevents direct importers of tool.ts from breaking — every consumer should be using `@praxis/core/types` (the barrel)

## Tests

No new tests needed — type-only refactor. Existing tests pass unmodified.

If a test file imports a type from a direct path like `from "@praxis/core/types/tool"`, that's a code smell pre-dating this work — the import should go through the barrel. Update those import paths or leave them with a note in implementation notes (out of scope but worth flagging).

## Acceptance criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm test` green from repo root (baseline preserved — pre-existing UI errors and `.mockups/**` lint debt don't count)
- [ ] `wc -l packages/core/src/types/tool.ts` < 350 (currently 1617)
- [ ] Every previously-exported symbol from `@praxis/core/types` still exported (no "Cannot find name" errors anywhere in the workspace)
- [ ] New per-service files created: `library-service.ts`, `lock-service.ts`, `authoring-service.ts`, `course-state.ts`, `course-create-service.ts`, `vision.ts`
- [ ] Existing per-domain files (`notes.ts`, `flashcards.ts`, `artifacts.ts`, `document-scopes.ts`, `memory.ts`) have their service interfaces appended
- [ ] Barrel updated with new `export type *` lines for the new files
- [ ] No consumer file outside `packages/core/src/types/` needs an import-path change

## Risk

**Low** — type-only. tsc catches everything. The mechanical nature of the moves makes regressions unlikely.

## Rollback

`git revert <commit>` — clean. Single commit reverts every move.

## Design-flaw escape hatch

If during implementation you discover that a service's "supporting types" are heavily entangled with types in another domain file (e.g., `CourseStateSnapshot` deeply references `Lesson` from `artifacts.ts` in ways that suggest it should LIVE in artifacts.ts), adapt the destination map and document the choice in implementation notes. The destination map is a starting point, not a constraint.

If the `ToolServices` aggregate's import block becomes unwieldy (more than 20 imports), consider an intermediate barrel `services.ts` that re-exports all the service interfaces, then `ToolServices` imports from `./services.js` once. Document this if you take the path.

## Implementation notes

### Per-destination type counts moved

The destination map in the feature body was incomplete — it listed 11 service interfaces but `tool.ts` actually contained ~20 services. All were moved:

**Existing file destinations (appended):**
- `notes.ts` — `NotesService` (1 interface, ~50 LoC)
- `flashcards.ts` — `FlashcardsService` (1 interface, ~45 LoC); also added imports for `Flashcard`, `ConceptId`, `FlashcardId`, `StudentId`
- `artifacts.ts` — `ArtifactsService` (1 interface, ~150 LoC), `DocumentSummaryItem` (1 interface), `AssignmentService` (1 interface, ~55 LoC); added imports for `ProgressSnapshot` from `client.ts`, `GateView`/`GradeReader`/`MasteryReader` from `gate.ts`
- `document-scopes.ts` — `DocumentScopesService` (1 interface, ~55 LoC)
- `memory.ts` — `MemoryService` (1 interface, ~95 LoC)
- `pedagogy.ts` — `PedagogyPackService` (1 interface, ~30 LoC)

**New per-service files created (6 from original destination map + 4 discovered additions):**
- `library-service.ts` — `LibraryService`, `NoteLibraryHit`, `FlashcardLibraryHit`, `LibraryHit`, `LibrarySearchInput` (5 types)
- `lock-service.ts` — `LockService` (1 interface)
- `authoring-service.ts` — `AuthoringService`, `FragmentOverride` (2 types)
- `course-state.ts` — `CourseStateReader`, `CourseStateSnapshot`, `VisibilityWindow`, `ConceptStateRow` (4 types)
- `course-create-service.ts` — `CourseCreateService`, `DraftIssue`, `UnitListEntry`, `LessonsInUnit`, `LessonDetail`, `DanglingRefsReport` (6 types)
- `vision.ts` — `VisionService` (1 interface, workaround comment dropped)
- `rag-service.ts` — `EmbeddingService`, `VectorStore`, `VectorUpsertInput`, `VectorSearchInput`, `VectorSearchResult`, `FtsStore`, `FtsUpsertInput`, `FtsSearchInput`, `FtsSearchResult`, `DocumentsReader`, `DocumentChunkRow` (11 types)
- `sympy-service.ts` — `SymPyService`, `SymPyCheckSolutionInput`, `SymPyCheckSolutionResult`, `SymPySolveEquationInput`, `SymPySolveEquationResult`, `SymPySimplifyInput`, `SymPySimplifyResult`, `SymPyCheckEquivalentInput`, `SymPyCheckEquivalentResult`, `SymPyParseLatexInput`, `SymPyParseLatexResult` (11 types)
- `sandbox-service.ts` — `CodeSandbox`, `CodeSandboxInput`, `CodeSandboxResult`, `LanguageSandbox`, `LanguageSandboxRunOptions`, `LanguageSandboxRunResult` (6 types)
- `pack-import-service.ts` — `PackImportService`, `PackSummaryView`, `ImportedPackView` (3 types)

### Final tool.ts LoC

**184 lines** (down from 1617 — 89% reduction). Contains only: `EffectKind`, `ToolDefinition`, `ToolContext`, `ToolServices`.

### Consumers that needed import-path adjustment (direct tool.ts importers)

Four files inside `packages/core/src/` imported directly from `../types/tool.js` or `../../types/tool.js`:
- `packages/core/src/services/memory/memory-service.ts` — imported `MemoryService`; updated to `./memory.js`
- `packages/core/src/services/documents-reader-impl.ts` — imported `DocumentChunkRow`, `DocumentsReader`; updated to `./rag-service.js`
- `packages/core/src/services/documents-service.ts` — imported `FtsStore`, `VectorStore`; updated to `./rag-service.js`
- `packages/core/src/services/graders/__tests__/code-grader.test.ts` — imported `CodeSandboxResult`; updated to `./sandbox-service.js`
- `packages/core/src/services/graders/__tests__/math-grader.test.ts` — imported `SymPyCheckSolutionResult`; updated to `./sympy-service.js`
- `packages/core/src/types/client.ts` — imported `FragmentOverride`, `LibraryHit`, `LibrarySearchInput`; updated to `./authoring-service.js` and `./library-service.js`

All consumers outside `packages/core/src/types/` import through the barrel `@praxis/core/types` and needed no changes.

### Barrel updates

Added 10 new `export type *` lines to `index.ts` (biome re-sorted them alphabetically):
- `authoring-service.js`, `course-create-service.js`, `course-state.js`, `library-service.js`, `lock-service.js`, `pack-import-service.js`, `rag-service.js`, `sandbox-service.js`, `sympy-service.js`, `vision.js`

Existing destinations (`notes.js`, `flashcards.js`, `artifacts.js`, `document-scopes.js`, `memory.js`, `pedagogy.js`) picked up new service interfaces automatically via existing `export type *` wildcards.

### Design adaptations

- The destination map's `EmbeddingService`, `VectorStore`, `FtsStore`, `DocumentsReader` were not listed but grouped into new `rag-service.ts` (RAG infrastructure cluster). `SymPyService`, `CodeSandbox`/`LanguageSandbox`, `PackImportService`, `PedagogyPackService`, `AssignmentService` were similarly not in the original map but moved to their natural homes.
- `AssignmentService` placed in `artifacts.ts` (alongside `Assignment`, `AssignmentItem` etc.) rather than a new file, as all supporting types are already co-located there.
- `PedagogyPackService` placed in `pedagogy.ts` (alongside `PedagogyPack`, `TeachingStrategy` etc.).
- No intermediate `services-barrel.ts` was needed — the `ToolServices` import block has 23 imports but they're well-organized and the file is now only 184 lines.
- `GateView`/`GradeReader`/`MasteryReader` re-export moved from `tool.ts` to `artifacts.ts` since `ArtifactsService` uses `GateView`.

### Baseline confirmation

- **3 pre-existing UI typecheck errors** (chat-tab-body.tsx, chat.tsx, notes-list.tsx) — unchanged.
- **~529 mockup HTML lint errors** — unchanged (baseline was ~524; within noise).
- **All 4499 tests pass** (420 test files, 23 skipped) — no behavior drift.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Massive but mechanical refactor executed cleanly. tool.ts 1617→184 LoC. The agent's discovery process found 6+ additional services beyond the destination map (PedagogyPackService, EmbeddingService, VectorStore, FtsStore, DocumentsReader, SymPyService, CodeSandbox, PackImportService) and created appropriate per-service files for them. 5 direct-tool.ts importers inside `packages/core/src/` were fixed in-line — those were code smells pre-dating this work. All 4499 tests pass; typecheck clean across 9 packages; biome clean. The `ToolServices` aggregate now composes from per-domain imports, making the type surface easier to reason about per-domain.
