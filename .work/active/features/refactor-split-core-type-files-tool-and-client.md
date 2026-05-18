---
id: refactor-split-core-type-files-tool-and-client
kind: feature
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Refactor: split packages/core/src/types/{tool,client}.ts by service domain

## Brief

Two type-only files in `@praxis/core` have grown to dominate the type
surface:

- `packages/core/src/types/tool.ts` — **1617 lines** — defines
  `ToolDefinition`, `ToolContext`, `ToolServices` (50+ service interfaces),
  `EffectKind`, plus a workaround re-export of `VisionService` (with a
  comment explaining the dependency-direction reason).
- `packages/core/src/types/client.ts` — **944 lines** — defines
  `PraxisClient` and 20+ per-domain RPC interfaces (`SessionService`,
  `ArtifactsClientSurface`, `MemoryService`, `ConfigService`, etc.). Mirrors
  the server type surface for IPC cross-boundary.

Both files share the same pathology: a single module that pulls in every
service interface in the system. Adding a new service requires edits to
both. Every consumer importing one service drags compile-time dependence
on every other service's types.

This is **pure refactor** — types only. The public re-export surface (what
`@praxis/core/types` exports as a barrel) stays identical. Consumers should
not need to update import paths if the barrel is kept stable.

## Surface area

- `packages/core/src/types/tool.ts` (1617) → split into per-domain
  type files. Candidate split (verify during design):
  - `types/tool-definition.ts` — `ToolDefinition`, `ToolContext`, `ToolResult`
  - `types/tool-services.ts` — `ToolServices` aggregate interface only
  - One file per service interface (`types/services/memory.ts`,
    `services/artifacts.ts`, `services/concept-map.ts`, …) OR group by
    domain cluster (`types/services/memory.ts` covering memory + episodic
    + mastery)
  - Move `VisionService` re-export to `types/services/vision.ts` and drop
    the workaround comment
- `packages/core/src/types/client.ts` (944) → parallel split:
  - `types/client.ts` — `PraxisClient` aggregate + module barrel
  - `types/client/<domain>.ts` per RPC surface (`client/session.ts`,
    `client/artifacts.ts`, `client/memory.ts`, …)
- `packages/core/src/types/index.ts` (if exists) — barrel re-exports
  everything that was previously exported, so external imports stay
  identical

## Why a feature (not a story)

- Multi-file refactor with naming and grouping decisions
- The barrel needs to preserve every existing public type export to avoid
  cascading import-path churn across the workspace
- Cluster grouping is a design call: per-service files vs per-domain files

## Discovery findings to design against

- tool.ts mixes ~10 distinct service interfaces in one module
- client.ts mirrors a similar surface for the RPC side
- A `VisionService` re-export inside tool.ts (lines 79-81) is documented
  as a dependency-direction workaround — should be re-homed to a service-
  type module rather than living in tool.ts
- `verbatimModuleSyntax: true` enforces `import type`, so the split is
  safe per Biome's `useImportType` rule

## Out of scope

- Renaming any type (would break downstream consumers).
- Changing the public re-export shape of `@praxis/core/types`.
- Introducing a new type per service that didn't already exist.

## Acceptance Criteria

- [ ] `pnpm build` passes (all packages still resolve types)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `wc -l packages/core/src/types/tool.ts` < 400
- [ ] `wc -l packages/core/src/types/client.ts` < 300
- [ ] Every previously-exported symbol is still exported via the barrel
      (verify with a diff of `pnpm tsc --emitDeclarationOnly` output)
- [ ] No consumer file in `packages/{engines,tools,memory,artifacts,curriculum,ui,desktop,client}/`
      needs an import-path update

## Risk

**Low** — type-only changes, caught by tsc; behavior cannot drift.

## Rollback

`git revert <commit>` per split phase; one commit per logical extraction
keeps each step independently reversible.

## Design correction (2026-05-18, refactor-design pass)

After inventorying the actual exports: tool.ts (1617 LoC) holds ~15
server-side **service interfaces** (`NotesService`, `FlashcardsService`,
`ArtifactsService`, `DocumentScopesService`, `MemoryService`,
`LibraryService`, `LockService`, `AuthoringService`, `CourseStateReader`,
`CourseCreateService`, `VisionService`, etc.) plus the core tool
primitives (`ToolDefinition`, `ToolContext`, `ToolServices`, `EffectKind`)
plus assorted supporting types tied to those services
(`DocumentSummaryItem`, `UnitListEntry`, `LessonDetail`, `DraftIssue`,
etc.).

client.ts (944 LoC) holds ~20 client-side API interfaces (`PraxisClient`,
`SessionService`, `ArtifactsClientSurface`, `MemoryService` (client-side),
`AuthoringClient`, `ConfigService`, `IngestionClient`, etc.) plus
supporting wire-shape types.

The natural home for most of these already exists in `packages/core/src/types/`:
- Server `NotesService` belongs with `notes.ts` (which already holds
  `Annotation`, `NoteBody`, etc.)
- Server `FlashcardsService` belongs with `flashcards.ts`
- Server `ArtifactsService` belongs with `artifacts.ts`
- Server `DocumentScopesService` belongs with `document-scopes.ts`
- Server `MemoryService` belongs with `memory.ts`
- Same for client-side `MemoryService` → goes in a new `client/memory.ts`
  to avoid the existing name-collision workaround in the barrel

For services with no existing data-type file (Library, Lock, Authoring,
CourseState, CourseCreate, Vision), create per-service files matching the
existing precedent (`concept-map-service.ts` already lives standalone).

The barrel `index.ts` currently uses `export type * from "./tool.js"`
(wildcard) and an explicit list from "./client.js" for the
MemoryService collision workaround. After the split, both source files
shrink dramatically (tool.ts → just ToolDefinition/ToolContext/ToolServices/
EffectKind, ~250 LoC; client.ts → just PraxisClient aggregate, ~150 LoC)
and the barrel adds per-file re-exports for the new homes.

## Refactor Overview

Two-step refactor, type-only:

1. **Step 1**: move every server-side service interface (and its supporting
   types) from `tool.ts` to its natural per-domain home (existing file or
   new per-service file). Update barrel re-exports.
2. **Step 2**: same treatment for client-side API interfaces in `client.ts`.

Each step is a single commit. The barrel preserves every existing public
export name so consumers don't update imports.

Risk is **low** (type-only, caught by tsc) but the diff is **large** (~30
file edits per step). The cleanup is mechanical once the destination map
is set.

## Refactor Steps

### Step 1: Move tool.ts service interfaces to their domain homes
**Priority**: Medium
**Risk**: Low (type-only; barrel preserves public surface)
**Files**:
- `packages/core/src/types/tool.ts` (extract from)
- Existing destinations: `notes.ts`, `flashcards.ts`, `artifacts.ts`, `document-scopes.ts`, `memory.ts`
- New destinations: `library-service.ts`, `lock-service.ts`, `authoring-service.ts`, `course-state.ts`, `course-create-service.ts`, `vision.ts`
- `index.ts` (barrel re-exports)
**Story**: `refactor-split-core-type-files-tool-and-client-step-1-tool`

**Destination map** (verify by reading tool.ts during implementation; treat this as a starter, not the final word):

| Service | Destination |
|---|---|
| `NotesService` + supporting types | `notes.ts` (append after existing exports) |
| `FlashcardsService` + supporting types (incl. `FsrsScheduler`, `FsrsState`, `Rating` re-exports — verify) | `flashcards.ts` |
| `ArtifactsService` + `UnitListEntry`, `LessonsInUnit`, `LessonDetail`, `DanglingRefsReport` etc. | `artifacts.ts` |
| `DocumentScopesService` | `document-scopes.ts` |
| `MemoryService` (server-side, with studentId params) | `memory.ts` |
| `LibraryService` + `NoteLibraryHit`, `FlashcardLibraryHit`, `LibraryHit`, `LibrarySearchInput` | new `library-service.ts` |
| `LockService` + supporting types | new `lock-service.ts` |
| `AuthoringService` + `FragmentOverride` | new `authoring-service.ts` |
| `CourseStateReader` + `CourseStateSnapshot`, `VisibilityWindow`, `ConceptStateRow` | new `course-state.ts` |
| `CourseCreateService` + `DraftIssue` | new `course-create-service.ts` |
| `VisionService` | new `vision.ts` (also drop the workaround comment about "imported from @praxis/core/services would violate dependency direction" — the new file is in `core/types/`, not `core/services/`, so the reason for the inline copy goes away) |

**Stays in tool.ts** (the genuine tool API surface — ~250 LoC after extraction):
- `ToolDefinition<I, O>`
- `ToolContext`
- `ToolServices` (the aggregate that holds references to all the per-service interfaces — its body just imports each `*Service` from its new home)
- `EffectKind`

**Barrel update**:
Replace the `export type * from "./tool.js"` wildcard with explicit per-file re-exports for each new file. Existing exports for `tool.ts`'s remaining surface (`ToolDefinition`, `ToolContext`, `EffectKind`, `ToolServices`) continue via `export type * from "./tool.js"`. New files get added:

```ts
// in index.ts
export type * from "./tool.js";                    // ToolDefinition, ToolContext, ToolServices, EffectKind
export type * from "./library-service.ts";        // LibraryService + supporting types
export type * from "./lock-service.ts";           // LockService
export type * from "./authoring-service.ts";      // AuthoringService + FragmentOverride
export type * from "./course-state.ts";           // CourseStateReader + supporting
export type * from "./course-create-service.ts";  // CourseCreateService + DraftIssue
export type * from "./vision.ts";                 // VisionService
// notes.ts / flashcards.ts / artifacts.ts / document-scopes.ts / memory.ts
// already exported via `export type *` — the new contents flow through.
```

**Implementation notes**:
- Use `git mv` semantics implicitly via `Edit` (cut from source, paste to destination, no actual `git mv`).
- For each interface moved, also move its supporting types that aren't already in the destination file.
- Each destination file's imports may shrink (no longer needs to import a type from `./tool.js` that's now defined locally).
- The agent should run `pnpm typecheck` after each major group of moves (e.g., after `notes.ts`, then after `flashcards.ts`, etc.) to catch typing issues incrementally rather than at the end.
- The `ToolServices` aggregate type at the bottom of tool.ts needs to import each `*Service` from its new home. Verify the type still composes correctly.
- The barrel's existing `export type * from "./notes.js"` etc. now picks up the moved service interfaces automatically — no per-name additions needed for the existing-file destinations.

**Acceptance criteria**:
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green from repo root (baseline preserved)
- [ ] `wc -l packages/core/src/types/tool.ts` < 350
- [ ] Every previously-exported symbol from `@praxis/core/types` is still exported (verify by grepping consumers — no new "Cannot find name" errors anywhere)
- [ ] No consumer in `packages/{engines,tools,memory,artifacts,curriculum,ui,desktop,client}/` needs an import-path update
- [ ] `MemoryService` server-side now lives in `memory.ts`; the client-side `MemoryClientService` alias in the barrel continues to work (still re-exports from `client.ts` until Step 2 lands)

**Risk**: Low — type-only. Diff is large but mechanically uniform.
**Rollback**: `git revert <commit>` — clean single commit reverts every move.

---

### Step 2: Move client.ts API interfaces to their domain homes
**Priority**: Medium
**Risk**: Low (type-only; barrel preserves public surface)
**Files**:
- `packages/core/src/types/client.ts` (extract from)
- Existing destinations: `notes.ts`, `flashcards.ts`, `artifacts.ts`, etc. (for `*Client` APIs that match the data-type files)
- New destinations: per-domain client files where no existing file fits
- `index.ts` (barrel re-exports — both the explicit list at line 30-47 and any new per-file re-exports)
**Story**: `refactor-split-core-type-files-tool-and-client-step-2-client`
**Depends on**: `refactor-split-core-type-files-tool-and-client-step-1-tool`

**Destination map** (verify by reading client.ts during implementation):

| Client API | Destination |
|---|---|
| `NotesClient` | `notes.ts` (alongside `NotesService` now) |
| `FlashcardsClient` | `flashcards.ts` |
| `ArtifactsClientSurface` + `ProgressSnapshot`, `PackSummaryClient`, `ImportedPackClient`, `PacksClient` | `artifacts.ts` (or new `artifacts-client.ts` if artifacts.ts grows too large after both server + client land — judgment call) |
| `MemoryService` (client-side, no studentId) → re-aliased as `MemoryClientService` in barrel | new `client-memory.ts` (avoid name collision in `memory.ts`) |
| `ConfigService` + `EngineConfigSnapshot`, `CourseCreateConfigSnapshot` | new `config-service.ts` |
| `SessionService` + `SessionHandle`, `SessionEndSummary`, `SessionSummary`, `BootstrapOpts`, `CreateCourseInput`, `FileRef` | new `session-client.ts` |
| `AssignmentsClient` | new `assignments-client.ts` (or merge with artifacts) |
| `AuthoringClient` | new `authoring-client.ts` |
| `LockClient` | `lock-service.ts` (alongside `LockService`) |
| `IngestionClient` + `DocumentSummary`, `DocumentDetail` | `ingestion.ts` (verify file exists) |
| `QuickCheckClientApi` | `quick-check.ts` |
| `SubAgentClientApi` | `subagent.ts` |
| `TabsClientApi` | `tabs.ts` |
| `SketchClientApi` | `sketches.ts` |
| `ConceptMapClientApi` | `concept-map-service.ts` (alongside the server-side `ConceptMapService`) |
| `DocumentScopesClientApi` | `document-scopes.ts` |
| `ShellClient` | new `shell-client.ts` |
| `RecommendationsClientApi` | `recommendation.ts` |
| `UpdateClientApi` | new `update-client.ts` |
| `CitationsClientApi` | `citation.ts` |
| `DocumentsClient` | `ingestion.ts` (or new `documents-client.ts`)|
| `LibraryClientApi` | `library-service.ts` (alongside `LibraryService`) |
| `ActivityClient` | `activity.ts` |

**Stays in client.ts** (~150 LoC after extraction):
- `PraxisClient` aggregate interface (its body just composes references to each `*Client*` API from their new homes)

**Barrel update**:
Replace the explicit `export type { ... } from "./client.js"` block at lines 14-47 with per-file re-exports. The `MemoryService as MemoryClientService` alias in particular needs careful handling — it stays in the barrel but the source moves to `client-memory.ts`:

```ts
export type { MemoryService as MemoryClientService } from "./client-memory.js";
```

**Implementation notes**:
- The barrel's existing per-file re-exports (`export type * from "./notes.js"`, etc.) auto-pick up moved client interfaces from those destinations.
- Some destinations are shared with Step 1 (e.g., `notes.ts` now holds BOTH `NotesService` and `NotesClient`). That's fine — they're related types in the same domain. Just append.
- After Step 1, `tool.ts` and `client.ts` should look comparable: each is a thin aggregate (`ToolServices` / `PraxisClient`) that composes references to per-domain interfaces.

**Acceptance criteria**:
- [ ] Typecheck/lint/test green (baseline preserved)
- [ ] `wc -l packages/core/src/types/client.ts` < 200
- [ ] Every previously-exported symbol from `@praxis/core/types` still exported
- [ ] No consumer needs an import-path update
- [ ] `MemoryService` server-side (memory.ts) and `MemoryClientService` alias (re-exporting from client-memory.ts) both work

**Risk**: Low — same shape as Step 1.
**Rollback**: `git revert <commit>` — clean.

---

## Implementation Order

1. Step 1 (`refactor-split-core-type-files-tool-and-client-step-1-tool`) — no deps
2. Step 2 (`refactor-split-core-type-files-tool-and-client-step-2-client`) — depends on Step 1 (both touch the barrel; serializing avoids merge friction)

## Atomic-step acknowledgments

None. Type-only moves; barrel preserves public surface; both steps fully reversible.

## Out-of-scope follow-ups

- Renaming any type. Scope is structural, not nominal.
- Changing what's exported. Public surface preserved exactly.
- Moving the supporting tests in `__tests__/`. Tests stay where they are; their imports update only if the moved types' imports break (unlikely since they come through the barrel).
