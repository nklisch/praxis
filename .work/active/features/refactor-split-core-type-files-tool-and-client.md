---
id: refactor-split-core-type-files-tool-and-client
kind: feature
stage: drafting
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
