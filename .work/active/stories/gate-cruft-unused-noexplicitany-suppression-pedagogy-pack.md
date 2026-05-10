---
id: gate-cruft-unused-noexplicitany-suppression-pedagogy-pack
kind: story
stage: implementing
tags: [cleanup]
parent: feature-release-v0.1.0-cruft-findings
depends_on: []
release_binding: v0.1.0
gate_origin: cruft
created: 2026-05-10
updated: 2026-05-10
---

# Unused `noExplicitAny` suppression in pedagogy-pack-service.ts

## Confidence
High

## Category
stale comment

## Location
`packages/curriculum/src/pedagogy/pedagogy-pack-service.ts:125`

## Evidence

```ts
// The Zod schema validates structure; branded ids (StrategyId, TechniqueId)
// are nominal wrappers over string — safe to cast here because the schema
// already enforced the string constraint.
// biome-ignore lint/suspicious/noExplicitAny: Zod output→PedagogyPack brand cast  ← line 125, unused
return result.data as unknown as PedagogyPack;
```

The cast on line 126 is `as unknown as PedagogyPack` — there is no `any`
for the suppression to apply to. Biome flagged it as `suppressions/unused`.

## Removal

- Delete line 125 only (the `// biome-ignore lint/suspicious/noExplicitAny:` comment).
- Keep the explanatory comment on lines 122-124 — it's still useful
  context for the `as unknown as` cast.
- Keep line 126 unchanged.
