---
name: officeparser-v6
description: officeparser v6 reference for parsing .pptx (and other office formats) into a typed AST with extracted attachments. Triggers on imports from `officeparser`, mentions of `OfficeParser.parseOffice`, `OfficeParserAST`, `OfficeAttachment`, `OfficeContentNode`, or work on PowerPoint / PPTX ingestion in `packages/tools/src/runtime/ingestion/`.
user-invocable: false
version-pinned: 6.1.x
---

# officeparser v6 quick reference

Active office-format parser used by `PptxIngestor`. Pure JS, MIT, lazy-imported inside the ingestor (same pattern as `mammoth` in `DocxIngestor`). See `docs/research/pptx-parsing.md` for the full evaluation that picked this library.

## Import

```typescript
const { OfficeParser } = await import("officeparser");
```

Always lazy-import inside `parse()` — `officeparser` transitively pulls in Tesseract.js and PDF.js (even though we never enable them), so keep them off the cold path.

## Core call

```typescript
const ast = await OfficeParser.parseOffice(filePath, config);
```

- `filePath` accepts `string` (path), `Buffer`, or `Uint8Array`.
- `config` is optional; see fields below.

## Config (the fields we care about)

| Field | Type | Praxis default | Why |
|---|---|---|---|
| `extractAttachments` | boolean | **`true`** | Images and chart blobs as Base64 — required for slide media. |
| `ignoreNotes` | boolean | `false` | Keep speaker notes; lecturers often put pedagogical commentary there. |
| `putNotesAtLast` | boolean | `false` | Keep notes inline with their slide for context. |
| `ocr` | boolean | **`false`** | We have a vision pipeline; Tesseract.js is redundant bundle weight. |
| `outputErrorToConsole` | boolean | `false` | Errors flow through normal exception paths. |
| `newlineDelimiter` | string | `"\n"` | Default is fine. |
| `includeRawContent` | boolean | `false` | We work off the AST, not raw XML. |

Other fields exist (`ocrLanguage`, `includeBreakNodes`) but aren't relevant to PPTX.

## Result shape

> The README documents this loosely. The authoritative source is the
> installed package's `dist/types.d.ts` — read it whenever the README seems
> incomplete. The shapes below are corrected against that file as of v6.1.1
> (see "AST shape — verified against installed types" below for the
> discoveries that landed in this skill after Story 1 of
> `feature-powerpoint-ingestion`).

```typescript
type OfficeParserAST = {
  content: OfficeContentNode[];
  attachments: OfficeAttachment[];
  metadata: {
    title?: string;          // document properties — prefer over first-heading
    /* …other doc metadata */
  };
  toText(): string;
};

type OfficeAttachment = {
  name: string;        // e.g. "image1.png"
  type: "image" | "chart";
  data: string;        // Base64 — decode with Buffer.from(data, "base64")
  mimeType: string;
  ocrText?: string;    // only set when config.ocr === true
  chartData?: { title: string; dataSets: unknown[]; labels: string[] };
};

// Full node-type union (verified against dist/types.d.ts):
type OfficeContentNodeType =
  | "paragraph" | "heading" | "table" | "list" | "text" | "image"
  | "chart" | "drawing" | "slide" | "note" | "sheet" | "row" | "cell"
  | "page" | "break";

type OfficeContentNode = {
  type: OfficeContentNodeType;
  text: string;
  children?: OfficeContentNode[];
  formatting?: {
    bold?: boolean; italic?: boolean; underline?: boolean;
    color?: string; size?: string; font?: string;
    alignment?: "left" | "center" | "right" | "justify";
  };
  // metadata is a discriminated union per node type; use type-narrowing.
  // SlideMetadata has slideNumber: number (1-based).
  // HeadingMetadata has level: number.
  // ImageMetadata has attachmentName: string (links to OfficeAttachment.name).
  // The union doesn't share a common index signature — typing this as
  // `Record<string, unknown>` fails strict TS. Pragmatic options:
  //   a) define a local OfficeNodeLike with `metadata?: any` and a
  //      `biome-ignore lint/suspicious/noExplicitAny: …` reason comment
  //      (this is what PptxIngestor does); or
  //   b) narrow via the type discriminant before reading metadata fields.
  metadata?: {
    slideNumber?: number;    // SlideMetadata (when type === "slide")
    level?: number;          // HeadingMetadata
    listId?: string;
    row?: number; col?: number;
    attachmentName?: string; // ImageMetadata — links to OfficeAttachment.name
  };
  rawContent?: string;       // only if config.includeRawContent === true
};
```

## AST shape — verified against installed types

These are the corrections to the README-derived sketch above. Verified by
reading `node_modules/.pnpm/officeparser@*/node_modules/officeparser/dist/types.d.ts`
on v6.1.1 during implementation of
`feature-powerpoint-ingestion-text-extraction`:

- **`"slide"` is a first-class top-level node type for PPTX.** A PPTX parses
  as `ast.content = [slide1, slide2, …]` where each entry has
  `type === "slide"`, `metadata.slideNumber: number` (1-based), and
  `children: OfficeContentNode[]` containing the slide's body.
- **`"note"` is a node type for speaker notes**, nested as children inside
  the relevant `"slide"` node. Filter `slide.children` by `type === "note"`
  to separate body text from speaker notes.
- **`"chart"`, `"drawing"`, `"sheet"`, `"row"`, `"cell"`, `"page"` are also
  valid node types** that the original README sketch omits. Most aren't
  relevant for PPTX but you'll see them when parsing other office formats.
- **`ast.metadata.title` is populated from the document's "Title" property**
  when set. Prefer this over scanning for the first heading — it's what the
  PowerPoint author explicitly named the deck.

## Patterns the ingestor uses

## Patterns the ingestor uses

**Decode Base64 before storage.** Don't pass Base64 through to the page-image store.

```typescript
for (const att of ast.attachments) {
  if (att.type !== "image") continue;
  const bytes = Buffer.from(att.data, "base64");
  await pageImageStore.put({ docId, name: att.name, mimeType: att.mimeType, bytes });
}
```

**Correlate text to images via `attachmentName`.** Don't try to match by position — the AST is hierarchical and image nodes carry an explicit link.

```typescript
function imageNameFor(node: OfficeContentNode): string | undefined {
  return node.type === "image" ? node.metadata?.attachmentName : undefined;
}
```

**Slide boundaries.** Top-level `"slide"` nodes in `ast.content`. Read
`slide.metadata.slideNumber` for the 1-based page number, then walk
`slide.children` to assemble body text. Separate `"note"` children for
speaker notes — Praxis chunks them as `section: "Slide N (notes)"` and
keeps body chunks as `section: "Slide N"`. If for some reason a parse
returns zero `"slide"` nodes (corrupt or unusual deck), fall back to
`ast.toText()` + `chunkMarkdown`.

**Test fixture.** A redistributable 89 KB `.pptx` from officeparser's own
MIT-licensed test suite lives at
`packages/tools/src/runtime/ingestion/__tests__/fixtures/sample.pptx`
(9 slides, 4 with speaker notes, 1 embedded image). Use it for any
slow-test-gated integration test against the real library — don't try to
generate a PPTX programmatically. See the sibling `sample.pptx.md` for
attribution and contents.

## Pitfalls

- Slide ordering is NOT alphabetical by `slide<N>.xml` — `officeparser` resolves the relationships graph internally. If we ever switch to OOXML-direct, this is the first thing that breaks.
- `extractAttachments` doubles parse time and memory for image-heavy decks. Worth measuring on a 50+ slide chemistry textbook deck.
- `ocr: true` would re-extract image text via Tesseract.js — leave it off; vision pipeline does this better.
- The AST is typed but some fields are optional in ways the types don't fully capture — always null-check `node.metadata?.attachmentName` and `att.ocrText`.

## When to look elsewhere

- Want zero external library risk → write OOXML-direct (JSZip + xml2js + a relationships walker). Expect ~1-2k LoC.
- Legacy `.ppt` files → `officeparser` doesn't handle them. Use LibreOffice headless to convert to `.pptx` (or `.pdf`) first, then route through the normal path.

## Version

Pinned to **6.1.x** at time of this writing (v6.1.1 published 28 Apr 2026). Major-version bumps in this library have historically changed the result shape (v6 introduced the AST + attachments model). Re-validate this skill against the upstream README before upgrading to v7+.
