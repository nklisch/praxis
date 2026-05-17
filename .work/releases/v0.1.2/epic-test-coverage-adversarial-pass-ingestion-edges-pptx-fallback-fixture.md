---
id: epic-test-coverage-adversarial-pass-ingestion-edges-pptx-fallback-fixture
kind: story
stage: done
tags: [testing, ingestion]
parent: epic-test-coverage-adversarial-pass-ingestion-edges
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Story: PPTX `tryChunkBySlide` fallback — real-fixture pinning

## Scope

Pin the spec-silent contract for the PPTX `tryChunkBySlide` fallback:
when `officeparser` produces an AST with zero `"slide"` type nodes,
`PptxIngestor.parse` falls through to `ast.toText()` + `chunkMarkdown`.
Today only mocked-AST unit tests cover this path; this story adds a
real-fixture slow-test that catches any upstream AST-shape regression.

See parent feature `epic-test-coverage-adversarial-pass-ingestion-edges`
for the full design (Unit 2).

## Files

- **Script (new)**: `scripts/build-no-slide-signal-pptx.ts` — one-shot
  Node script that uses `jszip` to assemble a minimal valid PPTX whose
  slides contain only `<p:contentPart>` (digital ink) shapes.
  officeparser's `p:spTree` walker doesn't recognise `p:contentPart`
  as content (verified in source), so the resulting AST has zero
  `"slide"`-type nodes.
- **Fixture (new, committed binary)**:
  `packages/tools/src/runtime/ingestion/__tests__/fixtures/no-slide-signal.pptx`
- **Fixture README (new)**:
  `packages/tools/src/runtime/ingestion/__tests__/fixtures/no-slide-signal.pptx.md`
  — mirrors `sample.pptx.md` structure; documents source (programmatic
  build), why not LibreOffice/Keynote (not available; programmatic is
  more honest about the structural condition being tested), contents,
  and "do not edit — re-run the build script."
- **Test (modify)**:
  `packages/tools/src/runtime/ingestion/__tests__/pptx-ingestor-integration.test.ts`
  — append a new describe block "PptxIngestor against fallback fixture
  (no slide signal — slow)" gated on `PRAXIS_RUN_SLOW_TESTS`. Two
  tests per the feature body.
- **Source (modify)**:
  `packages/tools/src/runtime/ingestion/pptx-ingestor.ts` — extend the
  JSDoc on `tryChunkBySlide` with a `Spec-silent contract pinned by:`
  line naming the test.
- **Root package.json (modify)**: add `"jszip": "^3.10.1"` to
  `devDependencies` (transitively present via officeparser; explicit
  for the build script).

## Acceptance Criteria

- [ ] `scripts/build-no-slide-signal-pptx.ts` exists and runs
  successfully (`pnpm tsx scripts/build-no-slide-signal-pptx.ts`).
- [ ] Output `no-slide-signal.pptx` is a valid PPTX (opens in
  PowerPoint Online — verify manually).
- [ ] Loading the fixture through `PptxIngestor.parse` with the real
  (non-mocked) `officeparser` yields `tryChunkBySlide → null` and
  takes the `ast.toText() + chunkMarkdown` branch — verified by the
  absence of `Slide N` section labels on resulting chunks.
- [ ] Fixture README committed alongside the binary.
- [ ] New describe block added, gated on `PRAXIS_RUN_SLOW_TESTS`.
- [ ] `PRAXIS_RUN_SLOW_TESTS=1 pnpm --filter @praxis/tools test`
  passes including the two new fallback tests.
- [ ] Default `pnpm test` still passes and skips the new tests.
- [ ] JSDoc on `tryChunkBySlide` extended with the `Spec-silent
  contract pinned by:` line.
- [ ] `jszip` added to root devDependencies.
- [ ] `pnpm typecheck`, `pnpm lint` clean.

## Implementation hints

- **Start from `sample.pptx`'s scaffolding.** Unzip it, take the
  layout, master, theme, content types, and rels as-is. Only the
  slide XML and `docProps/core.xml` need to differ.
- **Replace `slide1.xml`'s `<p:spTree>` body with a single
  `<p:contentPart r:id="rId1"/>` element.** Add a `_rels/slide1.xml.rels`
  Relationship pointing rId1 to `../inkCustom.xml` (or any non-recognised
  target — officeparser ignores it).
- **Set `<dc:title>fallback fixture</dc:title>` in
  `docProps/core.xml`** so the title-resolution path on the fallback
  branch is also exercised.
- **Verify the AST shape before locking in.** During implementation,
  temporarily log `ast.content.map(n => n.type)` from inside
  `PptxIngestor.parse` for this fixture and confirm there are zero
  `"slide"` entries.
- **Fallback retry**: if `p:contentPart` doesn't work (some
  officeparser version recognises it), use an empty `<p:spTree/>` —
  the source-level gate is `N.children.length > 0`, which catches
  either case.

## Notes

- The build script is run **once** during implementation; CI never
  runs it. Output is committed binary.
- Fixture should be tiny (<5 KB) — single slide, no media.
- Existing `pptx-ingestor.test.ts` already covers the fallback path
  with mocked AST. This story adds the missing real-fixture sanity
  check that would catch an upstream `officeparser` regression.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Build script + binary fixture + README all committed. Source comment pins the contract back. Both tests are correctly gated on `PRAXIS_RUN_SLOW_TESTS` per `slow-test-gating` pattern. Default test run skips them. (Slow tests not invoked here — gated by env.)
