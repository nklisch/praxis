import type { Root } from "mdast";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { remarkAdmonitions } from "../lib/markdown-plugins/remark-admonitions.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a markdown string with remarkAdmonitions applied and return the
 * transformed MDAST root.
 *
 * `unified().parse()` only parses — transformers run during `.run()` / `.process()`.
 * We call `.runSync()` on the parsed tree to apply all registered transformer plugins.
 */
function parse(md: string): Root {
  const processor = unified().use(remarkParse).use(remarkAdmonitions);
  const tree = processor.parse(md);
  return processor.runSync(tree) as Root;
}

/**
 * Walk the tree and return the first node of the given type.
 * Returns `undefined` if none found.
 */
function findFirst(tree: Root, type: string): Record<string, unknown> | undefined {
  function walk(node: Record<string, unknown>): Record<string, unknown> | undefined {
    if (node.type === type) return node;
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        const found = walk(child as Record<string, unknown>);
        if (found) return found;
      }
    }
    return undefined;
  }
  return walk(tree as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// remarkAdmonitions — one test per admonition type
// ---------------------------------------------------------------------------

describe("remarkAdmonitions — converts each admonition type", () => {
  it("converts > [!hint] blockquote to containerDirective with type=hint", () => {
    const tree = parse("> [!hint]\n> Try thinking about it differently.");
    const node = tree.children[0] as Record<string, unknown>;
    expect(node.type).toBe("containerDirective");
    expect(node.name).toBe("admonition");
    expect((node.attributes as Record<string, string>).type).toBe("hint");
    // Children should contain the body text
    const children = node.children as Record<string, unknown>[];
    expect(children.length).toBeGreaterThan(0);
  });

  it("converts > [!theorem] to containerDirective with type=theorem", () => {
    const tree = parse("> [!theorem]\n> Every continuous function on a compact set is bounded.");
    const node = tree.children[0] as Record<string, unknown>;
    expect(node.type).toBe("containerDirective");
    expect(node.name).toBe("admonition");
    expect((node.attributes as Record<string, string>).type).toBe("theorem");
  });

  it("converts > [!lemma] to containerDirective with type=lemma", () => {
    const tree = parse("> [!lemma]\n> If a divides b and b divides c, then a divides c.");
    const node = tree.children[0] as Record<string, unknown>;
    expect(node.type).toBe("containerDirective");
    expect(node.name).toBe("admonition");
    expect((node.attributes as Record<string, string>).type).toBe("lemma");
  });

  it("converts > [!warning] to containerDirective with type=warning", () => {
    const tree = parse("> [!warning]\n> Do not confuse correlation with causation.");
    const node = tree.children[0] as Record<string, unknown>;
    expect(node.type).toBe("containerDirective");
    expect(node.name).toBe("admonition");
    expect((node.attributes as Record<string, string>).type).toBe("warning");
  });

  it("converts > [!steps] to containerDirective with type=steps", () => {
    const tree = parse("> [!steps]\n> 1. Identify the problem.\n> 2. Solve it.");
    const node = tree.children[0] as Record<string, unknown>;
    expect(node.type).toBe("containerDirective");
    expect(node.name).toBe("admonition");
    expect((node.attributes as Record<string, string>).type).toBe("steps");
  });
});

// ---------------------------------------------------------------------------
// Body text preservation
// ---------------------------------------------------------------------------

describe("remarkAdmonitions — body text", () => {
  it("strips the [!type] prefix and keeps body text in the first paragraph", () => {
    const tree = parse("> [!hint]\n> The body goes here.");
    const directive = tree.children[0] as Record<string, unknown>;
    const children = directive.children as Record<string, unknown>[];
    // Should have at least one child paragraph
    expect(children.length).toBeGreaterThan(0);
    // Flatten all text in children
    const text = JSON.stringify(children);
    expect(text).toContain("The body goes here");
    // Must NOT contain the admonition marker
    expect(text).not.toContain("[!hint]");
  });

  it("handles admonition marker on its own line with body on next lines", () => {
    const tree = parse("> [!warning]\n> First line.\n> Second line.");
    const directive = tree.children[0] as Record<string, unknown>;
    expect(directive.type).toBe("containerDirective");
    const bodyStr = JSON.stringify(directive.children);
    expect(bodyStr).not.toContain("[!warning]");
    expect(bodyStr).toContain("First line");
    expect(bodyStr).toContain("Second line");
  });

  it("handles admonition where [!type] and body text are on the same blockquote line", () => {
    // remark-parse joins "> [!hint] Some body text" as a single paragraph text
    const tree = parse("> [!hint] Some body text.");
    const directive = tree.children[0] as Record<string, unknown>;
    expect(directive.type).toBe("containerDirective");
    const bodyStr = JSON.stringify(directive.children);
    expect(bodyStr).not.toContain("[!hint]");
    expect(bodyStr).toContain("Some body text");
  });
});

// ---------------------------------------------------------------------------
// Non-admonition blockquotes — must be left untouched
// ---------------------------------------------------------------------------

describe("remarkAdmonitions — leaves non-admonition blockquotes unaffected", () => {
  it("leaves a plain blockquote as a blockquote node", () => {
    const tree = parse("> This is a regular quote.");
    const node = tree.children[0] as Record<string, unknown>;
    expect(node.type).toBe("blockquote");
  });

  it("leaves a blockquote with unknown [!unknown] type as a blockquote", () => {
    const tree = parse("> [!unknown]\n> Some text.");
    const node = tree.children[0] as Record<string, unknown>;
    expect(node.type).toBe("blockquote");
  });

  it("leaves a blockquote starting with bracket-number (citation) as a blockquote", () => {
    const tree = parse("> [1] Reference text.");
    const node = tree.children[0] as Record<string, unknown>;
    expect(node.type).toBe("blockquote");
  });

  it("does not affect non-blockquote nodes", () => {
    const tree = parse("# Heading\n\nParagraph text.\n\n> [!hint]\n> Admonition body.");
    expect(tree.children).toHaveLength(3);
    expect((tree.children[0] as Record<string, unknown>).type).toBe("heading");
    expect((tree.children[1] as Record<string, unknown>).type).toBe("paragraph");
    expect((tree.children[2] as Record<string, unknown>).type).toBe("containerDirective");
  });

  it("processes multiple admonitions and blockquotes mixed in one document", () => {
    const md = [
      "> Regular quote here.",
      "",
      "> [!hint]",
      "> A hint admonition.",
      "",
      "> Another regular quote.",
      "",
      "> [!warning]",
      "> A warning admonition.",
    ].join("\n");

    const tree = parse(md);
    expect(tree.children).toHaveLength(4);
    expect((tree.children[0] as Record<string, unknown>).type).toBe("blockquote");
    expect((tree.children[1] as Record<string, unknown>).type).toBe("containerDirective");
    expect((tree.children[1] as Record<string, unknown>).attributes).toMatchObject({
      type: "hint",
    });
    expect((tree.children[2] as Record<string, unknown>).type).toBe("blockquote");
    expect((tree.children[3] as Record<string, unknown>).type).toBe("containerDirective");
    expect((tree.children[3] as Record<string, unknown>).attributes).toMatchObject({
      type: "warning",
    });
  });
});

// ---------------------------------------------------------------------------
// Nested markdown inside admonition body
// ---------------------------------------------------------------------------

describe("remarkAdmonitions — preserves nested markdown inside body", () => {
  it("preserves emphasis in the body", () => {
    const tree = parse("> [!hint]\n> Use *emphasis* carefully.");
    const directive = tree.children[0] as Record<string, unknown>;
    expect(directive.type).toBe("containerDirective");
    // Should find an emphasis node somewhere in children
    const emphasisNode = findFirst(tree, "emphasis");
    expect(emphasisNode).toBeDefined();
  });

  it("preserves strong/bold in the body", () => {
    const tree = parse("> [!warning]\n> **Important**: read the docs.");
    const directive = tree.children[0] as Record<string, unknown>;
    expect(directive.type).toBe("containerDirective");
    const strongNode = findFirst(tree, "strong");
    expect(strongNode).toBeDefined();
  });

  it("preserves inline code in the body", () => {
    const tree = parse("> [!hint]\n> Use `const x = 1` instead.");
    const directive = tree.children[0] as Record<string, unknown>;
    expect(directive.type).toBe("containerDirective");
    const inlineCode = findFirst(tree, "inlineCode");
    expect(inlineCode).toBeDefined();
    expect((inlineCode as { value: string }).value).toBe("const x = 1");
  });

  it("preserves links in the body", () => {
    const tree = parse("> [!hint]\n> See [the docs](https://example.com) for more.");
    const directive = tree.children[0] as Record<string, unknown>;
    expect(directive.type).toBe("containerDirective");
    const linkNode = findFirst(tree, "link");
    expect(linkNode).toBeDefined();
    expect((linkNode as { url: string }).url).toBe("https://example.com");
  });

  it("preserves inline math ($...$) in the body", () => {
    // remark-parse alone won't parse math — it treats $ as plain text. That's
    // fine: the MDAST still contains the raw "$x^2$" text, and remark-math
    // (added downstream) will handle it. We just assert the text round-trips.
    const tree = parse("> [!theorem]\n> The equation $x^2 + 1 = 0$ has no real solutions.");
    const directive = tree.children[0] as Record<string, unknown>;
    expect(directive.type).toBe("containerDirective");
    const bodyStr = JSON.stringify(directive.children);
    expect(bodyStr).toContain("x^2 + 1 = 0");
  });

  it("preserves multi-paragraph body", () => {
    const md = ["> [!steps]", "> First paragraph.", ">", "> Second paragraph."].join("\n");
    const tree = parse(md);
    const directive = tree.children[0] as Record<string, unknown>;
    expect(directive.type).toBe("containerDirective");
    const children = directive.children as Record<string, unknown>[];
    // Should have two paragraph nodes
    const paragraphs = children.filter((c) => c.type === "paragraph");
    expect(paragraphs).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// remark-directive smoke test
// ---------------------------------------------------------------------------

describe("remark-directive smoke test", () => {
  it("parses :::figure\\nbody\\n::: into a containerDirective node with name=figure", () => {
    const tree = unified()
      .use(remarkParse)
      .use(remarkDirective)
      .parse(":::figure\nbody\n:::") as Root;

    expect(tree.children).toHaveLength(1);
    const node = tree.children[0] as Record<string, unknown>;
    expect(node.type).toBe("containerDirective");
    expect(node.name).toBe("figure");
  });

  it("parses :name[content] into a textDirective node", () => {
    const tree = unified().use(remarkParse).use(remarkDirective).parse(":name[content]") as Root;

    const paragraph = tree.children[0] as Record<string, unknown>;
    const children = paragraph.children as Record<string, unknown>[];
    const directive = children.find((c) => c.type === "textDirective");
    expect(directive).toBeDefined();
    expect((directive as Record<string, unknown>).name).toBe("name");
  });
});
