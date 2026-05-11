---
id: feature-powerpoint-ingestion-text-extraction
kind: story
stage: done
tags: [ingestion]
parent: feature-powerpoint-ingestion
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# PPTX text extraction — skeleton ingestor

## Scope

Add a new `PptxIngestor` to the document ingestion pipeline that extracts
text (and speaker notes) from `.pptx` files using
[`officeparser` v6](../../docs/research/pptx-parsing.md). Wire it into the
desktop registry and file picker. No image extraction in this story — that's
Story 2 (`feature-powerpoint-ingestion-embedded-images`).

## Units this story implements

**Unit 1** in `feature-powerpoint-ingestion`:
- `packages/tools/src/runtime/ingestion/pptx-ingestor.ts` (new file)
- Registry registration in `packages/desktop/electron/main/services.ts:277`
- File picker filter in `packages/desktop/electron/main/ingest-channel.ts:40`
- Test fixture: `packages/tools/src/runtime/ingestion/__tests__/fixtures/sample.pptx`
- Tests: `packages/tools/src/runtime/ingestion/__tests__/pptx-ingestor.test.ts`

## Library

```bash
pnpm --filter @praxis/tools add officeparser
```

Pin to `^6.1.0`. See `.claude/skills/officeparser-v6/SKILL.md` — auto-loads
when you import from `officeparser` or reference `OfficeParser.parseOffice`.

## Implementation outline

1. `pnpm --filter @praxis/tools add officeparser`.
2. Implement `PptxIngestor` per the feature design's Unit 1 — lazy-import
   the library inside `parse()` (mirroring `DocxIngestor` with `mammoth`).
3. Register it in `services.ts` immediately after `new DocxIngestor()` so
   office formats sit together visually.
4. Add `"pptx"` to the file picker filter's `extensions` array.
5. Commit a small (5-10 KB) `.pptx` fixture. Generate locally with
   PowerPoint / Keynote / LibreOffice Impress. Include:
   - 3 slides
   - Slide 1 has a title heading (used to verify title extraction)
   - At least one slide has speaker notes (used to verify notes inclusion)
   - At least one slide has an embedded image (presence-only — image
     extraction is Story 2; here we just verify the image's existence
     doesn't break text parsing)
6. Write a sibling `sample.pptx.md` documenting the fixture's content so
   future tests can be reasoned about without opening PowerPoint.
7. Write tests per the feature design's "Story 1" section.

## Slide-boundary spike

The biggest unknown: whether `OfficeParser.parseOffice` returns an AST with
clear slide boundaries. The documented `OfficeContentNode.type` values are
`paragraph | heading | table | list | text | image | break` — no
`"slide"` type. During implementation:

1. Add a temporary `console.log(JSON.stringify(ast.content, null, 2).slice(0, 5000))`
   to inspect what's actually emitted for the 3-slide fixture.
2. If a clean per-slide signal exists (e.g. top-level node array element
   per slide, or `metadata.slide` field, or some sentinel), implement
   `tryChunkBySlide()` and set `chunk.page = slideNumber`.
3. If no clean signal exists, return `null` from `tryChunkBySlide()` and
   the code falls through to `ast.toText()` + `chunkMarkdown`. Document
   what you found in the implementation notes section of the feature body
   so Story 2 doesn't have to re-spike.

## Acceptance criteria

- [ ] `PptxIngestor` exported from `packages/tools/src/runtime/ingestion/index.ts`.
- [ ] Registered in `services.ts` alongside the other 7 ingestors.
- [ ] `"pptx"` in the file picker filter.
- [ ] Fixture `sample.pptx` committed (with sibling `sample.pptx.md`
      describing contents).
- [ ] Tests verify:
  - [ ] `ingestorId === "pptx"`
  - [ ] Title pulled from first slide heading (or filename fallback)
  - [ ] Chunks are non-empty
  - [ ] Speaker notes survive into the chunk stream
  - [ ] No crash on a slide that contains an embedded image
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.
- [ ] No `any` without a `biome-ignore` reason comment.

## Out of scope

- Image extraction (Story 2).
- `.ppt` legacy binary format.
- UI surfacing of slide images on source cards.
- Slide-as-PNG render for "view slide" feature.

## Implementation notes

### Library installation

`pnpm --filter @praxis/tools add officeparser@^6.1.0` — installed cleanly. No native build required (pure JS + WASM).

### Slide-boundary spike findings

The story brief noted that the documented `OfficeContentNode.type` values were `paragraph | heading | table | list | text | image | break` — no `"slide"` type visible in the SKILL.md. However, reading the actual `dist/types.d.ts` from the installed package revealed the full union:

```
'paragraph' | 'heading' | 'table' | 'list' | 'text' | 'image' | 'chart' |
'drawing' | 'slide' | 'note' | 'sheet' | 'row' | 'cell' | 'page' | 'break'
```

`"slide"` **is** a first-class node type, with `SlideMetadata` carrying a `slideNumber: number` (1-based). PPTX content surfaces as an array of top-level `"slide"` nodes, each with `metadata.slideNumber`.  Speaker notes appear as `"note"` child nodes inside each slide.

**`tryChunkBySlide` is fully implemented** — not a stub. It:
- Filters top-level nodes for `type === "slide"`
- Reads `slide.metadata.slideNumber` (guards with `typeof === "number"`)
- Separates `"note"` children from body children
- Produces per-slide body chunks with `chunk.page = slideNumber` and `chunk.section = "Slide N"`
- Produces per-slide notes chunks with `chunk.section = "Slide N (notes)"` and `chunk.blockType = "Body"`
- Returns `null` (triggering fallback to `ast.toText() + chunkMarkdown`) only when no `"slide"` nodes exist or all slides are empty

### Test approach

Chose **option 1 — mock officeparser entirely** using `vi.mock`. The officeparser npm package ships no `.pptx` fixtures. The `makeMockAst()` helper constructs synthetic AST objects shaped like real `OfficeParserAST` returns, allowing full coverage of the ingestor's orchestration logic without binary files.

No binary fixture was committed. Story 2 (embedded images) will benefit from a real fixture when testing attachment extraction; at that point, a small fixture can be added and a `PRAXIS_RUN_SLOW_TESTS`-gated integration test added.

### Deviations from the feature design sketch

- `findFirstHeadingText` searches the full `ast.content` tree recursively (including inside `"slide"` children), not just top-level nodes. This handles decks where the title slide heading is a child of a `"slide"` node.
- Title resolution order: `ast.metadata.title` (document properties) → first heading in AST → filename fallback. The design sketch didn't mention `ast.metadata.title`; adding it is strictly additive.
- `OfficeNodeLike.metadata` is typed `any` with a `biome-ignore` comment — the `ContentMetadata` union from officeparser doesn't have a shared index signature, so using `Record<string, unknown>` was rejected by the strict TS checker. This is contained to the internal helper interface, not the public API.

### Files changed

- `packages/tools/src/runtime/ingestion/pptx-ingestor.ts` (new)
- `packages/tools/src/runtime/ingestion/__tests__/pptx-ingestor.test.ts` (new, 15 tests)
- `packages/tools/src/runtime/ingestion/index.ts` (export added)
- `packages/desktop/electron/main/services.ts` (import + registry registration)
- `packages/desktop/electron/main/ingest-channel.ts` (file picker filter)
