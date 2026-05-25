import type { RenderToggles } from "@praxis/core/types";
import type { Element as HastElement } from "hast";
import type { ReactElement } from "react";
import { useMemo } from "react";
import ReactMarkdown, { type Components, defaultUrlTransform } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { useFirstOccurrence } from "../hooks/use-first-occurrence.js";
import { balanceFences } from "../lib/balance-fences.js";
import { KATEX_MACROS } from "../lib/katex-macros.js";
import { rehypeFilePaths } from "../lib/markdown-plugins/rehype-file-paths.js";
import { rehypeMathGlyphWrap } from "../lib/markdown-plugins/rehype-math-glyph-wrap.js";
import { rehypeUnits } from "../lib/markdown-plugins/rehype-units.js";
import { remarkAdmonitions } from "../lib/markdown-plugins/remark-admonitions.js";
import { remarkDefinitions } from "../lib/markdown-plugins/remark-definitions.js";
import { rehypeCitationChips } from "../lib/rehype-citation-chips.js";
import { CitationChip } from "./citation-chip.js";
import type { CalloutType } from "./markdown/callout.js";
import { Callout } from "./markdown/callout.js";
import { ConceptRef } from "./markdown/concept-ref.js";
import { Definition } from "./markdown/definition.js";
import type { FigureVerdict } from "./markdown/figure.js";
import { Figure } from "./markdown/figure.js";
import styles from "./markdown-content.module.css";

export interface MarkdownContentProps {
  /** Raw text to render. May be partial mid-stream. */
  content: string;
  /** Number of citations available for chip resolution. Chips with index
   *  greater than this still render but the click handler is a no-op. */
  citationCount?: number;
  /** Click handler invoked when a citation chip is activated. */
  onCitationClick?: (index: number) => void;
  /**
   * Content-type feature toggles resolved by `resolveRenderToggles(mode)`.
   * When omitted, all features default to enabled (equivalent to
   * `DEFAULT_RENDER_TOGGLES`).
   */
  renderToggles?: Required<RenderToggles>;
  /**
   * Current student ID. Used by `useFirstOccurrence` to key term-seen lookups.
   * When omitted, first-occurrence tracking is skipped (all terms rendered
   * without `.definition` styling).
   */
  studentId?: string;
  /**
   * Session ID for `markTermSeen` recording. Required alongside `studentId`
   * for first-occurrence recording to fire.
   */
  sessionId?: string;
  /**
   * Called when a `concept:slug` link is activated (opens the concept
   * side-panel).
   */
  conceptOpen?: (slug: string) => void;
  /**
   * When true, terms seen for the first time in this render context will be
   * recorded via `markTermSeen`. Typically true only for the live assistant
   * message (not for historical messages or preview contexts).
   */
  recordDefinitionOccurrence?: boolean;
}

// ── Static base plugin arrays (module-level — never rebuilt) ─────────────────
// Toggle-dependent entries are spliced in via useMemo inside the component.
//
// NOTE: `remark-directive` is intentionally excluded from the base. The `:::`
// container-directive syntax conflicts with the `[[def:term]]` notation because
// remark-directive's parser extension interprets `:term` inside `[[def:term]]`
// as an inline textDirective, silently eating the term text. If `:::` figure
// support is added in a future story, it should be added via a separate plugin
// that pre-empts the conflict (e.g., by transforming `[[def:...]]` markers
// before remark-directive's parse extension runs). `remarkAdmonitions` does NOT
// depend on remark-directive — it transforms blockquotes directly and uses
// `data.hName` to produce custom HAST elements.
const REMARK_BASE = [remarkGfm, remarkMath] as const;
const REHYPE_BASE = [
  [rehypeKatex, { throwOnError: false, macros: KATEX_MACROS }],
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
  rehypeCitationChips,
] as const;

/**
 * Extract `[[def:term]]` term strings from balanced markdown via a fast regex.
 * This avoids a full remark parse just to collect terms for `useFirstOccurrence`.
 */
const DEF_TERM_RE = /\[\[def:([^\]]+)\]\]/g;
function extractDefinitionTerms(content: string): string[] {
  const terms: string[] = [];
  DEF_TERM_RE.lastIndex = 0;
  for (let m = DEF_TERM_RE.exec(content); m !== null; m = DEF_TERM_RE.exec(content)) {
    const term = m[1];
    if (term !== undefined && !terms.includes(term)) {
      terms.push(term);
    }
  }
  return terms;
}

// ── No-op stubs for useFirstOccurrence (IPC client not yet wired) ─────────────
//
// ## Implementation discovery (2026-05-24)
//
// `TermFirstOccurrencesService` exists in `@praxis/core/services` and is registered
// in `ServiceDeps`, but the IPC channel exposing `hasSeenTerm`/`markTermSeen`
// to the renderer — and its `PraxisClient` binding — have not been implemented
// yet.  Rather than block step-8 on that plumbing:
//
//   - `useFirstOccurrence` is called unconditionally (hook rules satisfied).
//   - `hasSeenTerm` returns `false` (never seen) → `isFirst()` returns `false`
//     for all terms → `<Definition>` renders as an unstyled `<dfn>` (no
//     `.definition` accent class) until the client is wired.
//   - `markTermSeen` is a no-op.
//
// When the IPC channel lands, replace these stubs with calls to
// `client.memory.hasSeenTerm` / `client.memory.markTermSeen`.
const NOOP_HAS_SEEN = async (_studentId: string, _term: string): Promise<boolean> => false;
const NOOP_MARK_SEEN = async (
  _studentId: string,
  _term: string,
  _sessionId: string,
): Promise<void> => undefined;

/**
 * Render assistant message content as markdown with code highlighting,
 * KaTeX math, citation chips, and content-type primitives (callouts, figures,
 * definition markers, concept-ref links, file-path / unit auto-detection).
 *
 * Safe for streaming partials — unclosed code fences and `$$` blocks are
 * balanced before parse so the rest of the buffer never renders as one giant
 * fenced block.
 *
 * All content-type features are gated by `renderToggles` (defaults to all
 * enabled). The plugin arrays are memoized on toggles so re-renders with the
 * same toggles incur no extra allocations.
 *
 * ## Plugin order (REHYPE)
 * 1. `rehypeKatex`          — math typesetting (`throwOnError:false`, macros)
 * 2. `rehypeHighlight`      — syntax tokens on code blocks
 * 3. `rehypeCitationChips`  — replaces `[N]` markers
 * 4. `rehypeFilePaths`      — post-pass: wraps file-path matches (conditional)
 * 5. `rehypeUnits`          — post-pass: wraps unit matches (conditional)
 * 6. `rehypeMathGlyphWrap`  — post-pass: wraps bare Unicode glyphs (conditional on `bareGlyphMath`)
 *
 * ## Plugin order (REMARK)
 * 1. `remarkGfm`            — tables, autolinks
 * 2. `remarkMath`           — `$...$` / `$$...$$` → math nodes
 * 3. `remarkAdmonitions`    — `> [!type]` → containerDirective nodes (via data.hName)
 * 4. `remarkDefinitions`    — `[[def:term]]` → definition-term nodes
 */
export function MarkdownContent({
  content,
  onCitationClick,
  renderToggles,
  studentId,
  sessionId,
  conceptOpen,
  recordDefinitionOccurrence = false,
}: MarkdownContentProps) {
  const balanced = balanceFences(content);

  // Convert LaTeX-style delimiters to dollar form before parse.
  // remark-math handles $...$ and $$...$$ natively; the regex pair adds
  // \(...\) and \[...\] support without pulling in another remark plugin.
  const normalized = balanced
    .replace(/\\\(((?:[^\\]|\\(?!\)))*?)\\\)/g, "$$$1$$")
    .replace(/\\\[((?:[^\\]|\\(?!\]))*?)\\\]/g, "$$$$$1$$$$");

  // ── Toggle defaults (all on when prop is omitted) ─────────────────────────
  const callouts = renderToggles?.callouts ?? true;
  const definitions = renderToggles?.definitions ?? true;
  const bareGlyphMath = renderToggles?.bareGlyphMath ?? true;
  const filePathAutoDetect = renderToggles?.filePathAutoDetect ?? true;
  const unitAutoDetect = renderToggles?.unitAutoDetect ?? true;

  // ── Remark plugins (memoized on per-toggle booleans) ─────────────────────
  // biome-ignore lint/suspicious/noExplicitAny: plugin tuple types vary across unified plugins; the array shape matches react-markdown's PluggableList
  const remarkPlugins = useMemo<any[]>(() => {
    const plugins: unknown[] = [...REMARK_BASE];
    if (callouts) plugins.push(remarkAdmonitions);
    if (definitions) plugins.push(remarkDefinitions);
    return plugins;
  }, [callouts, definitions]);

  // ── Rehype plugins (memoized; post-passes LAST) ───────────────────────────
  // biome-ignore lint/suspicious/noExplicitAny: plugin tuple types vary across unified plugins; the array shape matches react-markdown's PluggableList
  const rehypePlugins = useMemo<any[]>(() => {
    const plugins: unknown[] = [...REHYPE_BASE];
    // Post-render passes run after math + highlight + chips on settled HAST.
    if (filePathAutoDetect) plugins.push(rehypeFilePaths);
    if (unitAutoDetect) plugins.push(rehypeUnits);
    // rehypeMathGlyphWrap MUST run after rehypeKatex so that <math> HAST
    // elements exist when the ancestor-skip check fires — glyphs inside
    // KaTeX expressions are then correctly skipped.
    if (bareGlyphMath) plugins.push(rehypeMathGlyphWrap);
    return plugins;
  }, [bareGlyphMath, filePathAutoDetect, unitAutoDetect]);

  // ── First-occurrence tracking ─────────────────────────────────────────────
  // Terms extracted via regex — avoids a second remark parse cycle.
  const terms = useMemo(
    () => (definitions ? extractDefinitionTerms(normalized) : []),
    [definitions, normalized],
  );

  // Hook always called (hook rules). No-op stubs used until the IPC client
  // exposes hasSeenTerm/markTermSeen (see comment on NOOP_HAS_SEEN above).
  const { isFirst } = useFirstOccurrence({
    studentId: studentId ?? "anonymous",
    sessionId: sessionId ?? "",
    hasSeenTerm: NOOP_HAS_SEEN,
    markTermSeen: NOOP_MARK_SEEN,
    terms,
    recordOccurrence: recordDefinitionOccurrence,
  });

  // ── Component overrides ───────────────────────────────────────────────────
  // Built inside the function because it closes over `onCitationClick`,
  // `conceptOpen`, and `isFirst`. react-markdown diffs its children so a new
  // object reference each render is acceptable.
  const components: Components & {
    // biome-ignore lint/suspicious/noExplicitAny: react-markdown does not type unknown HAST tag names; this is the documented escape hatch for custom-element renderers
    [key: string]: (props: any) => ReactElement | null;
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
    // ── Links: external-target default + concept: scheme ─────────────────
    a: ({ href, children, ...rest }) => {
      if (href?.startsWith("concept:")) {
        const slug = href.slice("concept:".length);
        return (
          <ConceptRef conceptSlug={slug} onOpen={conceptOpen}>
            {children}
          </ConceptRef>
        );
      }
      return (
        <a {...rest} href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
          {children}
        </a>
      );
    },
    // ── Glossary: <abbr> with .glossary class and title passthrough ───────
    abbr: ({ children, title }) => (
      <abbr className={styles.glossary} title={title}>
        {children}
      </abbr>
    ),
    // ── Citation chips (synthetic element from rehype-citation-chips) ─────
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
    // ── Callout (admonition directive: > [!type]) ─────────────────────────
    // Emitted as <admonition type="..."> via remarkAdmonitions → data.hName.
    admonition: ({ node, children }) => {
      const props = (node as HastElement | undefined)?.properties;
      const type = (props?.type as string | undefined) ?? "hint";
      return <Callout type={type as CalloutType}>{children}</Callout>;
    },
    // ── Figure (worked example: ::: figure {caption=... verdict=...}) ─────
    // remark-directive emits containerDirective{name:"figure"} nodes; when
    // data.hName is not set, remark-rehype uses the directive name as the tag
    // name — so we get <figure> in HAST. Registering "figure" in components
    // intercepts all such elements and delegates to the <Figure> component.
    figure: ({ node, children }) => {
      const props = (node as HastElement | undefined)?.properties;
      const caption =
        (props?.caption as string | undefined) ?? (props?.["data-caption"] as string | undefined);
      const verdict =
        (props?.verdict as FigureVerdict | undefined) ??
        (props?.["data-verdict"] as FigureVerdict | undefined);
      return (
        <Figure caption={caption} verdict={verdict}>
          {children}
        </Figure>
      );
    },
    // ── Definition term ([[def:term]] → <definition-term term="...">) ──────
    // Emitted as <definition-term term="..."> via remarkDefinitions → data.hName.
    "definition-term": ({ node, children }) => {
      const props = (node as HastElement | undefined)?.properties;
      const term = (props?.term as string | undefined) ?? "";
      return (
        <Definition term={term} isFirstOccurrence={isFirst(term)}>
          {children}
        </Definition>
      );
    },
  };

  return (
    <div className={styles.root}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={urlTransformWithConcept}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Extends react-markdown's default URL sanitizer to allow `concept:` scheme
 * links.  `concept:slug` links are in-app navigation — they are handled by the
 * `<ConceptRef>` component and never reach the DOM as real hrefs.
 */
function urlTransformWithConcept(url: string, key: string, node: Readonly<HastElement>): string {
  if (url.startsWith("concept:")) return url;
  return defaultUrlTransform(url) ?? "";
}
