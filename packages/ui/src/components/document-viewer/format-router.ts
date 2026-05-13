/**
 * format-router.ts — maps a document's mimeType to the renderer component
 * that should display it.
 *
 * Renderers are plain React components that accept a single `doc: DocumentDetail`
 * prop. The router is a pure function; no side effects.
 */

import type { DocumentDetail } from "@praxis/core/types";
import type { JSX } from "react";
import { FallbackRenderer } from "./fallback-renderer.js";
import { HtmlRenderer } from "./html-renderer.js";
import { MarkdownRenderer } from "./markdown-renderer.js";
import { PdfRenderer } from "./pdf-renderer.js";
import { StructuredRenderer } from "./structured-renderer.js";

export type RendererProps = { doc: DocumentDetail };
export type RendererComponent = (props: RendererProps) => JSX.Element;

/**
 * Pick the renderer component for the given MIME type.
 *
 * - `application/pdf`                          → PdfRenderer (page images)
 * - `text/markdown`, `text/x-markdown`         → MarkdownRenderer
 * - `text/plain` and other `text/*`            → MarkdownRenderer (plain-text fallback)
 * - `text/html`, `application/xhtml+xml`       → HtmlRenderer (sanitised)
 * - OOXML presentation (.pptx) / document (.docx) → StructuredRenderer
 * - everything else                            → FallbackRenderer
 */
export function pickRenderer(mimeType: string): RendererComponent {
  if (mimeType === "application/pdf") {
    return PdfRenderer;
  }

  if (mimeType === "text/markdown" || mimeType === "text/x-markdown") {
    return MarkdownRenderer;
  }

  if (mimeType === "text/html" || mimeType === "application/xhtml+xml") {
    return HtmlRenderer;
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return StructuredRenderer;
  }

  // All remaining text/* types (text/plain, text/csv, …) render as plain text
  // through the markdown renderer — it degrades gracefully to a <pre> block.
  if (mimeType.startsWith("text/")) {
    return MarkdownRenderer;
  }

  return FallbackRenderer;
}
