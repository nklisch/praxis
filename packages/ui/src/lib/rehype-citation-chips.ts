import type { Element, Parent, Root, Text } from "hast";
import { visitParents } from "unist-util-visit-parents";

const CHIP_REGEX = /\[(\d+)\]/g;

interface Replacement {
  parent: Parent;
  oldNode: Text;
  newNodes: Array<Text | Element>;
}

/** Local mirror of unified's `Plugin` shape — avoids pulling `unified` in
 *  as a direct dep solely for this one type. */
type RehypePlugin = () => (tree: Root) => void;

/**
 * Walk text nodes in the HAST; for each `[N]` match, replace the surrounding
 * text node with `(text-before, <citation-chip data-index="N" />, text-after)`.
 *
 * Skips text inside `<code>` or `<pre>` ancestors so code samples like
 * `arr[1]` stay as code, not as citation chips.
 *
 * Replacements are collected during traversal and applied after, so the
 * walk does not iterate the freshly-spliced nodes.
 */
export const rehypeCitationChips: RehypePlugin = () => (tree) => {
  const replacements: Replacement[] = [];

  visitParents(tree, "text", (node, ancestors) => {
    for (const ancestor of ancestors) {
      if (ancestor.type === "element") {
        const tag = (ancestor as Element).tagName;
        if (tag === "code" || tag === "pre") return;
      }
    }

    const value = node.value;
    CHIP_REGEX.lastIndex = 0;
    if (!CHIP_REGEX.test(value)) return;
    CHIP_REGEX.lastIndex = 0;

    const parent = ancestors.at(-1);
    if (parent === undefined || !("children" in parent)) return;

    const newNodes: Array<Text | Element> = [];
    let last = 0;
    for (let m = CHIP_REGEX.exec(value); m !== null; m = CHIP_REGEX.exec(value)) {
      if (m.index > last) {
        newNodes.push({ type: "text", value: value.slice(last, m.index) });
      }
      newNodes.push({
        type: "element",
        tagName: "citation-chip",
        properties: { dataIndex: m[1] },
        children: [],
      });
      last = m.index + m[0].length;
    }
    if (last < value.length) {
      newNodes.push({ type: "text", value: value.slice(last) });
    }

    replacements.push({ parent: parent as Parent, oldNode: node, newNodes });
  });

  // Apply in any order — text nodes are unique objects, so reference
  // identity locates the correct slot even after sibling splices.
  for (const { parent, oldNode, newNodes } of replacements) {
    const idx = parent.children.indexOf(oldNode);
    if (idx === -1) continue;
    parent.children.splice(idx, 1, ...newNodes);
  }
};
