---
id: story-pptx-slide-image-map-dead-fallback
kind: story
stage: implementing
tags: [ingestion, cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# Fix: dead-code fallback in PPTX slide-image map

## Brief

`buildSlideImageNamesMap` in
`packages/tools/src/runtime/ingestion/pptx-ingestor.ts:174-185` stores entries
under `slideNumber ?? idx` (the array index) when a slide node is missing
`metadata.slideNumber`. But the lookup site in `tryChunkBySlide` at line 259
only ever looks up by `slideNumber`:

```typescript
const imageNames = slideNumber !== undefined ? slideImageNames.get(slideNumber) : undefined;
```

So any slide whose `slideNumber` is undefined has its image correlation
silently dropped. The fallback branch is dead — it produces map entries
nothing reads. In practice officeparser v6 always emits `slideNumber` for
PPTX, so this is edge-case hygiene, not a known-failing bug. But dead code
is misleading; the next reader will think the fallback "does something" and
either copy the pattern or leave a subtle inconsistency.

Discovered during review of `feature-powerpoint-ingestion`.

## Choice

Pick one of two fixes. The implementer's call:

**(a) Drop the fallback (fail loud).** Skip slides without a numeric
`slideNumber`. If officeparser ever stops emitting it, image correlation
becomes visibly absent (caller still sees text chunks, just no
`imageNames`), which is fine — it's an honest signal that the AST shape
changed.

```typescript
nodes.forEach((node) => {
  if (node.type !== "slide") return;
  if (typeof node.metadata?.slideNumber !== "number") return;
  const names = collectImageNames(node.children ?? []);
  if (names.length > 0) {
    result.set(node.metadata.slideNumber, names);
  }
});
```

**(b) Propagate the fallback symmetrically.** Make the lookup use the same
`slideNumber ?? idx` key. Both sides agree, edge case is handled coherently.

```typescript
// In tryChunkBySlide, after filtering slideNodes:
slideNodes.forEach((slide, idx) => {
  const slideNumber =
    typeof slide.metadata?.slideNumber === "number" ? slide.metadata.slideNumber : undefined;
  const imageKey = slideNumber ?? idx;
  const imageNames = slideImageNames.get(imageKey);
  // …rest of the per-slide handling, using slideNumber for page/section
  //    labels and imageKey for the map lookup.
});
```

Default to (a). The dead branch suggests it was written defensively without
the lookup site catching up; fail-loud is the more honest fix and fewer
moving parts. Pick (b) only if there's a known case where slideNumber is
absent and image correlation still matters — verify with the real fixture
at `__tests__/fixtures/sample.pptx` before committing.

## Acceptance criteria

- [ ] `buildSlideImageNamesMap` and `tryChunkBySlide` agree on the key
      shape. No path stores a key the other path can't read.
- [ ] One mock-AST test case exercises the slide-without-slideNumber
      scenario (e.g. a malformed slide node), asserting the chosen
      behavior — either "image correlation is absent" (option a) or "image
      correlation works via index" (option b). Document which option you
      picked in implementation notes.
- [ ] Real-fixture integration test
      (`pptx-ingestor-integration.test.ts`) continues to pass — the
      change is a refinement, not a behavior shift on well-formed input.
- [ ] `pnpm --filter @praxis/tools typecheck && pnpm --filter @praxis/tools test` green.

## Out of scope

- Broader cleanup of `OfficeNodeLike`'s `metadata: any` typing. The
  discriminated-union shape from officeparser doesn't lend itself to a
  shared index signature; the `any` with `biome-ignore` is intentional.
- Renaming any of the helper functions. Names are fine; the dead branch is
  the issue.
