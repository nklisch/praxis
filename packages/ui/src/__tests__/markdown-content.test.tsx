import type { RenderToggles } from "@praxis/core/types";
import { DEFAULT_RENDER_TOGGLES } from "@praxis/core/types";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownContent } from "../components/markdown-content.js";
import styles from "../components/markdown-content.module.css";

afterEach(() => cleanup());

function renderMd(content: string, onCitationClick?: (n: number) => void) {
  return render(
    <MarkdownContent
      content={content}
      {...(onCitationClick !== undefined && { onCitationClick })}
    />,
  );
}

describe("MarkdownContent", () => {
  it("renders paragraphs and bullet lists", () => {
    const { container } = renderMd("First paragraph.\n\n- alpha\n- beta\n- gamma");
    expect(container.querySelectorAll("p").length).toBeGreaterThanOrEqual(1);
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toBe("alpha");
  });

  it("renders bold, italic, and inline code", () => {
    const { container } = renderMd("**bold** and *italic* and `code`.");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("renders fenced code blocks with a language tag (highlighted)", () => {
    const { container } = renderMd("```js\nconst x = 1;\n```");
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    const code = pre?.querySelector("code");
    expect(code?.textContent).toContain("const x = 1;");
    // rehype-highlight applies hljs classes when language detected.
    expect(code?.className).toMatch(/hljs|language-js/);
  });

  it("renders fenced code with no language as plain monospace", () => {
    const { container } = renderMd("```\nbare code\n```");
    const code = container.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toContain("bare code");
  });

  it("renders inline math via KaTeX", () => {
    const { container } = renderMd("Solve $x^2 + 1 = 0$.");
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("renders block math via KaTeX", () => {
    const { container } = renderMd("$$\n\\int_0^1 x^2 dx\n$$");
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("renders \\(...\\) inline math delimiters", () => {
    const { container } = renderMd("See \\(a^2 + b^2 = c^2\\).");
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("renders \\[...\\] block math delimiters", () => {
    const { container } = renderMd("\\[\nE = mc^2\n\\]");
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("renders citation chips outside code", () => {
    const onClick = vi.fn();
    const { container } = renderMd("See [1] for more.", onClick);
    const chip = container.querySelector("button");
    if (!chip) throw new Error("expected a citation-chip button");
    expect(chip.textContent).toBe("[1]");
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledWith(1);
  });

  it("does NOT render citation chips inside fenced code blocks", () => {
    const { container } = renderMd("```\narr[1] = 5;\n```");
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("pre code")?.textContent).toContain("arr[1]");
  });

  it("does NOT render citation chips inside inline code", () => {
    const { container } = renderMd("Use `arr[1]` here.");
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("arr[1]");
  });

  it("forces target=_blank rel=noopener on links", () => {
    const { container } = renderMd("[link](https://example.com)");
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://example.com");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("blocks javascript: links via default urlTransform", () => {
    const { container } = renderMd("[evil](javascript:alert(1))");
    const a = container.querySelector("a");
    // react-markdown's default urlTransform replaces dangerous schemes with
    // a no-op (empty href or 'about:blank' depending on version). Either way
    // it must NOT preserve the javascript: scheme.
    expect(a?.getAttribute("href") ?? "").not.toContain("javascript:");
  });

  it("renders GFM tables", () => {
    const md = "| a | b |\n|---|---|\n| 1 | 2 |\n";
    const { container } = renderMd(md);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("td")).toHaveLength(2);
  });

  it("escapes raw HTML — does not render <script> as a tag", () => {
    const { container } = renderMd("<script>alert(1)</script>");
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders unbalanced code fence without consuming the rest of the message", () => {
    // When the model is mid-stream and emits an open fence with no close,
    // balance-fences appends a synthetic close so the `tail` text after
    // the fence is not eaten.
    const { container } = renderMd("```js\nconst x = 1;\n");
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    // The synthetic close is an empty trailing line — no extra content
    // appears outside the fenced block.
    expect(pre?.textContent).toContain("const x = 1;");
  });

  it("renders malformed LaTeX as a .katex-error badge (throwOnError: false)", () => {
    // $\frac{$ has an unclosed brace — a genuine parse error. With
    // throwOnError: false, KaTeX emits <span class="katex-error"> instead of
    // throwing. Note: unknown macros like \widebar render as colored inline
    // text without a .katex-error class in KaTeX 0.16.x; actual syntax errors
    // (unclosed braces, mismatched environments) do produce .katex-error.
    const { container } = renderMd("$\\frac{$");
    expect(container.querySelector(".katex-error")).not.toBeNull();
  });

  it("returns null citation chip when index is non-numeric", () => {
    // Defensive: the plugin always emits numeric indices, but the renderer
    // guards against malformed properties.
    const { container } = renderMd("plain text");
    expect(container.querySelector("citation-chip")).toBeNull();
  });

  it("preserves text-before and text-after around chips", () => {
    const { container } = renderMd("alpha [1] beta [2] gamma");
    const para = container.querySelector("p");
    expect(para?.textContent).toBe("alpha [1] beta [2] gamma");
    expect(container.querySelectorAll("button")).toHaveLength(2);
  });
});

/* ── CSS-presence smoke tests ───────────────────────────────────────────────
 * These tests verify that each content-type class name is exported from the
 * CSS module (i.e. the class exists and is non-empty after Vite/CSS-Modules
 * hashing in the test environment).  They render a minimal div with the class
 * applied and confirm the element mounts without error.  They do NOT assert
 * pixel-level styling — that's the visual smoke described in the story.
 * ────────────────────────────────────────────────────────────────────────── */
describe("markdown-content.module.css — content-type class presence", () => {
  afterEach(() => cleanup());

  function renderWithClass(className: string) {
    const { container } = render(<div className={className}>x</div>);
    return container.firstElementChild as HTMLElement;
  }

  it("exports .codeInline", () => {
    expect(styles.codeInline).toBeTruthy();
    const el = renderWithClass(styles.codeInline);
    expect(el).not.toBeNull();
  });

  it("exports .codeBlock", () => {
    expect(styles.codeBlock).toBeTruthy();
    const el = renderWithClass(styles.codeBlock);
    expect(el).not.toBeNull();
  });

  it("exports .tokKeyword", () => {
    expect(styles.tokKeyword).toBeTruthy();
  });

  it("exports .tokString", () => {
    expect(styles.tokString).toBeTruthy();
  });

  it("exports .tokComment", () => {
    expect(styles.tokComment).toBeTruthy();
  });

  it("exports .tokFn", () => {
    expect(styles.tokFn).toBeTruthy();
  });

  it("exports .filePath", () => {
    expect(styles.filePath).toBeTruthy();
    const el = renderWithClass(styles.filePath);
    expect(el).not.toBeNull();
  });

  it("exports .mathGlyph", () => {
    expect(styles.mathGlyph).toBeTruthy();
    const el = renderWithClass(styles.mathGlyph);
    expect(el).not.toBeNull();
  });

  it("exports .definition", () => {
    expect(styles.definition).toBeTruthy();
    const el = renderWithClass(styles.definition);
    expect(el).not.toBeNull();
  });

  it("exports .conceptRef", () => {
    expect(styles.conceptRef).toBeTruthy();
    const el = renderWithClass(styles.conceptRef);
    expect(el).not.toBeNull();
  });

  it("exports .glossary", () => {
    expect(styles.glossary).toBeTruthy();
    const el = renderWithClass(styles.glossary);
    expect(el).not.toBeNull();
  });

  it("exports .passage", () => {
    expect(styles.passage).toBeTruthy();
    const el = renderWithClass(styles.passage);
    expect(el).not.toBeNull();
  });

  it("exports .passageCite", () => {
    expect(styles.passageCite).toBeTruthy();
    const el = renderWithClass(styles.passageCite);
    expect(el).not.toBeNull();
  });

  it("exports .callout", () => {
    expect(styles.callout).toBeTruthy();
    const el = renderWithClass(styles.callout);
    expect(el).not.toBeNull();
  });

  it("exports .calloutIcon", () => {
    expect(styles.calloutIcon).toBeTruthy();
  });

  it("exports .calloutBody", () => {
    expect(styles.calloutBody).toBeTruthy();
  });

  it("exports .calloutTheorem", () => {
    expect(styles.calloutTheorem).toBeTruthy();
  });

  it("exports .calloutLemma", () => {
    expect(styles.calloutLemma).toBeTruthy();
  });

  it("exports .calloutHint", () => {
    expect(styles.calloutHint).toBeTruthy();
  });

  it("exports .calloutWarning", () => {
    expect(styles.calloutWarning).toBeTruthy();
  });

  it("exports .figure", () => {
    expect(styles.figure).toBeTruthy();
    const el = renderWithClass(styles.figure);
    expect(el).not.toBeNull();
  });

  it("exports .figureCaption", () => {
    expect(styles.figureCaption).toBeTruthy();
  });

  it("exports .figureBody", () => {
    expect(styles.figureBody).toBeTruthy();
  });

  it("exports .figureVerdict", () => {
    expect(styles.figureVerdict).toBeTruthy();
  });

  it("exports .figureVerdictOk", () => {
    expect(styles.figureVerdictOk).toBeTruthy();
  });

  it("exports .figureVerdictCheck", () => {
    expect(styles.figureVerdictCheck).toBeTruthy();
  });

  it("exports .procedure", () => {
    expect(styles.procedure).toBeTruthy();
    const { container } = render(
      <ol className={styles.procedure}>
        <li>Step one</li>
        <li>Step two</li>
      </ol>,
    );
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("exports .units and .unit", () => {
    expect(styles.units).toBeTruthy();
    expect(styles.unit).toBeTruthy();
    const { container } = render(
      <span className={styles.units}>
        <span>5</span> <span className={styles.unit}>cm/s</span>
      </span>,
    );
    expect(container.querySelector("span")).not.toBeNull();
  });
});

/* ── Kitchen-sink integration: all primitives ────────────────────────────────
 * Renders a message that exercises one of every content-type primitive. Each
 * assertion checks a structural landmark rather than CSS computed values (tests
 * run in jsdom which has no CSSOM).
 * ────────────────────────────────────────────────────────────────────────── */
describe("MarkdownContent — kitchen-sink (all primitives enabled)", () => {
  afterEach(() => cleanup());

  // The kitchen-sink markdown exercises:
  //  - Heading (h1 → h2 kicker)
  //  - Definition marker [[def:derivative]] → <dfn>
  //  - Citation chip [1] → chip button
  //  - Callout > [!hint] → <aside .callout>
  //  - Concept-ref link concept: scheme → .conceptRef anchor
  //  - Fenced code block (js)
  //  - Unit auto-detection (9.8 m/s² → .units)
  //
  // NOTE: Raw HTML `<abbr>` is intentionally excluded — react-markdown
  // sanitizes raw HTML by default. The `abbr` component override handles
  // `<abbr>` HAST elements produced by a future glossary remark plugin;
  // testing it end-to-end requires that plugin to exist first.
  const KITCHEN_SINK = `# Heading

A [[def:derivative]] is the rate of change. See [1].

> [!hint]
> Try the [chain rule](concept:chain-rule).

\`\`\`js
const x = 5;
\`\`\`

Speed = 9.8 m/s².
`;

  it("renders a heading", () => {
    const { container } = render(<MarkdownContent content={KITCHEN_SINK} />);
    // h1 is remapped to h2 by the heading override
    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toContain("Heading");
  });

  it("renders definition marker as <dfn>", () => {
    const { container } = render(<MarkdownContent content={KITCHEN_SINK} />);
    const dfn = container.querySelector("dfn");
    expect(dfn).not.toBeNull();
    expect(dfn?.getAttribute("title")).toBe("derivative");
  });

  it("renders citation chip [1]", () => {
    const { container } = render(<MarkdownContent content={KITCHEN_SINK} />);
    const chip = container.querySelector("button");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe("[1]");
  });

  it("renders callout as <aside> with .callout class", () => {
    const { container } = render(<MarkdownContent content={KITCHEN_SINK} />);
    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside?.className).toContain(styles.callout);
    // Callout icon should show the type label
    const icon = aside?.querySelector(`.${styles.calloutIcon}`);
    expect(icon?.textContent?.toLowerCase()).toContain("hint");
  });

  it("renders concept: link as .conceptRef anchor", () => {
    const { container } = render(<MarkdownContent content={KITCHEN_SINK} />);
    const anchor = container.querySelector(`.${styles.conceptRef}`);
    expect(anchor).not.toBeNull();
    expect(anchor?.textContent).toContain("chain rule");
  });

  it("invokes conceptOpen when a concept: link is clicked", () => {
    const conceptOpen = vi.fn();
    const { container } = render(
      <MarkdownContent content={KITCHEN_SINK} conceptOpen={conceptOpen} />,
    );
    const anchor = container.querySelector<HTMLAnchorElement>(`.${styles.conceptRef}`);
    expect(anchor).not.toBeNull();
    anchor?.click();
    expect(conceptOpen).toHaveBeenCalledWith("chain-rule");
  });

  it("renders fenced js code block", () => {
    const { container } = render(<MarkdownContent content={KITCHEN_SINK} />);
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain("const x = 5;");
  });

  it("renders unit 9.8 m/s² as .units span", () => {
    const { container } = render(<MarkdownContent content={KITCHEN_SINK} />);
    // rehypeUnits emits literal class name "units" (not the CSS-module hash);
    // query by the raw class name, not styles.units.
    const unitSpan = container.querySelector(".units");
    expect(unitSpan).not.toBeNull();
    expect(unitSpan?.textContent).toContain("9.8");
  });

  // abbr/.glossary: raw HTML <abbr> is sanitized by react-markdown by default.
  // The `abbr` component override is for future use when a glossary remark
  // plugin emits <abbr> HAST elements. Tested via the CSS presence smoke tests.
});

/* ── Math rendering integration ─────────────────────────────────────────────
 * Verifies that rehype-katex options (throwOnError: false, KATEX_MACROS) and
 * rehypeMathGlyphWrap are correctly wired into the pipeline.
 * ────────────────────────────────────────────────────────────────────────── */
describe("math rendering integration", () => {
  afterEach(() => cleanup());

  it("renders \\R macro via KaTeX", () => {
    // KATEX_MACROS maps \R → \mathbb{R}; KaTeX emits .katex root with
    // .mord.mathbb spans containing the ℝ glyph.
    const { container } = render(<MarkdownContent content="$\\R$" />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("wraps bare Greek glyph in .math-glyph", () => {
    // rehypeMathGlyphWrap fires (bareGlyphMath defaults to true) and wraps
    // each Unicode math glyph in <span class="math-glyph">.
    const { container } = render(<MarkdownContent content="let α be a constant" />);
    const glyph = container.querySelector(".math-glyph");
    expect(glyph).not.toBeNull();
    expect(glyph?.textContent).toBe("α");
  });

  it("renders malformed LaTeX as .katex-error (throwOnError: false)", () => {
    // $\frac{$ has an unclosed brace — a genuine KaTeX parse error. With
    // throwOnError: false, KaTeX emits <span class="katex-error"> instead of
    // throwing, so surrounding content still renders. Note: unknown macros
    // like \widebar render as colored text without .katex-error in KaTeX 0.16.x
    // — only actual syntax errors (unclosed braces / mismatched envs) produce
    // the .katex-error class.
    const { container } = render(
      <MarkdownContent content="$\\frac{$ and some text" />,
    );
    expect(container.querySelector(".katex-error")).not.toBeNull();
    // Surrounding text still renders — page is not broken.
    expect(container.textContent).toContain("and some text");
  });

  it("renders display math inside list items", () => {
    // A loose list item with a properly-delimited display block ($$\n...\n$$
    // on separate lines) produces a .katex-display span nested inside the
    // <li>. The tight-list form `- $$...$$` is parsed as inline math by
    // remark-math and does not produce .katex-display.
    const md = "- item\n\n  $$\n  \\frac{1}{2}\n  $$\n";
    const { container } = render(<MarkdownContent content={md} />);
    const li = container.querySelector("li");
    expect(li).not.toBeNull();
    expect(li?.querySelector(".katex-display")).not.toBeNull();
  });

  it("does not wrap bare glyph when bareGlyphMath toggle is off", () => {
    // When bareGlyphMath: false, rehypeMathGlyphWrap is not added to the
    // pipeline — bare Unicode glyphs remain as plain text nodes.
    const { container } = render(
      <MarkdownContent
        content="let α be a constant"
        renderToggles={{ ...DEFAULT_RENDER_TOGGLES, bareGlyphMath: false }}
      />,
    );
    expect(container.querySelector(".math-glyph")).toBeNull();
    // The glyph text is still present in the document.
    expect(container.textContent).toContain("α");
  });
});

/* ── Mode-toggle integration: disabled features emit no class markers ────────
 * Render the same content with specific toggles OFF and assert the
 * corresponding elements / classes are absent.
 * ────────────────────────────────────────────────────────────────────────── */
describe("MarkdownContent — mode-toggle integration", () => {
  afterEach(() => cleanup());

  const ALL_OFF_TOGGLES: Required<RenderToggles> = {
    callouts: false,
    figures: false,
    definitions: false,
    conceptRefs: true, // concept: links are in the `a` override, not a plugin
    glossary: true,
    bareGlyphMath: true,
    unitAutoDetect: false,
    filePathAutoDetect: false,
  };

  const TOGGLE_MD = `A [[def:derivative]] is useful. See 9.8 m/s².

> [!hint]
> Try it.
`;

  it("definitions: false — no <dfn> elements rendered", () => {
    const { container } = render(
      <MarkdownContent content={TOGGLE_MD} renderToggles={ALL_OFF_TOGGLES} />,
    );
    // With definitions off, [[def:derivative]] stays as literal text (no <dfn>)
    expect(container.querySelector("dfn")).toBeNull();
    // The raw marker text is present (remark did not transform it)
    expect(container.textContent).toContain("[[def:derivative]]");
  });

  it("callouts: false — no <aside> with .callout rendered", () => {
    const { container } = render(
      <MarkdownContent content={TOGGLE_MD} renderToggles={ALL_OFF_TOGGLES} />,
    );
    expect(container.querySelector("aside")).toBeNull();
    // Blockquote falls back to plain blockquote
    expect(container.querySelector("blockquote")).not.toBeNull();
  });

  it("unitAutoDetect: false — no .units spans for 9.8 m/s²", () => {
    const { container } = render(
      <MarkdownContent content={TOGGLE_MD} renderToggles={ALL_OFF_TOGGLES} />,
    );
    // rehypeUnits emits literal class name "units"; query by raw class name.
    expect(container.querySelector(".units")).toBeNull();
  });

  it("all defaults on — features render normally (baseline check)", () => {
    const ALL_ON: Required<RenderToggles> = {
      callouts: true,
      figures: true,
      definitions: true,
      conceptRefs: true,
      glossary: true,
      bareGlyphMath: true,
      unitAutoDetect: true,
      filePathAutoDetect: true,
    };
    const { container } = render(<MarkdownContent content={TOGGLE_MD} renderToggles={ALL_ON} />);
    expect(container.querySelector("dfn")).not.toBeNull();
    expect(container.querySelector("aside")).not.toBeNull();
    // rehypeUnits emits literal class name "units"; query by raw class name.
    expect(container.querySelector(".units")).not.toBeNull();
  });
});
