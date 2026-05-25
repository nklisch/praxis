import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { remarkDefinitions } from "../lib/markdown-plugins/remark-definitions.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parse(md: string): Root {
  const processor = unified().use(remarkParse).use(remarkDefinitions);
  const tree = processor.parse(md);
  return processor.runSync(tree) as Root;
}

function findNodes(tree: Root, type: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  function walk(node: Record<string, unknown>): void {
    if (node.type === type) found.push(node);
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        walk(child as Record<string, unknown>);
      }
    }
  }
  walk(tree as unknown as Record<string, unknown>);
  return found;
}

function findFirst(tree: Root, type: string): Record<string, unknown> | undefined {
  return findNodes(tree, type)[0];
}

// ---------------------------------------------------------------------------
// Basic marker parsing
// ---------------------------------------------------------------------------

describe("remarkDefinitions — basic [[def:term]] parsing", () => {
  it("replaces [[def:term]] with a definition-term node", () => {
    const tree = parse("A [[def:mitosis]] is a type of cell division.");
    const def = findFirst(tree, "definition-term");
    expect(def).toBeDefined();
    expect(def?.term).toBe("mitosis");
  });

  it("definition-term node has a text child with the term as display text", () => {
    const tree = parse("See [[def:entropy]] for more.");
    const def = findFirst(tree, "definition-term") as
      | { children: { value: string }[] }
      | undefined;
    expect(def?.children[0]?.value).toBe("entropy");
  });

  it("preserves text before the marker", () => {
    const tree = parse("In biology, [[def:osmosis]] is important.");
    // The paragraph should contain text + def node + text
    const para = tree.children[0] as Record<string, unknown>;
    const children = para.children as Record<string, unknown>[];
    const textBefore = children.find((c) => c.type === "text" && String(c.value).includes("biology"));
    expect(textBefore).toBeDefined();
  });

  it("preserves text after the marker", () => {
    const tree = parse("Understand [[def:photosynthesis]] completely.");
    const para = tree.children[0] as Record<string, unknown>;
    const children = para.children as Record<string, unknown>[];
    const textAfter = children.find(
      (c) => c.type === "text" && String(c.value).includes("completely"),
    );
    expect(textAfter).toBeDefined();
  });

  it("handles multiple [[def:term]] markers in one paragraph", () => {
    const tree = parse("Both [[def:mitosis]] and [[def:meiosis]] are cell division types.");
    const defs = findNodes(tree, "definition-term");
    expect(defs).toHaveLength(2);
    expect(defs[0]?.term).toBe("mitosis");
    expect(defs[1]?.term).toBe("meiosis");
  });

  it("handles a marker with multi-word term", () => {
    const tree = parse("The [[def:second law of thermodynamics]] is fundamental.");
    const def = findFirst(tree, "definition-term");
    expect(def?.term).toBe("second law of thermodynamics");
  });

  it("leaves plain text without markers unchanged", () => {
    const tree = parse("No markers in this paragraph.");
    const defs = findNodes(tree, "definition-term");
    expect(defs).toHaveLength(0);
  });

  it("handles a standalone marker (no surrounding text)", () => {
    const tree = parse("[[def:velocity]]");
    const def = findFirst(tree, "definition-term");
    expect(def).toBeDefined();
    expect(def?.term).toBe("velocity");
  });
});

// ---------------------------------------------------------------------------
// Skipping code ancestors
// ---------------------------------------------------------------------------

describe("remarkDefinitions — skips code ancestors", () => {
  it("does NOT replace [[def:term]] inside inline code", () => {
    const tree = parse("Use `[[def:term]]` in your markup.");
    const defs = findNodes(tree, "definition-term");
    expect(defs).toHaveLength(0);
  });

  it("does NOT replace [[def:term]] inside fenced code blocks", () => {
    const tree = parse("```\nA [[def:example]] in a code block.\n```");
    const defs = findNodes(tree, "definition-term");
    expect(defs).toHaveLength(0);
  });

  it("replaces [[def:term]] in prose adjacent to code spans", () => {
    const tree = parse("The term [[def:entropy]] follows `some code`.");
    const defs = findNodes(tree, "definition-term");
    expect(defs).toHaveLength(1);
    expect(defs[0]?.term).toBe("entropy");
  });
});

// ---------------------------------------------------------------------------
// Multi-paragraph documents
// ---------------------------------------------------------------------------

describe("remarkDefinitions — multi-paragraph documents", () => {
  it("processes markers across multiple paragraphs independently", () => {
    const md = "First paragraph [[def:alpha]].\n\nSecond paragraph [[def:beta]].";
    const tree = parse(md);
    const defs = findNodes(tree, "definition-term");
    expect(defs).toHaveLength(2);
    expect(defs[0]?.term).toBe("alpha");
    expect(defs[1]?.term).toBe("beta");
  });

  it("leaves paragraphs without markers unchanged", () => {
    const md = "No markers here.\n\nBut [[def:here]] there is one.";
    const tree = parse(md);
    const defs = findNodes(tree, "definition-term");
    expect(defs).toHaveLength(1);
    expect(defs[0]?.term).toBe("here");
  });
});
