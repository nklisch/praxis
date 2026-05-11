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

```typescript
type OfficeParserAST = {
  content: OfficeContentNode[];
  attachments: OfficeAttachment[];
  metadata: { /* doc metadata */ };
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

type OfficeContentNode = {
  type: "paragraph" | "heading" | "table" | "list" | "text" | "image" | "break";
  text: string;
  children?: OfficeContentNode[];
  formatting?: {
    bold?: boolean; italic?: boolean; underline?: boolean;
    color?: string; size?: string; font?: string;
    alignment?: "left" | "center" | "right" | "justify";
  };
  metadata?: {
    level?: number;          // heading level
    listId?: string;
    row?: number; col?: number;
    attachmentName?: string; // links a node back to OfficeAttachment.name
  };
  rawContent?: string;       // only if config.includeRawContent === true
};
```

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

**Slide boundaries.** PowerPoint slides surface as top-level groupings in `ast.content`. If the AST doesn't expose an obvious slide marker for a particular file, the MVP fallback is `ast.toText()` + the existing `chunkMarkdown` flow — slide-level page numbers can be reconciled later.

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
