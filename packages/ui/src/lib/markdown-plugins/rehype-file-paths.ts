import type { Element, Parent, Root, Text } from "hast";
import { visitParents } from "unist-util-visit-parents";

/**
 * Matches file paths of the form `word/word.ext` — one or more slash-separated
 * path segments with at least one `/`, ending in a dot-extension of 1–8 chars.
 *
 * Word characters and hyphens are allowed in segment names so typical paths
 * like `packages/ui/src/foo-bar.ts` match.  URLs are excluded in practice
 * because the `<a>` ancestor-skip fires first; the regex itself does not
 * special-case URL schemes.
 *
 * `g` flag required so the loop can iterate multiple matches per text node.
 */
const FILE_PATH_RE = /\b[\w-]+(?:\/[\w.-]+)+\.\w{1,8}\b/g;

/**
 * Ancestor tags whose text nodes we must never process.  Keeps raw code,
 * pre-formatted output, keyboard shortcuts, and links untouched.
 */
const SKIP_TAGS = new Set(["code", "pre", "kbd", "samp", "a"]);

interface Replacement {
  parent: Parent;
  oldNode: Text;
  newNodes: Array<Text | Element>;
}

/** Local mirror of unified's `Plugin` shape — avoids pulling `unified` in
 *  as a direct dep solely for this one type. */
type RehypePlugin = () => (tree: Root) => void;

/**
 * Walk text nodes in the HAST; for each file-path match, replace the
 * surrounding text node with `(text-before, <span class="file-path">path</span>,
 * text-after)`.
 *
 * Skips text inside `code`, `pre`, `kbd`, `samp`, or `a` ancestors so code
 * samples and hyperlinks are never re-wrapped.
 *
 * Replacements are collected during traversal and applied after, so the walk
 * does not iterate freshly-spliced nodes.
 */
export const rehypeFilePaths: RehypePlugin = () => (tree) => {
  const replacements: Replacement[] = [];

  visitParents(tree, "text", (node, ancestors) => {
    for (const ancestor of ancestors) {
      if (ancestor.type === "element") {
        const tag = (ancestor as Element).tagName;
        if (SKIP_TAGS.has(tag)) return;
      }
    }

    const value = node.value;
    FILE_PATH_RE.lastIndex = 0;
    if (!FILE_PATH_RE.test(value)) return;
    FILE_PATH_RE.lastIndex = 0;

    const parent = ancestors.at(-1);
    if (parent === undefined || !("children" in parent)) return;

    const newNodes: Array<Text | Element> = [];
    let last = 0;

    for (let m = FILE_PATH_RE.exec(value); m !== null; m = FILE_PATH_RE.exec(value)) {
      if (m.index > last) {
        newNodes.push({ type: "text", value: value.slice(last, m.index) });
      }
      newNodes.push({
        type: "element",
        tagName: "span",
        properties: { className: ["file-path"] },
        children: [{ type: "text", value: m[0] }],
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
