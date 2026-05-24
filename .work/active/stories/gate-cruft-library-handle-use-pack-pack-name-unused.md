---
id: gate-cruft-library-handle-use-pack-pack-name-unused
kind: story
stage: done
tags: [cleanup, ui]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: cruft
created: 2026-05-23
updated: 2026-05-24
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

## Implementation notes

Chose **Option B**: narrow the interface to `(packId: string) => void`.

Rationale: `library.tsx` is the only consumer of `PacksSection`, so the blast radius is zero outside these two files. Passing `packName` through the prop boundary when nothing uses it is dead data flow — if a future caller needs the name, it can always be recovered from the pack list (already in scope) or added back then. The clean interface is strictly preferable.

Changes applied:
- `packages/ui/src/components/library/packs-section.tsx`: `onUsePack` prop type narrowed to `(packId: string) => void`; call site drops `pack.name` argument.
- `packages/ui/src/routes/library.tsx`: `handleUsePack` signature changed from `(packId: string, _packName: string)` to `(packId: string)`.
- `packages/ui/src/__tests__/packs-section.test.tsx`: updated helper type and assertion to match new signature.

All 1709 `@praxis/ui` tests pass; `pnpm typecheck` clean.

## Review

**Verdict: approved → done**

Implementation is clean. Option B (narrow interface) was the correct call — `library.tsx` is the sole consumer of `PacksSection`, so the blast radius is zero. All three files are consistently updated:

- `packs-section.tsx`: prop type narrowed to `(packId: string) => void`; call site drops `pack.name`.
- `library.tsx`: `handleUsePack` parameter list trimmed; no `_packName` remnant.
- `packs-section.test.tsx`: helper type and assertion updated to match; test description updated to "with packId only".

No `_packName` or two-argument form found anywhere in `packages/ui/src/`. No blockers or nits.
