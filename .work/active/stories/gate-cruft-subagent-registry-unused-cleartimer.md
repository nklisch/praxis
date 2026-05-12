---
id: gate-cruft-subagent-registry-unused-cleartimer
kind: story
stage: review
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: cruft
created: 2026-05-12
updated: 2026-05-12
---

# Unused private member `clearTimer` in `SubAgentRegistryImpl`

## Confidence
High

## Category
dead function

## Location
`packages/core/src/services/subagent-registry.ts:57`

## Evidence
```ts
// Line 57:
private readonly clearTimer: typeof globalThis.clearTimeout;
// Line 65 (constructor):
this.clearTimer = deps.clearTimeout ?? globalThis.clearTimeout;
// No other references in file. Biome flags as noUnusedPrivateClassMembers.
```

## Removal
Delete the `clearTimer` field (line 57) and its initialization (line 65). If the `deps.clearTimeout` injection seam was added speculatively for tests but no test uses it, also drop `clearTimeout?` from the `SubAgentRegistryDeps` interface (lines 24-25) — verify no test wires it before removing the dep slot.

## Implementation notes
Inline cruft cleanup applied as part of the v0.1.1 autopilot batch.
