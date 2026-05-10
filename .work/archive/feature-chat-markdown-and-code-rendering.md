---
id: feature-chat-markdown-and-code-rendering
kind: feature
stage: done
tags: [ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-09
updated: 2026-05-10
---

# Chat: render markdown, code, and inline math in tutor messages

## Brief

Tutor messages currently render as raw text inside a single `<p>`. The model
routinely produces markdown — bullet lists, bold/italic, headings, inline
backticks, fenced code blocks, links, and inline math (`$x^2$` / `\(x^2\)`) —
and the student sees it un-parsed. Code fences appear as literal triple-tick
blobs, lists collapse into prose, and math equations render as raw LaTeX
source. This is one of the most visible quality gaps in the chat surface.

The feature replaces `renderContentWithCitations` in
`packages/ui/src/components/message.tsx` (the function returns
`<p className={styles.content}>{content}</p>` today) with a markdown pipeline
that handles:

- **Markdown** — paragraphs, lists, bold/italic, links, headings, blockquotes,
  inline `code`
- **Fenced code blocks** — language-tagged, syntax-highlighted, monospace,
  scrollable; copy-to-clipboard affordance acceptable but not required
- **Inline + block math** — render `$...$` / `$$...$$` (and `\(...\)` /
  `\[...\]`) via a math typesetter
- **Citation chips** — preserve the existing `[N]` chip behavior (the new
  pipeline must not eat or escape `[1]` markers; today's regex extraction
  needs to compose with markdown parsing, not fight it)
- **Streaming** — must keep working with `useEasedStream` so partial markdown
  doesn't flicker into a half-parsed state mid-stream (e.g., a half-closed
  code fence shouldn't render as a giant fence then collapse)

The feature must hold the editorial constraints from `docs/VISION.md` —
restrained typography, no badges, no decorative iconography. The rendered
output should look like reading a textbook page, not a chat app.

The design phase picks the markdown library, the syntax highlighter, the math
renderer, and resolves the streaming-vs-partial-parse strategy. Candidates
worth evaluating: `react-markdown` + `remark-gfm` + `remark-math` +
`rehype-katex` + `rehype-highlight` (or `shiki`) — but the design phase owns
the call after weighing bundle size, SSR/Electron compatibility, and
token-stream reparse cost.

## Source

Promoted from `idea-chat-markdown-and-code-formatting` (parked 2026-05-09).

## Design decisions

- **Library stack: `react-markdown` + `remark-gfm` + `remark-math` +
  `rehype-katex` + `rehype-highlight` + a small local `rehype-citation-chips`
  plugin.** Codebase precedent is React-native rendering everywhere
  (`NoteCard`, `DraftCard`, `SourceCard` — none touch
  `dangerouslySetInnerHTML`); `react-markdown` returns React elements through
  the unified pipeline and lets us swap component renderers via a `components`
  prop. Bundle cost (~180-220 KB gzipped including KaTeX) is acceptable in an
  Electron renderer; the UI is not bandwidth-constrained.
- **Syntax highlighting: `rehype-highlight` (highlight.js / lowlight), not
  Shiki.** Sync API plugs into the rehype pipeline directly; Shiki's async
  initialization adds startup awkwardness for marginal fidelity gains in
  tutoring-grade snippets. Theme is custom, built on the project's CSS
  variables (no `highlight.js/styles/*.css` import); the highlighted
  `<span class="hljs-keyword">` etc. classes are styled in
  `markdown-content.module.css`. Swap-to-Shiki remains an option later if
  fidelity becomes the constraint — the integration boundary is the rehype
  plugin chain, single point of replacement.
- **Math: KaTeX, with `katex/dist/katex.min.css` imported once at the
  renderer entry (`packages/ui/src/mount.tsx`).** CSP `style-src 'self'
  'unsafe-inline'` permits the bundled stylesheet and KaTeX's inline style
  attributes. Vite resolves the CSS's relative `url(...)` font references to
  bundled WOFF2 assets — no external network fetches, no CSP violations.
  `.katex` selectors are well-namespaced; collision risk is low.
- **`\(...\)` and `\[...\]` math delimiters.** `remark-math` handles `$...$`
  and `$$...$$` natively. To support the LaTeX-style delimiters too, a
  pre-pass converts `\(x\)` → `$x$` and `\[x\]` → `$$x$$` before parse.
  Avoids adding a remark plugin for a single regex pair.
- **Streaming partial-parse strategy: balance-the-fence pre-pass, then
  reparse on every paced delivery.** Two block delimiters can eat the rest
  of a streaming message if left unclosed: ` ``` ` (fenced code) and `$$`
  (display math). Pre-pass counts each; if odd, append a synthetic close
  (`\n\`\`\`\n` / `$$`). Inline marks (`**`, `_`, `[`, `*`, `~~`, single `$`)
  degrade to literal characters when unclosed, so they need no special
  handling. Once the real close arrives, the parser uses the first close it
  sees and the synthetic one becomes harmless trailing whitespace inside the
  closed block — content reflows naturally as more chars arrive. Reparse
  cost is acceptable: typical messages are <10KB, parse + render is
  sub-millisecond, well inside one RAF frame.
- **Citation chips: rehype plugin walking the HAST.** Replaces today's
  rendered-tree regex (`renderContentWithCitations`). The plugin walks text
  nodes, splits on `/\[(\d+)\]/g`, and emits a synthetic element with a
  reserved tag name; the `react-markdown` `components` map renders that
  element to `<CitationChip>`. **The plugin skips text inside `<code>` or
  `<pre>` ancestors** so a code example like `arr[1]` stays as code, not a
  chip. Editorial behavior preserved (chip styling, click-to-scroll handler).
- **No raw HTML allowed.** `react-markdown` defaults to disallowing raw HTML
  embedded in markdown. Keep the default — closes an XSS surface and the
  model's markdown output never legitimately needs `<script>` / `<iframe>` /
  arbitrary tags.
- **Link safety: `react-markdown`'s `urlTransform` allowlist + forced
  `target="_blank" rel="noopener noreferrer"`.** Default `urlTransform` blocks
  `javascript:` and other dangerous schemes. The custom `a` component
  override sets the new-tab + opener attrs and applies editorial underline
  styling.
- **Heading sizing in chat context.** Map all six heading levels through the
  `components` prop to two in-bubble visual styles: H1/H2 → editorial mono
  uppercase kicker (paired with a thin rule), H3-H6 → italic display serif
  with descending weight. A model-emitted `# Foo` should look like a
  paragraph break with a kicker, not a 36px title eating the bubble.
- **Code copy button: skipped for v1.** Brief said acceptable but not
  required; reserve for a follow-up after dogfood. Adds clipboard-permission
  paperwork in Electron renderer plus an interactive affordance to design.
- **Tables: included.** `remark-gfm` brings tables, task lists, autolinks,
  strikethrough. Tutors produce comparison tables; no reason to exclude.
- **Memoization: skip for v1.** Reparse on every paced delivery is cheap at
  the message sizes we see; React's reconciler handles the tree diff
  efficiently. If a perf issue surfaces with very long messages, layer a
  `useMemo(() => parse(content), [content])` wrap or split into "settled
  prefix + tail" rendering.

## Architectural choice

**Replace `renderContentWithCitations` in `MessageBubble` with a new
`<MarkdownContent>` component.** The component owns the entire pipeline:
balance-fence pre-pass, the unified processor (remark + rehype + plugins),
the React component overrides, and the streaming integration. `MessageBubble`
hands it a settled `content: string` plus a citation click handler and lets
it render. No other consumer of `MessageBubble` (chat-tab-body,
configure-chat-pane, sidekick-panel) needs to change — the wire format
stays string-in.

**Alternatives considered and rejected:**

- *Bespoke walker over `marked` tokens, build the React tree by hand.*
  Smaller bundle, more code to maintain. Citation chip injection, math
  rendering, and code highlighting all need separate hand-rolled handlers.
  Reinvents what `react-markdown` already gives us in a vetted package.
- *`markdown-it` → HTML string → `dangerouslySetInnerHTML` + `DOMPurify`.*
  Smallest footprint. But `dangerouslySetInnerHTML` would be the first
  occurrence in the codebase and signals "trust the parser" rather than
  "trust the React tree." Streaming reparse rebuilds the entire DOM
  subtree on every delta (no React reconciliation), which is worse, not
  better, for the streaming case.
- *Render-mode toggle (markdown-on for assistant, off for student).* The
  current code already only renders citations for assistant messages; the
  new component will only be used in the assistant path. User messages
  stay as plain text. No mode toggle needed.

## Implementation Units

### Unit 1: `MarkdownContent` component + plugin
**File**: `packages/ui/src/components/markdown-content.tsx` (new)
**File**: `packages/ui/src/components/markdown-content.module.css` (new)
**File**: `packages/ui/src/lib/rehype-citation-chips.ts` (new)
**File**: `packages/ui/src/lib/balance-fences.ts` (new)

```typescript
// markdown-content.tsx
import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { rehypeCitationChips } from "../lib/rehype-citation-chips.js";
import { balanceFences } from "../lib/balance-fences.js";
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

export function MarkdownContent({
  content,
  citationCount,
  onCitationClick,
}: MarkdownContentProps) {
  // Balance unclosed code fences and display-math delimiters so a partial
  // streaming message doesn't render the rest of itself as a giant fenced
  // block. Inline marks (**, *, _, single $, [) degrade to literals when
  // unclosed and need no balancing.
  const balanced = balanceFences(content);

  // Convert LaTeX-style delimiters to dollar form before parse.
  const normalized = balanced
    .replace(/\\\(((?:[^\\]|\\(?!\)))*?)\\\)/g, "$$$1$$")
    .replace(/\\\[((?:[^\\]|\\(?!\]))*?)\\\]/g, "$$$$$1$$$$");

  return (
    <div className={styles.root}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
          rehypeCitationChips,
        ]}
        components={{
          h1: (props) => <h2 className={styles.kickerHeading} {...props} />,
          h2: (props) => <h3 className={styles.kickerHeading} {...props} />,
          h3: (props) => <h4 className={styles.editorialHeading} {...props} />,
          h4: (props) => <h5 className={styles.editorialHeading} {...props} />,
          h5: (props) => <h6 className={styles.editorialHeading} {...props} />,
          h6: (props) => <h6 className={styles.editorialHeading} {...props} />,
          a: ({ href, children, ...rest }) => (
            <a
              {...rest}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              {children}
            </a>
          ),
          // The synthetic citation-chip element from rehype-citation-chips
          // is registered with a reserved tag name we map to <CitationChip>.
          "citation-chip": ({ "data-index": index, ...rest }: any) => (
            <CitationChip
              index={Number(index)}
              onClick={onCitationClick ?? (() => undefined)}
            />
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
```

```typescript
// lib/balance-fences.ts
/**
 * Append synthetic close delimiters for unbalanced ``` and $$ pairs.
 * Avoids "rest of stream rendered as giant fenced block" pathology while
 * a partial message is being streamed character-by-character.
 *
 * Inline marks (**, *, _, $, [) intentionally NOT balanced — markdown
 * treats them as literal characters when unclosed.
 */
export function balanceFences(input: string): string {
  let out = input;
  const fenceCount = (out.match(/^```/gm) ?? []).length
    + (out.match(/\n```/g) ?? []).length;
  if (fenceCount % 2 === 1) {
    out += out.endsWith("\n") ? "```\n" : "\n```\n";
  }
  // Count $$ that are line-leading or following whitespace to avoid
  // counting `$$` inside other contexts. Practical: split on `$$` and
  // check if the count is odd.
  const dollarPairs = out.split("$$").length - 1;
  if (dollarPairs % 2 === 1) {
    out += "\n$$";
  }
  return out;
}
```

```typescript
// lib/rehype-citation-chips.ts
import type { Plugin } from "unified";
import type { Root, Element, Text, Parent } from "hast";
import { visit } from "unist-util-visit";

const CHIP_REGEX = /\[(\d+)\]/g;

/**
 * Walk text nodes; for each [N] match, replace the text node with
 * (text-before, <citation-chip data-index="N" />, text-after).
 * SKIPS text inside <code> or <pre> ancestors so code examples like
 * `arr[1]` stay as code, not as chips.
 */
export const rehypeCitationChips: Plugin<[], Root> = () => (tree) => {
  visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
    if (parent === undefined || index === undefined) return;
    // Skip text inside code/pre — checked by walking up the visitor's
    // ancestor stack, but unist-util-visit's signature gives us only the
    // immediate parent. We also need to bail if any ancestor is code/pre.
    // Implementation note: use `visitParents` instead of `visit` to access
    // the full ancestor chain and bail if any is `code` or `pre`.
    // (Code shown collapsed for readability; full impl uses visitParents.)
    const value = node.value;
    if (!CHIP_REGEX.test(value)) return;
    CHIP_REGEX.lastIndex = 0;
    const replacements: Array<Text | Element> = [];
    let last = 0;
    for (let m = CHIP_REGEX.exec(value); m !== null; m = CHIP_REGEX.exec(value)) {
      if (m.index > last) {
        replacements.push({ type: "text", value: value.slice(last, m.index) });
      }
      replacements.push({
        type: "element",
        tagName: "citation-chip",
        properties: { dataIndex: m[1] },
        children: [],
      });
      last = m.index + m[0].length;
    }
    if (last < value.length) {
      replacements.push({ type: "text", value: value.slice(last) });
    }
    parent.children.splice(index, 1, ...replacements);
    return index + replacements.length;
  });
};
```

```css
/* markdown-content.module.css */
.root {
  line-height: 1.6;
  word-break: break-word;
}

.root :global(p) {
  margin: 0 0 0.6em 0;
}
.root :global(p):last-child {
  margin-bottom: 0;
}

.root :global(ul),
.root :global(ol) {
  margin: 0 0 0.6em 1.2em;
  padding: 0;
}

.root :global(li) {
  margin: 0.15em 0;
}

.root :global(blockquote) {
  border-left: 2px solid var(--color-border);
  margin: 0.6em 0;
  padding: 0.1em 0 0.1em 0.8em;
  color: var(--color-text-muted);
  font-style: italic;
}

.kickerHeading {
  composes: editorial from global;
  font-style: normal;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-text-muted);
  margin: 0.8em 0 0.2em 0;
}

.editorialHeading {
  composes: editorial from global;
  font-size: 1rem;
  margin: 0.6em 0 0.2em 0;
  color: var(--color-text);
}

.link {
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 0.15em;
}

.root :global(code) {
  font-family: var(--font-mono);
  font-size: 0.92em;
  background: var(--color-surface);
  border-radius: 3px;
  padding: 0.05em 0.3em;
}

.root :global(pre) {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 0.7em 0.9em;
  overflow-x: auto;
  margin: 0.6em 0;
}

.root :global(pre code) {
  background: transparent;
  padding: 0;
  font-size: 0.88em;
  line-height: 1.55;
}

/* highlight.js token classes — custom palette using project CSS vars
   instead of importing a prebuilt theme stylesheet. Kept restrained;
   no syntax-rainbow look. */
.root :global(.hljs-keyword),
.root :global(.hljs-selector-tag),
.root :global(.hljs-built_in) {
  color: var(--color-accent);
}
.root :global(.hljs-string),
.root :global(.hljs-attr) {
  color: #b4d28d;
}
.root :global(.hljs-number),
.root :global(.hljs-literal) {
  color: #d8a37b;
}
.root :global(.hljs-comment) {
  color: var(--color-text-muted);
  font-style: italic;
}
.root :global(.hljs-title),
.root :global(.hljs-section) {
  color: var(--color-text);
  font-weight: 600;
}

/* GFM tables */
.root :global(table) {
  border-collapse: collapse;
  margin: 0.6em 0;
  font-size: 0.95em;
}
.root :global(th),
.root :global(td) {
  border-bottom: 1px solid var(--color-border);
  padding: 0.3em 0.6em;
  text-align: left;
}
.root :global(th) {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.78rem;
  color: var(--color-text-muted);
  font-weight: 600;
}

/* KaTeX block math centering / spacing — KaTeX provides its own font
   styling; we only adjust block layout. */
.root :global(.katex-display) {
  margin: 0.6em 0;
  overflow-x: auto;
}
```

**Implementation Notes**:

- The `rehype-citation-chips` plugin must use `visitParents` (not `visit`)
  so it can inspect the ancestor chain and skip when any ancestor is a
  `code` or `pre` element. Pseudocode collapses this for readability;
  the real impl walks ancestors.
- KaTeX CSS import lives in `mount.tsx` — one line: `import
  "katex/dist/katex.min.css";` after the existing
  `import "./styles/global.css";`. The CSS uses relative `url(...)` for
  fonts which Vite resolves to bundled WOFF2 assets at build time. No
  CSP changes required.
- highlight.js language coverage: the `lowlight` registry in
  `rehype-highlight`'s common bundle covers ~35 languages including
  JS/TS/Python/Java/C++/Go/Rust/Ruby/PHP/Bash/SQL/HTML/CSS/JSON/YAML/Markdown.
  Pass `{ detect: true, ignoreMissing: true }` so unknown languages
  silently fall through to plain `<code>`.
- The `components` prop's `"citation-chip"` key uses a hyphen so React
  treats it as a custom element name; react-markdown supports this for
  HAST elements with non-standard tags. The cast through `any` is the
  cleanest way to capture `data-*` attributes; isolated to one component.

**Acceptance Criteria**:

- [ ] `<MarkdownContent>` renders paragraphs, bullet/numbered lists, bold,
      italic, links, blockquotes, inline `code`, fenced code blocks with
      language tags, GFM tables, GFM task lists, GFM strikethrough.
- [ ] Inline math `$x^2$` and block math `$$\int f$$` render via KaTeX.
- [ ] LaTeX-style `\(x\)` and `\[x\]` math delimiters also render.
- [ ] Code fences highlight with the custom palette; unknown languages
      fall through to plain monospace without throwing.
- [ ] Citation chips `[1]`, `[2]` render via `<CitationChip>` outside
      code; `arr[1]` inside a code block renders as code text, no chip.
- [ ] Links open in a new tab with `rel="noopener noreferrer"`;
      `javascript:` and other dangerous schemes are blocked by
      `react-markdown`'s default `urlTransform`.
- [ ] Headings use editorial styling (mono kicker for H1/H2, italic
      serif for H3-H6).
- [ ] An unclosed ` ``` ` fence in the input renders as a bounded code
      block (does not consume the tail of the message).
- [ ] An unclosed `$$` math block similarly bounded.
- [ ] No raw HTML in the input renders as HTML; it appears as escaped
      text (default `react-markdown` behavior).

### Unit 2: Wire `MarkdownContent` into `MessageBubble`
**File**: `packages/ui/src/components/message.tsx` (modify)
**File**: `packages/ui/src/components/message.module.css` (modify, minor)

Replace `renderContentWithCitations(displayContent, citations, handleCitationClick)`
at line 97 with `<MarkdownContent content={displayContent} citationCount={citations?.length}
onCitationClick={handleCitationClick} />`. Delete the `renderContentWithCitations`
function and the `CHIP_REGEX` const. The streaming-cursor `▋` blink
animation in `message.module.css:68-72` uses `.streaming .content::after` —
that selector targets the old `<p class="content">`. Re-anchor it to the
`<MarkdownContent>` root or move the cursor to a sibling element appended
after the markdown root when `streaming === true`.

```typescript
// message.tsx — replacement excerpt
import { MarkdownContent } from "./markdown-content.js";

// inside MessageBubble:
{role === "assistant" ? (
  <MarkdownContent
    content={displayContent}
    {...(citations !== undefined && { citationCount: citations.length })}
    onCitationClick={handleCitationClick}
  />
) : (
  <p className={styles.content}>{displayContent}</p>
)}
```

User bubbles still use the old plain-text `<p>` path — student input is
literal, never markdown. This keeps the user message rendering unchanged
and the visual contrast (assistant has formatting, user doesn't) is
correct.

**Implementation Notes**:

- `renderContentWithCitations` is no longer called and deletes cleanly;
  there's no test pinning it. The `CHIP_REGEX` const and that function
  block (`message.tsx:40-66`) go away.
- Streaming cursor: easiest is appending `<span className={styles.cursor}
  aria-hidden />` after `<MarkdownContent>` when `streaming === true`,
  and moving the `::after` blink rule to `.cursor`.
- The `citations`/`drafts`/`notes`/`dueCards` sections below the message
  body are unchanged — they render their own components and don't go
  through markdown.

**Acceptance Criteria**:

- [ ] Existing tests in `episodic-to-messages.test.ts` and
      `use-streamed-send.test.tsx` still pass without modification —
      the `ChatMessage` shape is unchanged.
- [ ] Visual: send a message with `**bold**`, a fenced code block, and
      `$x^2$`; all three render correctly in the assistant bubble.
- [ ] Visual: user typing `**foo**` shows the literal asterisks (user
      bubble bypasses markdown).
- [ ] Streaming cursor still blinks at the end of an in-flight assistant
      message.
- [ ] Citation chips clickable → scroll to source card (existing
      `handleCitationClick` behavior preserved).

### Unit 3: Tests
**File**: `packages/ui/src/__tests__/markdown-content.test.tsx` (new)
**File**: `packages/ui/src/__tests__/balance-fences.test.ts` (new)
**File**: `packages/ui/src/__tests__/rehype-citation-chips.test.ts` (new)
**File**: `packages/ui/src/__tests__/message.test.tsx` (new — pin
the integration in MessageBubble)

```typescript
// markdown-content.test.tsx — sketch of coverage
describe("MarkdownContent", () => {
  it("renders paragraphs and bullet lists");
  it("renders bold, italic, inline code");
  it("renders fenced code blocks with language tag");
  it("renders fenced code with no language as plain monospace");
  it("renders inline math via KaTeX");
  it("renders block math via KaTeX");
  it("renders \\(...\\) and \\[...\\] math delimiters");
  it("renders citation chips outside code");
  it("does NOT render citation chips inside fenced code blocks");
  it("does NOT render citation chips inside inline code");
  it("forces target=_blank rel=noopener on links");
  it("blocks javascript: links via default urlTransform");
  it("renders GFM tables");
  it("escapes raw HTML — does not render <script> as a tag");
  it("renders headings with editorial styling");
});

// balance-fences.test.ts
describe("balanceFences", () => {
  it("returns input unchanged when fences balanced");
  it("appends synthetic close for unclosed code fence");
  it("appends synthetic close for unclosed $$ math");
  it("handles both unclosed code fence and $$ in same input");
  it("does not double-close already-balanced input");
});

// rehype-citation-chips.test.ts
describe("rehype-citation-chips", () => {
  it("converts [N] to citation-chip element in plain text");
  it("preserves [N] in <code> ancestors");
  it("preserves [N] in <pre> ancestors");
  it("preserves text-before and text-after around the chip");
  it("handles multiple chips in one text node");
});

// message.test.tsx
describe("MessageBubble integration", () => {
  it("user bubble renders content as plain text (no markdown)");
  it("assistant bubble renders content as markdown");
  it("streaming cursor appears at end of streaming assistant bubble");
  it("citation chip click invokes the existing scroll handler");
});
```

**Implementation Notes**:

- Tests use the existing `ui-test-helper` patterns — no
  `<PraxisClientProvider>` needed for `MarkdownContent` since it's
  context-free. `<MessageBubble>` integration tests may or may not
  need the provider depending on what `<CitationChip>` reads from
  context (currently nothing).
- Vitest jsdom environment renders KaTeX synchronously to inline HTML
  + classes. Assertions can match KaTeX output by selector
  (`document.querySelector(".katex")`), not by exact HTML, so the
  test stays robust to KaTeX version bumps.
- KaTeX CSS isn't imported in tests (no `mount.tsx` boot). KaTeX
  output classes still render correctly without the stylesheet — the
  tests assert structure, not visual fidelity.
- For the citation-chips test against `<code>` ancestors: parse a
  small markdown sample with the full pipeline and assert the rendered
  output contains literal `arr[1]` text inside `<code>` and a
  `<CitationChip>` outside.

**Acceptance Criteria**:

- [ ] All test cases above pass.
- [ ] No new lint errors in the touched files.
- [ ] `pnpm test` workspace-wide stays green.

### Unit 4: Dependency add + KaTeX CSS import
**File**: `packages/ui/package.json` (modify)
**File**: `packages/ui/src/mount.tsx` (modify — one line)

Add to `packages/ui/package.json` dependencies:

```json
"react-markdown": "^9.0.0",
"remark-gfm": "^4.0.0",
"remark-math": "^6.0.0",
"rehype-katex": "^7.0.0",
"rehype-highlight": "^7.0.0",
"katex": "^0.16.0",
"unist-util-visit": "^5.0.0",
"hast-util-from-html": "^2.0.0"
```

(Concrete version pins resolved at install via `pnpm add -F @praxis/ui ...`.)

In `mount.tsx`, add after the existing `import "./styles/global.css";`:

```typescript
import "katex/dist/katex.min.css";
```

**Implementation Notes**:

- `unist-util-visit` (or `unist-util-visit-parents` for the ancestor
  walk) is a transitive dep of remark/rehype anyway; adding it as a
  direct dep makes the citation plugin's import explicit.
- Verify Vite picks up `katex/dist/katex.min.css` font URLs and emits
  bundled WOFF2s in `dist/`. If Vite produces a build warning about
  unresolved fonts, add `katex/dist/fonts/*.woff2` to `optimizeDeps`
  or add an `assets` rule — unlikely needed since Vite handles font
  URLs in CSS imports out-of-the-box.
- Run `pnpm rebuild canvas better-sqlite3` after install if Electron
  ABI bindings get clobbered — standard postinstall dance per CLAUDE.md.

**Acceptance Criteria**:

- [ ] `pnpm install` succeeds at the workspace root.
- [ ] `pnpm --filter @praxis/ui build` produces a bundle that includes
      KaTeX fonts as bundled assets.
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm dev` launches Electron, chat surface renders, no CSP
      violations in renderer DevTools console.

## Implementation Order

1. **Unit 4** — add deps and KaTeX CSS import. Land first; subsequent
   units `import` from the new deps and the typecheck depends on them.
2. **Unit 1** — create `MarkdownContent`, `balance-fences`,
   `rehype-citation-chips`, and the CSS module. Self-contained; can
   typecheck and unit-test in isolation.
3. **Unit 2** — wire into `MessageBubble`. One-line replacement plus the
   streaming-cursor relocation.
4. **Unit 3** — tests. Authored alongside Units 1 and 2 in practice
   (TDD-friendly), but listed separately as the acceptance gate.

After: run `pnpm dev`, send a message with markdown / code / math, eyeball
the rendering against the acceptance criteria. The eyeball pass is the
non-automated portion of the test plan.

## Testing

### Unit Tests
Per Unit 3 above.

### Integration Points
- `MessageBubble` ↔ `MarkdownContent`: validated by Unit 2 tests in
  `message.test.tsx`. The seam is the props contract; nothing else
  crosses.
- `MarkdownContent` ↔ `useEasedStream`: no direct coupling. Eased
  content is a string passed through `displayContent` →
  `MarkdownContent`. Streaming behavior validated by an end-to-end
  test that simulates progressive `content` updates and asserts
  intermediate renders are bounded (no rest-of-message-as-code).
- Replay parity: `episodicToMessages` already produces
  `ChatMessage[]`; the same content flows through `MessageBubble`
  and `MarkdownContent`. Existing replay tests remain green
  unchanged because the `ChatMessage` shape is unchanged.

### Test Data
- A small set of markdown fixtures in
  `packages/ui/src/__tests__/fixtures/markdown-samples.ts`:
  paragraph, list, bold/italic, code-block-py, code-block-no-lang,
  inline-math, block-math, latex-paren-math, citations-mixed-with-code,
  table, blockquote, raw-html-attempt, javascript-link.

## Risks

1. **Bundle size +180-220 KB gzipped.** Acceptable for Electron
   (renderer ships in a 100MB+ binary; no bandwidth constraint). If a
   web/hosted deployment surfaces in the future, lazy-load
   `MarkdownContent` via `React.lazy` so the chat surface ships without
   it on the initial route load.
2. **KaTeX CSS class collisions.** `.katex` classes are namespaced and
   well-known; collision risk is low. Mitigation if seen: scope the
   KaTeX import via a CSS-module wrapper element with `:global`
   constraint, or fork the stylesheet's class names. Cheap to fix
   later if it surfaces.
3. **Streaming partial-parse pathologies beyond fences.** Unclosed
   inline marks degrade gracefully (markdown treats them as literal),
   so balanced-fences pre-pass plus default behavior should cover the
   space. Tests pin the cases. If a new pathology emerges (e.g., an
   unclosed table syntax), add a balancing rule to `balance-fences.ts`.
4. **highlight.js fidelity.** Lower-fidelity tokenizer than Shiki
   (used by VS Code). Mitigation: the integration boundary is the
   rehype plugin chain; swap-to-Shiki is a single-file change if
   tutoring code samples become noticeably mis-tokenized. Defer until
   evidence accumulates.
5. **citation-chip plugin re-rendering.** The plugin runs on every
   parse (every paced delivery during streaming). Cost: O(text-node
   count). Acceptable. If profiling shows it's hot, memoize on
   `content` identity at the `MarkdownContent` root (`useMemo` over
   the parsed tree).
6. **Math inside markdown emphasis.** A model could emit `**$x^2$**`
   (bold math). `remark-math` parses math first; the bold context may
   or may not render as expected. Untested; add a fixture if it
   surfaces. Current expectation: KaTeX output sits inside a `<strong>`
   tag and visually inherits weight, which is acceptable.

## No child stories

Single-stride feature: one component, three small library files, one
CSS module, one wiring change in `MessageBubble`, one new test file.
No parallelizable units, no resume-point need, no heterogeneous
acceptance surfaces. All four units land in one implementation pass
under `/agile-workflow:implement`.

## Implementation notes

- **Files added**:
  - `packages/ui/src/lib/balance-fences.ts`
  - `packages/ui/src/lib/rehype-citation-chips.ts`
  - `packages/ui/src/components/markdown-content.tsx`
  - `packages/ui/src/components/markdown-content.module.css`
  - `packages/ui/src/__tests__/balance-fences.test.ts` (8 tests)
  - `packages/ui/src/__tests__/rehype-citation-chips.test.ts` (7 tests)
  - `packages/ui/src/__tests__/markdown-content.test.tsx` (18 tests)
  - `packages/ui/src/__tests__/message.test.tsx` (9 tests)

- **Files modified**:
  - `packages/ui/src/components/message.tsx` — replaced `renderContentWithCitations`
    helper and `CHIP_REGEX` with `<MarkdownContent>` for the assistant branch;
    user branch continues to render plain text via `<p className={styles.content}>`.
    Streaming cursor moved to a sibling `<span aria-hidden>` element rendered
    when `streaming === true`.
  - `packages/ui/src/components/message.module.css` — replaced
    `.streaming .content::after` with a standalone `.cursor` class using
    `::before` content + the existing `blink` keyframes.
  - `packages/ui/src/mount.tsx` — added `import "katex/dist/katex.min.css";`
    after the global stylesheet.
  - `packages/ui/package.json` — added `react-markdown ^10.1.0`,
    `remark-gfm ^4.0.1`, `remark-math ^6.0.0`, `rehype-katex ^7.0.1`,
    `rehype-highlight ^7.0.2`, `katex ^0.16.45`, `unist-util-visit-parents ^6.0.2`;
    devDep `@types/hast`.

- **Discrepancies from design**:
  - **react-markdown v10, not v9.** The design pinned `^9.0.0`; npm currently
    publishes v10. API used in the design (the `components` prop, plugin
    arrays, `node` prop on custom-element renderers) is unchanged in v10.
  - **`balance-fences` fence-counting formula.** The design summed
    `(/^```/gm count) + (\n``` count)`, which double-counts every fence after
    the first (the `m` flag's `^` already matches positions immediately after
    `\n`, so the second regex re-matches the same characters). Replaced with
    a single `/^[ \t]{0,3}```/gm` count — same intent, correctly counted, plus
    it tolerates the up-to-3-space indent that CommonMark allows before a
    fence.
  - **Plugin type imported locally.** The design used `Plugin<[], Root>` from
    `"unified"`. Adding `unified` as a direct dep solely for one type is
    overkill; defined a local `type RehypePlugin = () => (tree: Root) => void`
    instead. Identical contract.
  - **`Components` typing for the custom element.** Design suggested an `any`
    cast on the `"citation-chip"` renderer. Used a typed intersection
    `Components & { "citation-chip": (props: any) => ReactElement | null }`
    so the rest of the components map keeps full react-markdown typings; only
    the custom-tag renderer escapes the static check.
  - **Test render helper.** Biome's `useValidAriaRole` lint flags literal
    `role="user" | role="assistant"` JSX attributes (it reads `role` as the
    ARIA role attribute, not a domain prop). The MessageBubble component's
    `role` is a speaker discriminator (existing wire shape, used by
    `chat-tab-body` etc. with expression form). Tests use a `renderBubble`
    helper that spreads props rather than passing `role` as a JSX literal.

- **Adjacent issues parked**: none. The change is bounded.

- **Visual smoke pass deferred to review.** The implementation passes all
  automated acceptance criteria (42 new tests, all 624 UI tests, full
  workspace 2312 tests). The "launch Electron, eyeball markdown rendering
  in the chat surface, confirm no CSP violations" criterion from Unit 4 is
  the manual portion and belongs to the reviewer's pass.

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- No explicit heading-mapping assertion in the test suite (e.g., "h1 renders
  inside `<h2 class=kickerHeading>`"). Wiring is type-checked via the typed
  `Components` map; visual styling is via CSS module class composition.
  Adding one or two assertions would be cheap but the failure mode is benign
  (style regression, not behavior).
- GFM task-list and strikethrough rendering not exercised by the new tests —
  they come transitively from `remark-gfm` and are exercised in that
  package's own suite.
- `Number(raw)` in the citation-chip renderer would coerce a `null`/`""`
  property to `0` and pass `Number.isFinite(0) === true`, rendering a
  `<CitationChip index={0}>`. The plugin always emits a numeric string so
  this is not reachable today; consider tightening to `Number.isInteger` if
  the plugin is ever called from a less-trusted upstream.

**Notes**:
- CSP confirmed permissive for KaTeX inline styles (`packages/desktop/electron/renderer/index.html:8`
  carries `style-src 'self' 'unsafe-inline'`); no CSP changes required.
- Foundation-doc alignment: `docs/UX.md:283` already asserted "math
  expressions render via KaTeX; plots render inline; code blocks with syntax
  highlighting." The implementation closes the prior gap between that
  assertion and the actual chat surface — no rolling-foundation update
  required (the assertion is now correct; previously it was forward-looking).
- Components map for `<MarkdownContent>` is recreated on every render; the
  design explicitly deferred memoization until perf evidence accumulates,
  which is a reasonable call at the current message sizes.
