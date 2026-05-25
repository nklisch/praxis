import type { Blockquote, Paragraph, Root, Text } from "mdast";
import { visit } from "unist-util-visit";

/**
 * The five admonition types supported by Praxis.
 * Matches the `[!type]` label in GitHub-style blockquote admonitions.
 */
export type AdmonitionType = "theorem" | "lemma" | "hint" | "warning" | "steps";

/**
 * Minimal inline type for `containerDirective` nodes introduced by
 * `remark-directive` / `mdast-util-directive`. Declaring it locally avoids
 * adding `mdast-util-directive` as a direct dep solely for this one type
 * (following the same pattern as the `RehypePlugin` alias in the rehype
 * plugins in this directory).
 */
interface ContainerDirective {
  type: "containerDirective";
  name: string;
  attributes: Record<string, string>;
  children: Paragraph[];
}

const ADMONITION_RE = /^\s*\[!(theorem|lemma|hint|warning|steps)\]\s*\n?/;

interface Replacement {
  // biome-ignore lint/suspicious/noExplicitAny: parent node type varies across MDAST — the visit callback types it as `Parent | null`
  parent: any;
  index: number;
  newNode: ContainerDirective;
}

/**
 * Remark plugin that converts GitHub-style `> [!type]` blockquote admonitions
 * into `containerDirective` nodes (the format produced by `remark-directive`).
 *
 * Supported types: `theorem`, `lemma`, `hint`, `warning`, `steps`.
 *
 * Regular blockquotes without an `[!type]` prefix are left untouched.
 *
 * Plugin shape mirrors `rehype-citation-chips.ts`: collect replacements during
 * the visit walk, then splice in reverse-index order so indices stay stable.
 *
 * @example
 * ```markdown
 * > [!hint]
 * > Try thinking about it differently.
 * ```
 *
 * Produces a `containerDirective` node with:
 * - `name: "admonition"`
 * - `attributes: { type: "hint" }`
 * - `children`: the blockquote body with the `[!hint]` prefix stripped
 */
export const remarkAdmonitions: () => (tree: Root) => void = () => (tree) => {
  const replacements: Replacement[] = [];

  visit(tree, "blockquote", (node: Blockquote, index, parent) => {
    if (parent === null || index === undefined) return;

    const firstChild = node.children[0];
    if (!firstChild || firstChild.type !== "paragraph") return;

    const firstText = firstChild.children[0];
    if (!firstText || firstText.type !== "text") return;

    const match = (firstText as Text).value.match(ADMONITION_RE);
    if (!match) return;

    const type = match[1] as AdmonitionType;
    const remainingText = (firstText as Text).value.slice(match[0].length);

    // Rebuild the first paragraph with the [!type] prefix stripped from the
    // leading text node. If no text remains after stripping, drop that text
    // node entirely.
    const newFirstParagraphChildren = remainingText
      ? [{ type: "text" as const, value: remainingText }, ...firstChild.children.slice(1)]
      : firstChild.children.slice(1);

    const newFirstParagraph: Paragraph = {
      ...firstChild,
      children: newFirstParagraphChildren,
    };

    // If the first paragraph is now empty (the [!type] was the only content),
    // drop it and use only the remaining blockquote children.
    const newChildren: Paragraph[] =
      newFirstParagraph.children.length > 0
        ? [newFirstParagraph, ...(node.children.slice(1) as Paragraph[])]
        : (node.children.slice(1) as Paragraph[]);

    const directive: ContainerDirective = {
      type: "containerDirective",
      name: "admonition",
      attributes: { type },
      children: newChildren,
    };

    replacements.push({ parent, index, newNode: directive });
  });

  // Apply in reverse index order so earlier splices don't shift later indices.
  for (const { parent, index, newNode } of replacements.sort((a, b) => b.index - a.index)) {
    // biome-ignore lint/suspicious/noExplicitAny: parent.children is typed dynamically by the MDAST parent union
    (parent.children as any[]).splice(index, 1, newNode);
  }
};
