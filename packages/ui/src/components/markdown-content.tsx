import type { Element as HastElement } from "hast";
import type { ReactElement } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { balanceFences } from "../lib/balance-fences.js";
import { rehypeCitationChips } from "../lib/rehype-citation-chips.js";
import { CitationChip } from "./citation-chip.js";
import styles from "./markdown-content.module.css";

export interface MarkdownContentProps {
  /** Raw text to render. May be partial mid-stream. */
  content: string;
  /** Number of citations available for chip resolution. Chips with index
   *  greater than this still render but the click handler is a no-op. */
  citationCount?: number;
  /** Click handler invoked when a citation chip is activated. */
  onCitationClick?: (index: number) => void;
}

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [
  rehypeKatex,
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
  rehypeCitationChips,
] as const;

/**
 * Render assistant message content as markdown with code highlighting,
 * KaTeX math, and inline `[N]` citation chips. Safe for streaming partials —
 * unclosed code fences and `$$` blocks are balanced before parse so the rest
 * of the buffer never renders as one giant fenced block.
 *
 * Replaces the legacy `renderContentWithCitations` regex walker in
 * `MessageBubble`. Preserves citation-chip click behavior; keeps `arr[1]`
 * inside code samples as code, not as a chip.
 */
export function MarkdownContent({ content, onCitationClick }: MarkdownContentProps) {
  const balanced = balanceFences(content);

  // Convert LaTeX-style delimiters to dollar form before parse.
  // remark-math handles $...$ and $$...$$ natively; the regex pair adds
  // \(...\) and \[...\] support without pulling in another remark plugin.
  const normalized = balanced
    .replace(/\\\(((?:[^\\]|\\(?!\)))*?)\\\)/g, "$$$1$$")
    .replace(/\\\[((?:[^\\]|\\(?!\]))*?)\\\]/g, "$$$$$1$$$$");

  // The components map intentionally includes the custom `citation-chip`
  // element emitted by our rehype plugin. react-markdown's `Components` type
  // only enumerates standard HTML tag names, so we widen via index signature
  // for the custom-element entry and merge.
  const components: Components & {
    // biome-ignore lint/suspicious/noExplicitAny: react-markdown does not type unknown HAST tag names; this is the documented escape hatch for custom-element renderers
    "citation-chip": (props: any) => ReactElement | null;
  } = {
    // Map all six heading levels into two in-bubble visual styles:
    // H1/H2 → editorial mono uppercase kicker; H3-H6 → italic display.
    // A model-emitted "# Foo" should look like a paragraph break with a
    // kicker, not a 36px title eating the bubble.
    h1: ({ children, ...rest }) => (
      <h2 className={styles.kickerHeading} {...rest}>
        {children}
      </h2>
    ),
    h2: ({ children, ...rest }) => (
      <h3 className={styles.kickerHeading} {...rest}>
        {children}
      </h3>
    ),
    h3: ({ children, ...rest }) => (
      <h4 className={styles.editorialHeading} {...rest}>
        {children}
      </h4>
    ),
    h4: ({ children, ...rest }) => (
      <h5 className={styles.editorialHeading} {...rest}>
        {children}
      </h5>
    ),
    h5: ({ children, ...rest }) => (
      <h6 className={styles.editorialHeading} {...rest}>
        {children}
      </h6>
    ),
    h6: ({ children, ...rest }) => (
      <h6 className={styles.editorialHeading} {...rest}>
        {children}
      </h6>
    ),
    a: ({ href, children, ...rest }) => (
      <a {...rest} href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
        {children}
      </a>
    ),
    // The synthetic citation-chip element from rehype-citation-chips is
    // registered with a reserved tag name. We read the index from the hast
    // node's properties because react-markdown's prop-name conversion for
    // unknown elements is not stable across versions.
    "citation-chip": ({ node }) => {
      const props = (node as HastElement | undefined)?.properties;
      const raw = props?.dataIndex ?? props?.["data-index"];
      const index = Number(raw);
      if (!Number.isFinite(index)) return null;
      return (
        <CitationChip
          index={index}
          {...(onCitationClick !== undefined && { onClick: onCitationClick })}
        />
      );
    },
  };

  return (
    <div className={styles.root}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        // biome-ignore lint/suspicious/noExplicitAny: rehype plugin tuple types vary across plugins; the array shape matches react-markdown's expected PluggableList
        rehypePlugins={REHYPE_PLUGINS as any}
        components={components}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
