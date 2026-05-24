import type { Element, Parent, Root, Text } from "hast";
import { visitParents } from "unist-util-visit-parents";

/**
 * The set of Unicode math glyphs that this plugin wraps.
 * Includes: operators, Greek lowercase/uppercase, super/subscripts, blackboard bold.
 */
export const MATH_GLYPHS: ReadonlySet<string> = new Set([
  // Operators
  "∘",
  "∂",
  "∫",
  "∑",
  "∏",
  "∇",
  "≠",
  "≈",
  "≡",
  "≤",
  "≥",
  "∀",
  "∃",
  "∈",
  "∉",
  "⊂",
  "⊆",
  "∩",
  "∪",
  "→",
  "⇒",
  "⇔",
  "±",
  "×",
  "÷",
  "⋅",
  // Greek lowercase (full alphabet)
  "α",
  "β",
  "γ",
  "δ",
  "ε",
  "ζ",
  "η",
  "θ",
  "ι",
  "κ",
  "λ",
  "μ",
  "ν",
  "ξ",
  "ο",
  "π",
  "ρ",
  "σ",
  "τ",
  "υ",
  "φ",
  "χ",
  "ψ",
  "ω",
  // Greek uppercase (typically italic subset)
  "Γ",
  "Δ",
  "Θ",
  "Λ",
  "Ξ",
  "Π",
  "Σ",
  "Φ",
  "Ψ",
  "Ω",
  // Superscripts
  "¹",
  "²",
  "³",
  "⁰",
  "⁴",
  "⁵",
  "⁶",
  "⁷",
  "⁸",
  "⁹",
  // Subscripts
  "₀",
  "₁",
  "₂",
  "₃",
  "₄",
  "₅",
  "₆",
  "₇",
  "₈",
  "₉",
  // Blackboard bold
  "ℝ",
  "ℤ",
  "ℕ",
  "ℚ",
  "ℂ",
]);

const SKIP_TAGS = new Set(["code", "pre", "kbd", "samp", "math", "a", "abbr"]);

interface Replacement {
  parent: Parent;
  oldNode: Text;
  newNodes: Array<Text | Element>;
}

/** Local mirror of unified's `Plugin` shape — avoids pulling `unified` in
 *  as a direct dep solely for this one type. */
type RehypePlugin = () => (tree: Root) => void;

/**
 * Walk text nodes in the HAST; for each Unicode math glyph in `MATH_GLYPHS`,
 * replace the surrounding text node with a sequence of text and
 * `<span class="math-glyph">glyph</span>` elements.
 *
 * Skips text inside `code`, `pre`, `kbd`, `samp`, `math`, `a`, or `abbr`
 * ancestors to avoid wrapping in raw-text contexts or inside KaTeX output.
 *
 * Replacements are collected during traversal and applied after, so the
 * walk does not iterate freshly-spliced nodes.
 */
export const rehypeMathGlyphWrap: RehypePlugin = () => (tree) => {
  const replacements: Replacement[] = [];

  visitParents(tree, "text", (node, ancestors) => {
    for (const ancestor of ancestors) {
      if (ancestor.type === "element") {
        const tag = (ancestor as Element).tagName;
        if (SKIP_TAGS.has(tag)) return;
      }
    }

    const value = node.value;

    // Fast short-circuit: skip text nodes with no math glyphs at all.
    if (!Array.from(value).some((ch) => MATH_GLYPHS.has(ch))) return;

    const parent = ancestors.at(-1);
    if (parent === undefined || !("children" in parent)) return;

    // Build replacement node list by iterating over Unicode code points.
    const newNodes: Array<Text | Element> = [];
    let buffer = "";
    for (const ch of value) {
      if (MATH_GLYPHS.has(ch)) {
        if (buffer) {
          newNodes.push({ type: "text", value: buffer });
          buffer = "";
        }
        newNodes.push({
          type: "element",
          tagName: "span",
          properties: { className: ["math-glyph"] },
          children: [{ type: "text", value: ch }],
        });
      } else {
        buffer += ch;
      }
    }
    if (buffer) {
      newNodes.push({ type: "text", value: buffer });
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
