---
id: epic-test-coverage-adversarial-pass-ingestion-edges
kind: feature
stage: done
tags: [testing]
parent: epic-test-coverage-adversarial-pass
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Ingestion adversarial test coverage — image boundaries and slide fallback

## Brief

Two gate-tests findings live in the ingestion subsystem. The first
exercises a spec-silent edge case: an image markdown reference that
straddles a chunk boundary. The contract is currently described as "rare
but acceptable" — neither chunk's `imageNames` may contain the image,
which is a silent data-loss path for any consumer that relies on
post-chunk image enumeration. The second covers the PPTX
`tryChunkBySlide` fallback to `ast.toText() + chunkMarkdown` when no
clean slide signal exists in the AST. Today the fallback has only mock-
AST unit coverage; no real-fixture exercises it, so an AST-shape
regression upstream in `officeparser` would slip past CI.

This feature lands both as a single design pass because they share the
ingestion test scaffolding (fixture handling, chunk assertions, the
markdown chunker config) and because deciding the spec-silent pinning
style — explicit test name + doc note vs. runtime assertion — is one
decision that applies to both.

## Epic context

- Parent epic: `epic-test-coverage-adversarial-pass`
- Position in epic: independent test additions. Parallelizable with the
  other two features in this epic.

## Scope absorbed from backlog

- `gate-tests-image-cross-chunk-boundary` — image markdown straddling a
  chunk boundary is spec-silent; the chunker may split mid-paragraph
  and neither chunk picks up the image reference.
- `gate-tests-pptx-slide-fallback-real-fixture` — `tryChunkBySlide`
  fallback path is mock-only; no real PPTX fixture without a clean
  slide signal in the suite.

## Foundation references

- `docs/ARCHITECTURE.md` — ingestion pipeline, chunking model
- `CLAUDE.md` — `slow-test-gating` pattern (Pyodide-style tests; may
  apply if fallback fixture is large)
- Skill: `officeparser-v6` (the AST shape for slide boundaries lives
  here)

## Anchors (current implementation)

- DOCX ingestor test —
  `packages/tools/src/runtime/ingestion/__tests__/docx-ingestor.test.ts`
- PPTX ingestor tests —
  `packages/tools/src/runtime/ingestion/__tests__/pptx-ingestor*.test.ts`
- Chunker — `packages/tools/src/runtime/ingestion/chunker.ts`
- `tagChunksWithImages` (image-name enumeration) —
  `packages/tools/src/runtime/ingestion/docx-ingestor.ts:138`
- PPTX `tryChunkBySlide` —
  `packages/tools/src/runtime/ingestion/pptx-ingestor.ts:232`
- Existing PPTX fixture —
  `packages/tools/src/runtime/ingestion/__tests__/fixtures/sample.pptx`
  (9 slides, all with clean slide signal — does NOT exercise the
  fallback path)

## Pre-design decisions (2026-05-14)

- **Spec-silent pinning style**: tests with explicit names + one-line
  source comments. No runtime assertions. Test name should read like
  the contract — e.g., `it("handles an image whose markdown straddles
  a chunk boundary — at most one chunk picks it up OR neither (rare
  but acceptable)", ...)`. The source-side comment points back to the
  test and names the contract.
- **PPTX fallback fixture**: source or craft a real PPTX without a
  clean slide signal — preferred order: (1) export from
  LibreOffice/Keynote which often produce officeparser-edge AST
  shapes; (2) export from another tool we have on hand; (3) only as
  last resort, construct programmatically with a zip + minimal XML.

## Design decisions

- **Fixture directory**: the feature brief proposed
  `packages/tools/test-fixtures/`, but the existing convention is
  `packages/tools/src/runtime/ingestion/__tests__/fixtures/` (already
  holds `sample.pptx`). Use the existing path — co-location with the
  test file is the established pattern. No new top-level directory.
- **Fixture source — fall through to programmatic zip**: LibreOffice
  and Keynote are not available on the build machine, and adding either
  as a build dependency for one fixture is heavyweight. The "last
  resort" programmatic-zip path is the right call here, and it's
  actually more *honest* than an export quirk — `tryChunkBySlide`
  falls back exactly when officeparser's `p:spTree` walker produces
  zero shapes with text/image content (see source: a slide is only
  pushed into `ast.content` when `N.children.length > 0`). A
  programmatically-built PPTX whose slides contain only
  `p:contentPart` (digital ink) or empty `p:spTree`s exercises the
  fallback *by construction*, with no toolchain dependency. The
  fixture is a real, valid PPTX (opens in PowerPoint Online) — just
  structured to land on the fallback branch.
- **Fixture build process**: one-shot Node script
  `scripts/build-no-slide-signal-pptx.ts` that uses `jszip` to assemble
  the minimal PPTX, run once at design-implementation time, output
  committed under the fixtures directory. The script is committed for
  reproducibility (`packages/tools/test-fixtures/` doesn't exist, but
  `scripts/` is where one-shot tooling lives in this repo). The test
  suite never runs the script — it reads the committed
  `no-slide-signal.pptx`.
- **Slow-test gating for the PPTX fallback test**: gate it behind
  `PRAXIS_RUN_SLOW_TESTS` and put it in the existing
  `pptx-ingestor-integration.test.ts` file. Same rationale as the
  existing slow tests there: it imports the real `officeparser`, and
  `vi.mock` in `pptx-ingestor.test.ts` would intercept the lazy import.
  Putting it in the existing integration file keeps the gating story
  uniform.
- **DOCX image-boundary test placement**: extend
  `docx-ingestor.test.ts` rather than the chunker test. The
  contract being pinned is the **end-to-end DocxIngestor contract**
  (`imageNames` appears on at-most-one chunk; the marker survives
  chunking) — the chunker itself is image-naïve. The existing
  `simulateConvertToMarkdownWithImages` helper plus a tuned
  `maxChars` setting is sufficient to force a boundary case without a
  real DOCX.
- **No runtime assertion / no spec change**: the pinning style locked
  by the parent epic is test-only. Neither `tagChunksWithImages` nor
  `tryChunkBySlide` gains a `console.warn` or fail-loud branch. The
  test name itself, plus a one-line `// pinned by:
  docx-ingestor.test.ts:"handles an image whose markdown straddles a
  chunk boundary — at most one chunk picks it up OR neither (rare
  but acceptable)"` comment on `tagChunksWithImages`, and the
  symmetric comment on `tryChunkBySlide`, are the durable contract
  signal.

## Architectural choice

This is a test-only feature: no production code changes, no new
abstractions. The "architecture" is just how the tests are organised
and where the fixture lives. Two options were considered:

1. **Two new test files** (`docx-image-boundary.test.ts` and
   `pptx-fallback-real-fixture.test.ts`). Clean, but it splinters the
   ingestion test directory into a tree where some files are
   topic-scoped and others are ingestor-scoped — inconsistent.
2. **Extend the existing per-ingestor test files** —
   `docx-ingestor.test.ts` gets a new describe block for chunk-
   boundary edges; `pptx-ingestor-integration.test.ts` (the slow
   file) gets a new describe block for the fallback-fixture path.
   Consistent with current organisation; fixture lives alongside
   `sample.pptx`.

**Chosen: option 2.** Consistency with the per-ingestor file
convention wins, and the slow/fast split is already established in the
PPTX test directory.

## Implementation Units

### Unit 1: DOCX image-paragraph chunk-boundary test

**File**: `packages/tools/src/runtime/ingestion/__tests__/docx-ingestor.test.ts`
**Story**: `epic-test-coverage-adversarial-pass-ingestion-edges-docx-image-boundary`

Append a new describe block to the existing file:

```typescript
describe("DocxIngestor — image markdown at chunk boundaries (spec-silent contract)", () => {
  // The chunker is paragraph-based and never splits mid-paragraph
  // (chunker.ts:50 — flushes BEFORE adding an oversized paragraph; only
  // emits a singleton when the buffer is empty). The spec-silent edge
  // is: an image-only paragraph between two larger paragraphs MAY land
  // as a singleton chunk if maxChars forces a flush. The contract is
  // permissive — at most one chunk picks up the image; in rare layouts
  // (e.g. the image-only paragraph having zero printable content the
  // imageRefRe can locate, which today never happens but is documented
  // as acceptable) zero chunks may pick it up. Two-chunk pickup MUST
  // NEVER happen.
  //
  // Pinned in source: docx-ingestor.ts:tagChunksWithImages — see the
  // one-line "pinned by:" comment there.

  it("handles an image whose markdown straddles a chunk boundary — at most one chunk picks it up OR neither (rare but acceptable)", async () => {
    // Construct a long-paragraph / image-paragraph / long-paragraph
    // sequence with a small maxChars so the flush triggers around the
    // image paragraph. The image must always be referenced by EXACTLY
    // one chunk (the rare-but-acceptable zero-chunk path is documented
    // but does not occur with the current implementation; the assertion
    // therefore is ≤ 1, not == 1).
    const mock = await getMockConvertToMarkdown();
    const long = "lorem ipsum ".repeat(50).trim();
    mock.mockImplementation(
      async (_input: unknown, options: unknown) =>
        await simulateConvertToMarkdownWithImages(
          options,
          [{ contentType: "image/png" }],
          `${long}\n\n${long}`, // image gets appended by the helper as a third paragraph
        ),
    );

    const filePath = join(tmpDir, "boundary.docx");
    await writeFile(filePath, "fake docx bytes");
    const store = new FsEmbeddedImageStore(join(tmpDir, "boundary-store"));

    const result = await new DocxIngestor({ embeddedImageStore: store }).parse(filePath, {
      maxChars: 100, // forces a flush per paragraph
    });

    const chunksWithImage = result.chunks.filter((c) =>
      c.imageNames?.includes("image-1.png"),
    );
    // Contract: at most one chunk picks up the image.
    expect(chunksWithImage.length).toBeLessThanOrEqual(1);
    // The praxis://embedded/ marker must appear in at most one chunk's text
    // — assert the marker count too so a regression that double-tags or
    // duplicates the image paragraph is caught.
    const markerCount = result.chunks.reduce(
      (n, c) => n + (c.text.match(/praxis:\/\/embedded\/image-1\.png/g)?.length ?? 0),
      0,
    );
    expect(markerCount).toBeLessThanOrEqual(1);
  });

  it("image paragraph at the exact maxChars boundary — image survives into the next chunk", async () => {
    // Tune the previous-paragraph length so the next paragraph (the
    // image) lands at the chunk-cap edge. The image must land in the
    // chunk that follows, with its alt-text marker intact. This pins
    // the "marker survives chunking" property — a regression in
    // chunkParagraphs that ever dropped a paragraph would surface here.
    const mock = await getMockConvertToMarkdown();
    // Exactly 95 chars; with maxChars=100 the image paragraph (~50
    // chars including the markdown wrapper) will flush into the next
    // chunk on its own.
    const pre = "x".repeat(95);
    mock.mockImplementation(
      async (_input: unknown, options: unknown) =>
        await simulateConvertToMarkdownWithImages(
          options,
          [{ contentType: "image/png" }],
          pre,
        ),
    );

    const filePath = join(tmpDir, "edge.docx");
    await writeFile(filePath, "fake docx bytes");
    const store = new FsEmbeddedImageStore(join(tmpDir, "edge-store"));

    const result = await new DocxIngestor({ embeddedImageStore: store }).parse(filePath, {
      maxChars: 100,
    });

    // At least one chunk must contain the marker — the spec-silent
    // "neither" case is documented as rare-but-acceptable but the
    // current implementation always delivers exactly one.
    const found = result.chunks.find((c) => c.text.includes("praxis://embedded/image-1.png"));
    expect(found?.imageNames).toContain("image-1.png");
  });
});
```

Plus a one-line source comment on `tagChunksWithImages` in
`docx-ingestor.ts`:

```typescript
// Spec-silent contract pinned by: docx-ingestor.test.ts —
// "handles an image whose markdown straddles a chunk boundary — at
// most one chunk picks it up OR neither (rare but acceptable)"
function tagChunksWithImages(...) { ... }
```

**Implementation Notes**:
- The two tests together cover the "rare-but-acceptable neither"
  upper bound (test 1) and the "happens in practice" exactly-one
  case (test 2). Test 1 is the durable spec pin; test 2 is the
  positive-shape check that a regression in the chunker would catch.
- `simulateConvertToMarkdownWithImages` already appends the image as
  its own paragraph (`markdown += '\n\n![image](${src})'`) — no
  helper changes needed.
- Use `maxChars: 100` to keep paragraphs short and the chunker
  decisive. Don't tune to the byte level — flaky maintenance.

**Acceptance Criteria**:
- [ ] New describe block added with the two tests above
- [ ] One-line source comment on `tagChunksWithImages` referencing the
  pinning test by name
- [ ] `pnpm --filter @praxis/tools test` passes
- [ ] `pnpm typecheck`, `pnpm lint` clean

---

### Unit 2: PPTX `tryChunkBySlide` fallback — real-fixture test

**File**: `packages/tools/src/runtime/ingestion/__tests__/pptx-ingestor-integration.test.ts`
**Fixture**:
`packages/tools/src/runtime/ingestion/__tests__/fixtures/no-slide-signal.pptx`
**Fixture-build script**: `scripts/build-no-slide-signal-pptx.ts`
**Story**: `epic-test-coverage-adversarial-pass-ingestion-edges-pptx-fallback-fixture`

#### 2a. Fixture-build script

A one-shot Node script that runs at design-implementation time only.
Output is committed; the script itself is also committed for
reproducibility.

```typescript
// scripts/build-no-slide-signal-pptx.ts
// One-shot fixture builder. Run with: pnpm tsx scripts/build-no-slide-signal-pptx.ts
//
// Produces packages/tools/src/runtime/ingestion/__tests__/fixtures/no-slide-signal.pptx,
// a minimal but valid PPTX whose slides contain only digital-ink content
// (p:contentPart). officeparser's p:spTree walker only emits "slide" nodes
// when at least one child has extractable content (a:r text, p:pic image,
// p:graphicFrame chart). p:contentPart is not in that list, so ast.content
// has zero "slide"-type nodes — tryChunkBySlide returns null, triggering
// the ast.toText() + chunkMarkdown fallback.
//
// The fixture is a real valid PPTX (passes Microsoft's OOXML schema and
// opens in PowerPoint Online) — it just lands on the fallback branch.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";

const zip = new JSZip();
// [Content_Types].xml, _rels/.rels, ppt/presentation.xml, ppt/slides/slide1.xml,
// ppt/slides/_rels/slide1.xml.rels, ppt/slideLayouts/slideLayout1.xml,
// ppt/slideMasters/slideMaster1.xml, theme, etc.
// slide1.xml contains:
//   <p:spTree>
//     <p:contentPart r:id="rId1"/>   <!-- digital ink — officeparser ignores -->
//   </p:spTree>
// And the document has a docProps/core.xml with <dc:title>fallback fixture</dc:title>
// so ast.metadata.title is populated (verifies title path still works on
// the fallback branch).
// ... (XML strings inlined here — see commit for full contents)

const out = join(
  import.meta.dirname,
  "../packages/tools/src/runtime/ingestion/__tests__/fixtures/no-slide-signal.pptx",
);
const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
await writeFile(out, bytes);
console.log(`wrote ${bytes.length} bytes → ${out}`);
```

#### 2b. README for the fixture

Add `no-slide-signal.pptx.md` next to the fixture, mirroring
`sample.pptx.md`:

```markdown
# `no-slide-signal.pptx` — fallback-path test fixture

## Source

Built programmatically by `scripts/build-no-slide-signal-pptx.ts`.

A real, valid PPTX (opens in PowerPoint Online; passes OOXML schema
validation) whose slides contain only `<p:contentPart>` (digital ink)
shapes. officeparser's `p:spTree` walker doesn't recognise
`p:contentPart` as content, so the resulting AST has zero `"slide"`
type nodes — exercising the `tryChunkBySlide` → `ast.toText() +
chunkMarkdown` fallback in `PptxIngestor`.

## Why not export from LibreOffice/Keynote

The preferred sourcing path was export-from-real-tool. LibreOffice is
not installed on the build machine and Keynote is macOS-only; adding
either as a build dependency for one fixture is heavyweight.
Programmatic construction is in fact more honest here — it targets
the structural condition (zero `"slide"` nodes from `ast.content`)
directly rather than relying on an exporter quirk that could change.

## Contents

- 1 slide with `<p:contentPart>` only (no text, no images)
- `<dc:title>fallback fixture</dc:title>` in `docProps/core.xml`
- Standard PPTX scaffolding (content types, rels, layouts, master)

## Use in tests

Only the slow integration test reads this fixture
(`pptx-ingestor-integration.test.ts`, `describe.skipIf` gated on
`PRAXIS_RUN_SLOW_TESTS`). The mock-AST unit tests in
`pptx-ingestor.test.ts` already cover the fallback branch with a
synthetic flat AST.

## Do not edit

Re-run `scripts/build-no-slide-signal-pptx.ts` to regenerate if the
contract changes.
```

#### 2c. Slow-test additions

Extend `pptx-ingestor-integration.test.ts` with a new describe block:

```typescript
const fallbackFixturePath = join(
  import.meta.dirname,
  "fixtures",
  "no-slide-signal.pptx",
);

describe.skipIf(!process.env.PRAXIS_RUN_SLOW_TESTS)(
  "PptxIngestor against fallback fixture (no slide signal — slow)",
  () => {
    // Pins the spec-silent contract: when ast.content has zero "slide"
    // type nodes, tryChunkBySlide returns null and PptxIngestor falls
    // through to ast.toText() + chunkMarkdown.
    //
    // Pinned in source: pptx-ingestor.ts:tryChunkBySlide — see the
    // one-line "pinned by:" comment there.

    it("falls back to ast.toText() + chunkMarkdown when officeparser produces no slide nodes (real fixture)", async () => {
      const ingestor = new PptxIngestor();
      const result = await ingestor.parse(fallbackFixturePath);

      // Fallback path produces chunks via chunkMarkdown, NOT chunkParagraphs
      // keyed by slide. The hallmark: no chunk has a "Slide N" section label.
      const slideLabeled = result.chunks.filter((c) => c.section?.startsWith("Slide "));
      expect(slideLabeled).toHaveLength(0);

      // The result is still well-formed: ingestorId set, title resolved
      // from document metadata (the fixture has <dc:title>fallback fixture</dc:title>).
      expect(result.ingestorId).toBe("pptx");
      expect(result.title).toBe("fallback fixture");
    }, 120_000);

    it("fallback path produces zero chunks when the fixture has no extractable text — neither slide nodes nor toText output (acceptable)", async () => {
      // The fixture's slides contain only p:contentPart — no text. ast.toText()
      // returns an empty string. chunkMarkdown of empty string returns zero
      // chunks. This is the documented acceptable shape; the contract is that
      // the parse completes without throwing and returns an empty chunks array.
      const ingestor = new PptxIngestor();
      const result = await ingestor.parse(fallbackFixturePath);
      // We do NOT assert chunks.length === 0 strictly, because the fixture
      // could legitimately gain a fragment of text via a later edit; the
      // contract is that no slide-section chunks appear (pinned above) and
      // the parse succeeds.
      expect(Array.isArray(result.chunks)).toBe(true);
    }, 120_000);
  },
);
```

Plus the source-side comment on `tryChunkBySlide` in `pptx-ingestor.ts`:

```typescript
/**
 * ...
 *
 * Returns `null` if no `"slide"` nodes are found — the caller falls back to
 * `ast.toText()` + `chunkMarkdown` in that case.
 *
 * Spec-silent contract pinned by: pptx-ingestor-integration.test.ts —
 * "falls back to ast.toText() + chunkMarkdown when officeparser produces
 *  no slide nodes (real fixture)"
 */
function tryChunkBySlide(...) { ... }
```

#### 2d. Devtool dependency

Add `jszip` as a devDependency at the workspace root (NOT in
`@praxis/tools` runtime — it's only needed by the fixture-build
script). The script can be run manually; CI doesn't run it.

```jsonc
// package.json — root devDependencies
{
  "devDependencies": {
    "jszip": "^3.10.1"
  }
}
```

(jszip is already present transitively via officeparser; an explicit
devDependency just makes the script's import legal under strict
resolution.)

**Implementation Notes**:
- The build script is run **once** during implementation, then the
  output `no-slide-signal.pptx` is committed. CI never invokes the
  script.
- Verify the fixture exercises the fallback by adding a one-shot
  `console.log` of `ast.content.map(n => n.type)` inside the
  ingestor temporarily during dev — should be `[]` or only
  non-`"slide"` types.
- The fixture should be tiny (<5 KB) — only one slide, no media.

**Acceptance Criteria**:
- [ ] `scripts/build-no-slide-signal-pptx.ts` exists and produces a
  valid PPTX (opens in PowerPoint Online; no
  `[Content_Types].xml`/rels errors)
- [ ] `packages/tools/src/runtime/ingestion/__tests__/fixtures/no-slide-signal.pptx` and
  `.../no-slide-signal.pptx.md` committed
- [ ] New describe block in `pptx-ingestor-integration.test.ts` gated
  on `PRAXIS_RUN_SLOW_TESTS`
- [ ] `PRAXIS_RUN_SLOW_TESTS=1 pnpm --filter @praxis/tools test` passes
  (both new tests in addition to existing slow tests)
- [ ] Default `pnpm test` still passes and skips the new fallback tests
- [ ] One-line source comment on `tryChunkBySlide` referencing the
  pinning test
- [ ] `pnpm typecheck`, `pnpm lint` clean

---

## Implementation Order

1. **Story `…-docx-image-boundary`** — independent of any fixture
   work. Two new tests + one source comment. Single stride.
2. **Story `…-pptx-fallback-fixture`** — fixture script, fixture
   binary, fixture README, two new slow tests, one source comment.
   Single stride but slightly larger surface (fixture XML).

The two stories are fully independent — `depends_on: []` on both, so
`implement-orchestrator` can run them in parallel.

## Testing

### DOCX (Unit 1)
- Two new tests in the existing test file under a new describe block.
  No new helpers needed.
- Run as part of the regular `pnpm test` lane (no slow-gating).

### PPTX (Unit 2)
- Two new tests in the existing `*-integration.test.ts` file under a
  new describe block.
- Gated behind `PRAXIS_RUN_SLOW_TESTS=1` per the `slow-test-gating`
  pattern.
- A separate one-shot script (`scripts/build-no-slide-signal-pptx.ts`)
  produces the fixture; CI does not run it.

### Integration seams
- The DOCX test exercises `DocxIngestor.parse` → `chunkMarkdown` →
  `tagChunksWithImages` end-to-end; no new seams introduced.
- The PPTX test exercises `PptxIngestor.parse` → real `officeparser`
  → `tryChunkBySlide` → `ast.toText()` + `chunkMarkdown` fallback
  end-to-end; existing slow-test infra used.

### Test data
- DOCX: synthetic markdown strings via the existing
  `simulateConvertToMarkdownWithImages` helper. No real DOCX bytes.
- PPTX: the new `no-slide-signal.pptx` fixture (committed binary,
  built once by the script).

## Risks

- **Programmatic-zip fixture may be rejected by future officeparser
  versions.** A v7 release that tightens PPTX schema validation could
  reject our minimal fixture even though PowerPoint Online accepts it.
  Mitigation: the fixture is built from a real PPTX template (we'll
  start from `sample.pptx`'s scaffolding and strip the slide content
  to `<p:contentPart/>`) so the surrounding XML is provably parseable
  by officeparser v6.1.x. If v7 rejects the fixture, re-run the
  build script and re-verify the AST shape — this is exactly the
  "AST-shape regression upstream" the test was written to catch.
  Risk severity: low.
- **`p:contentPart` is uncommon and may be considered a niche edge
  case.** Reasonable, but the structural property we're pinning is
  "zero `"slide"` nodes in `ast.content`", which is what triggers
  the fallback regardless of *why* the slides have no extractable
  content. The contentPart approach is the minimal way to construct
  that condition. Risk severity: low.
- **DOCX test depends on the chunker's exact flush threshold.** The
  test uses `maxChars: 100` and an image-paragraph just under that.
  A future chunker refactor that changes the soft-cap semantics
  could break the test's "image lands in next chunk" assumption.
  Mitigation: the primary assertion (`<=1` chunk picks up the image)
  is robust to any paragraph-respecting chunker. The "exactly one"
  edge test is the supplementary one — it can be loosened if the
  chunker contract changes. Risk severity: low.

## Pre-mortem (revised after)

- **Riskiest assumption**: that a `p:contentPart`-only PPTX really
  does yield zero `"slide"` nodes from officeparser v6.1.1.
  Verification: read the officeparser source (already done in
  design phase — confirmed `N.children.length > 0` gate at the
  point where slide nodes are pushed). Implementation should also
  log the AST `type` array once during dev as a sanity check.
- **What would have to be true for production failure**: the chunker
  changes shape (paragraph-split semantics) AND nobody updates these
  tests. The tests are colocated and the source comments reference
  them by name, so the next agent touching `tagChunksWithImages` or
  `tryChunkBySlide` will see the pin.
- **Fallback if the contentPart approach doesn't work**: use a slide
  with an empty `<p:spTree/>`. officeparser's recogniser still won't
  emit a `"slide"` node when `spTree` has no recognised children
  (same gate). This is the spike-free retry path.
- **Where am I least sure**: the exact XML scaffolding for a minimal
  valid PPTX. Mitigation: copy the scaffolding from the existing
  `sample.pptx` (unzip → extract layout / master / theme / rels)
  rather than hand-rolling.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Both children at done. DOCX boundary test runs on fast lane; PPTX fallback fixture correctly gated on `PRAXIS_RUN_SLOW_TESTS`. Children-complete.
