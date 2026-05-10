---
id: gate-docs-contract-phase17-18-19-sections
kind: story
stage: done
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# CONTRACT.md ends at Phase 16 — Phase 17, 18, 19 contract changes are absent

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CONTRACT.md:1177` (last `## Phase 16 additive changes`
  section); the file ends at line 1280 with no Phase 17/18/19 sections.
- Code:
  - `packages/core/src/types/draft-stream.ts`
  - `packages/curriculum/src/pedagogy/pedagogy-pack-service.ts:39`
  - `packages/core/src/services/update-service.ts`
  - `packages/client/src/services/update-client.ts`
  - `packages/client/src/services/drafts-client.ts`
  - `packages/core/src/config/onboarding-config.ts`
  - `packages/curriculum/src/modes/study-skills.ts`

## Current doc text
> Last additive section is `## Phase 16 additive changes`;
> PedagogyPackService is referenced in toolServices on line 228 but its
> interface is never declared in the document.

## Reality
Several v0.1.0 surfaces are entirely undocumented in the cross-package
type contract:
- `PedagogyPackService` interface (Phase 18) — reads strategies,
  techniques, metacognitive prompts; injected at
  `ServiceDeps.toolServices.pedagogyPack`.
- `DraftStreamClient` and `DraftStreamEvent` (bootstrap-drafts-streaming)
  — exposed as `PraxisClient.drafts.events()`, channel
  `praxis.bootstrap.drafts.events.*`.
- `UpdateClientApi` and `UpdateCheckResult` (Phase 19 auto-update) —
  exposed as `PraxisClient.update.checkLatest()`, channel
  `praxis.update.checkLatest`.
- `OnboardingConfig` (Phase 19 first-run) — stored in `config_kv`,
  signals first-run completion.
- `study-skills` mode definition.
- New procedural / affective indexer surfaces (e.g.,
  `proceduralStrategies` schema, `affectiveSamples.source`
  discriminator).

## Required edit
Add `## Phase 17 additive changes`, `## Phase 18 additive changes`, and
`## Phase 19 additive changes` sections matching the pattern used for
Phases 10–16. Each should declare the new interfaces
(`PedagogyPackService`, `DraftStreamClient`, `UpdateClientApi`,
`OnboardingConfig` shape), new mode (`study-skills`), and new IPC
channel families (`praxis.bootstrap.drafts.events.*`,
`praxis.update.*`). Surface the new tool families (`pedagogy.*`,
`quick_check.*`) in the New tools table at the bottom.

## Implementation notes

Added ~280 lines to `docs/CONTRACT.md` across three new phase sections. Documented 14 surfaces total: `AssignmentItem` union (10 kinds), `QuickCheckService`/`QuickCheckClientApi`, `PedagogyPackService`, `study-skills` mode, metacognitive-prompts fragment, `AffectiveIndexer`/`ProceduralIndexer` schema tables, `RouterInput`/`RouterSuggestion` Phase 18 additions, `UpdateService`/`UpdateClientApi`/`UpdateCheckResult`, `OnboardingConfig`, `DraftStreamClient`/`DraftStreamEvent`, and biology canonical pack. All type signatures drawn directly from source files.

## Review (2026-05-10)

Read all three new sections in full (~340 LoC). Findings:

**Phase 17**: `AssignmentItem` expansion is accurate — 4 new kinds shown (Numerical, Matching, Ordering, TwoTier) plus the full 10-kind union. The note about `single-choice` being renamed from `multiple-choice` with a Drizzle migration is factually accurate. `QuickCheckService.await()` signature and `QuickCheckClientApi` match the source. IPC channel family naming (`praxis.quickCheck.*`) follows the established convention. New-tools table is accurate for Phase 17.

**Phase 18**: `PedagogyPackService` interface is correctly declared as synchronous accessors with empty-pack fallbacks. The `study-skills` mode description is accurate (tool set matches `study-skills.ts:25-49`; correctly notes `quick_check.matching` is excluded; correctly notes metacognitive-prompts fragment is excluded). The `MetacognitivePromptTrigger` union and which modes include/exclude the fragment are accurate. Affective and procedural indexer schema comments describe the tables correctly (milli-units, composite PK for procedural, `source` discriminator for affective). `RouterInput`/`RouterSuggestion` additions match the Phase 18 requirement descriptions.

**Phase 19**: `UpdateCheckResult` discriminated union, `UpdateFeed`, and `UpdateService`/`UpdateClientApi` signatures look correct. `OnboardingConfig` shape (`firstRunCompletedAt: string | null`) and storage key (`"onboarding"`) are accurate. `DraftStreamEvent` discriminated union with `snapshot`-first semantics is correctly described. Biology canonical pack reference is minimal and accurate.

**Cross-doc coherence**: The Phase 17 new-tools table lists study-skills as a mode for `quick_check.*` tools — this is correct, study-skills was added in Phase 18 but the contract table is documenting availability, not introduction order. Consistent with CURRICULUM.md's tool lists.

No "previously" prose or "planned" tags introduced. Rolling-foundation principle respected. No blockers. This is the most substantive piece of writing in the batch and it's accurate. Approve.
