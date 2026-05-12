---
id: gate-cruft-engine-config-orphan-comment
kind: story
stage: drafting
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: cruft
created: 2026-05-12
updated: 2026-05-12
---

# Orphan comment block in `readEngineConfig` describes code that doesn't exist

## Confidence
Medium

## Category
stale comment

## Location
`packages/core/src/config/engine-config.ts:94-96`

## Evidence
```ts
// Line 86-93: build inMemoryStored, delete apiKeyEncrypted
const inMemoryStored: Partial<EngineConfig> = stored
  ? { ...stored, ...(resolvedApiKey !== undefined && { apiKey: resolvedApiKey }) }
  : {};
delete inMemoryStored.apiKeyEncrypted;
// Line 94-96 — comment describes an action that has no corresponding code:
// If we are on the legacy plaintext path without safeStorage, clear apiKey
// from the stored spread so we re-derive it from resolvedApiKey above. This
// avoids a double-assignment that is harmless but confusing.

// Line 98: actual next step
const merged: EngineConfig = EngineConfigSchema.parse({ ... });
```
No code between line 96 and line 98 implements what the comment describes. The operation was removed during cleanup; the comment was left behind.

## Removal
Delete lines 94-96.
