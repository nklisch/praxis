---
id: gate-docs-architecture-core-services-additions
kind: story
stage: review
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# ARCHITECTURE.md "Where the big pieces live" doesn't name `SqliteDraftStore`, `PromptCustomizationServiceImpl`, `SubAgentRegistry`, `UpdateServiceImpl + verifier`, `SecretStorage`/`ElectronSafeStorageAdapter`

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/ARCHITECTURE.md:44-60` (Components table)
- Code: `packages/core/src/services/draft-store.ts`, `packages/core/src/services/prompt-customization-service.ts`, `packages/core/src/services/subagent-registry.ts`, `packages/core/src/services/update-service.ts`, `packages/core/src/services/update-feed-public-key.ts`, `packages/desktop/electron/main/secret-storage.ts`

## Current doc text
The Components table lists each package's responsibility at a high level; ARCHITECTURE.md has no detailed enumeration of subsystems within `@praxis/core/services`.

## Reality
Five new services landed in v0.1.1 but the doc is silent on them. The package-level Components table is technically still correct (the responsibility hasn't changed), but the doc names none of the new subsystems.

## Required edit
Expand `@praxis/core`'s row to mention "draft persistence (SqliteDraftStore), prompt customization, sub-agent registry, signed update verifier" alongside the existing "ingestion `Ingestor` port + per-format adapters"; expand `@praxis/desktop`'s row to mention "at-rest secret storage via `ElectronSafeStorageAdapter`". (Aligns with rolling-foundation by editing the existing line, not appending "additions in v0.1.1".)

## Implementation notes
Edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Rolling-foundation discipline: stale assertions replaced in place; no "previously" prose.
