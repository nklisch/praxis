import type { Parent, Root, Text } from "mdast";
import { visitParents } from "unist-util-visit-parents";

/**
 * Minimal inline type for the custom `definition` MDAST node produced by this
 * plugin. Declaring locally avoids pulling in a third-party package solely for
 * this type (following the local-alias precedent in `remark-admonitions.ts`).
 */
interface DefinitionNode {
  type: "definition-term";
  term: string;
  children: [Text];
}

/** Matches `[[def:term text]]` markers anywhere in a text node. */
const DEF_REGEX = /\[\[def:([^\]]+)\]\]/g;

interface Replacement {
  parent: Parent;
  oldNode: Text;
  newNodes: Array<Text | DefinitionNode>;
}

/**
 * Remark plugin that walks MDAST text nodes and replaces `[[def:term]]`
 * markers with custom `definition-term` nodes carrying the term as an
 * attribute and a child text node with the display text.
 *
 * Skips text inside `code` ancestors (inline code) so that code samples that
 * happen to contain `[[def:...]]` are left untouched.
 *
 * Plugin shape mirrors `rehype-citation-chips.ts` (collect-then-splice):
 * replacements are gathered during the `visitParents` walk, then applied
 * after the walk completes so the traversal doesn't iterate freshly-spliced
 * nodes.
 *
 * The `definition-term` nodes are mapped by `MarkdownContent`'s `components`
 * map (rehype custom element `<definition-term term="...">`) to the
 * `<Definition>` React component.
 *
 * @example
 * ```markdown
 * A [[def:mitosis]] is a type of cell division.
 * ```
 * Produces a `definition-term` node with:
 * - `term: "mitosis"`
 * - `children: [{ type: "text", value: "mitosis" }]`
 */
export const remarkDefinitions: () => (tree: Root) => void = () => (tree) => {
  const replacements: Replacement[] = [];

  visitParents(tree, "text", (node: Text, ancestors) => {
    // MDAST `code` and `inlineCode` nodes are Literals (no children array),
    // so text nodes never appear inside them — no code-ancestor guard needed.
    // Markers inside backtick spans are inherently safe; remark-parse emits
    // them as `inlineCode` Literals (not as parent+text), so they are never
    // visited here.
    void ancestors; // consumed by the parent-lookup below

    const value = node.value;
    DEF_REGEX.lastIndex = 0;
    if (!DEF_REGEX.test(value)) return;
    DEF_REGEX.lastIndex = 0;

    // Find the immediate parent to splice into.
    const parent = ancestors.at(-1);
    if (parent === undefined || !("children" in parent)) return;

    const newNodes: Array<Text | DefinitionNode> = [];
    let last = 0;

    for (let m = DEF_REGEX.exec(value); m !== null; m = DEF_REGEX.exec(value)) {
      // Text before this match
      if (m.index > last) {
        newNodes.push({ type: "text", value: value.slice(last, m.index) });
      }

      const term = m[1] as string;
      const defNode: DefinitionNode = {
        type: "definition-term",
        term,
        children: [{ type: "text", value: term }],
      };
      newNodes.push(defNode);
      last = m.index + m[0].length;
    }

    // Trailing text after the last match
    if (last < value.length) {
      newNodes.push({ type: "text", value: value.slice(last) });
    }

    replacements.push({ parent: parent as Parent, oldNode: node, newNodes });
  });

  // Apply in any order — text nodes are unique object references, so identity
  // lookup stays stable even after sibling splices (same approach as
  // rehype-citation-chips.ts).
  for (const { parent, oldNode, newNodes } of replacements) {
    const idx = (parent.children as Array<unknown>).indexOf(oldNode);
    if (idx === -1) continue;
    (parent.children as Array<unknown>).splice(idx, 1, ...newNodes);
  }
};
