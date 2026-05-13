/**
 * MarkdownRenderer — renders markdown and plain-text documents.
 *
 * Uses `react-markdown` with GFM support. Degrades gracefully for plain text
 * (no fences or headers) — it just becomes nicely-spaced paragraphs.
 */
import type { JSX } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RendererProps } from "./format-router.js";
import styles from "./markdown-renderer.module.css";

// biome-ignore lint/suspicious/noExplicitAny: react-markdown's plugin type accepts Pluggable[]; mutable array cast required for tsgo compatibility
const REMARK_PLUGINS = [remarkGfm] as any[];

export function MarkdownRenderer({ doc }: RendererProps): JSX.Element {
  if (!doc.text) {
    return <p className={styles.empty}>No text content available for this document.</p>;
  }

  return (
    <div className={styles.container}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{doc.text}</ReactMarkdown>
    </div>
  );
}
