---
id: gate-cruft-library-handle-use-pack-pack-name-unused
kind: story
stage: drafting
tags: [cleanup, ui]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: cruft
created: 2026-05-23
updated: 2026-05-23
---

# `_packName` parameter in `handleUsePack` is unused — interface forces a value the consumer doesn't want

## Confidence
Medium

## Category
dead function parameter / over-abstraction

## Location
`packages/ui/src/routes/library.tsx:73`

## Evidence
```ts
const handleUsePack = useCallback(
  async (packId: string, _packName: string) => {
    setImporting(packId);
    ...
```

## Verification
`PacksSection.onUsePack` (`packs-section.tsx:14`) is declared
`(packId: string, packName: string) => void` and the call site
(`packs-section.tsx:51`) always passes `pack.name`. No consumer of the
second arg in the bundle; the `_` prefix is the smoking gun.

Downgraded from High to Medium because removing it requires touching
`packs-section.tsx` (outside the bundle's strict scope, but the field
flows through).

## Removal
Either:
- Consume `packName` (e.g. for analytics/error copy), or
- Narrow `PacksSection.onUsePack` to `(packId: string) => void` and
  drop the second arg here. Touches one file beyond the bundle.
