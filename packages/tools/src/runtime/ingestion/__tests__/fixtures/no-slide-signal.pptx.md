# `no-slide-signal.pptx` — fallback-path test fixture

## Source

Built programmatically by `scripts/build-no-slide-signal-pptx.ts`.

A real, valid PPTX (opens in PowerPoint Online; passes OOXML schema
validation) whose single slide contains only `<p:contentPart>` (digital ink)
shapes. officeparser's `p:spTree` walker doesn't recognise `p:contentPart`
as content, so the resulting AST has zero `"slide"` type nodes —
exercising the `tryChunkBySlide` → `ast.toText() + chunkMarkdown`
fallback in `PptxIngestor`.

## Why not export from LibreOffice / Keynote

The preferred sourcing path was export-from-real-tool. LibreOffice and
Keynote are not available on the build machine; adding either as a build
dependency for one fixture is heavyweight. Programmatic construction is
in fact more honest here — it targets the structural condition (zero
`"slide"` nodes from `ast.content`) directly rather than relying on an
exporter quirk that could change.

## Contents

- 1 slide with `<p:contentPart>` only (no text, no images)
- `<dc:title>fallback fixture</dc:title>` in `docProps/core.xml`
- Standard PPTX scaffolding (content types, rels, layouts, master) copied
  from `sample.pptx`

## Use in tests

Only the slow integration test reads this fixture
(`pptx-ingestor-integration.test.ts`, `describe.skipIf` gated on
`PRAXIS_RUN_SLOW_TESTS`). The mock-AST unit tests in
`pptx-ingestor.test.ts` already cover the fallback branch with a
synthetic flat AST.

## Do not edit

Re-run `scripts/build-no-slide-signal-pptx.ts` to regenerate if the
contract changes.
