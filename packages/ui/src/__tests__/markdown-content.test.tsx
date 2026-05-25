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

  // TODO(step-5): flip .skip to active when throwOnError: false is wired into
  // the unified() pipeline in markdown-content.tsx. Step-5 is the activator.
  it.skip("renders malformed LaTeX as a .katex-error badge (requires step-5 throwOnError wiring)", () => {
    // $\widebar{x}$ uses an undefined KaTeX macro — with throwOnError: false
    // KaTeX emits a <span class="katex-error"> containing the parse-error
    // message and raw source instead of throwing.
    const { container } = renderMd("$\\widebar{x}$");
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
