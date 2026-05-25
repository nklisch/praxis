import type { Element, Parent, Root, Text } from "hast";
import { visitParents } from "unist-util-visit-parents";

/**
 * Multi-character SI and common imperial unit symbols recognised by this
 * plugin.  Single-letter units (`g`, `m`, `s`, `A`, `K` when unambiguous,
 * etc.) are intentionally excluded — the false-positive rate against variable
 * names in prose is too high to make automatic detection useful.
 *
 * Exported `as const` so tests can assert the exact list.
 *
 * Ordering matters for regex alternation: longer tokens must appear before
 * any prefix they share (e.g. `m/s²` before `m/s`, `kHz` before `Hz`).
 */
export const UNIT_TABLE = [
  // SI derived — longer/compound first to prevent prefix shadowing
  "m/s²",
  "m/s",
  "km/h",
  "km/s",
  "kHz",
  "MHz",
  "GHz",
  "kPa",
  "MPa",
  "GPa",
  "kJ",
  "MJ",
  "kW",
  "MW",
  "GW",
  "kN",
  "mL",
  "dL",
  // SI base + derived (multi-char only)
  "Hz",
  "Pa",
  "kg",
  "mg",
  "µg",
  "µm",
  "nm",
  "km",
  "cm",
  "mm",
  "ms",
  "µs",
  "ns",
  "kΩ",
  "MΩ",
  "mA",
  "µA",
  "mV",
  "kV",
  "MV",
  "Wh",
  "kWh",
  "MWh",
  "°C",
  "°F",
  // SI base (unambiguous multi-char representations)
  "mol",
  "rad",
  // Imperial
  "ft",
  "in",
  "mi",
  "yd",
  "lb",
  "oz",
  "fl oz",
  // Energy / force / electrics (multi-char only — single-letter J/N/W/V/A
  // are excluded because they are indistinguishable from common variable names)
  "kcal",
  "cal",
] as const;

/**
 * Regex matching a number followed by an optional space and a unit token from
 * `UNIT_TABLE`.  The `\b` word boundary after the unit prevents `5kg` from
 * matching inside `5kg/m³` only as `5kg` when `kg/m³` is not in the table.
 *
 * Built once at module load — the regex is stateful (`g` flag), so each call
 * site must reset `lastIndex` before use.
 */
const UNIT_RE = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s?(${[...UNIT_TABLE].join("|")})(?=[\\s.,;:!?)]|$)`,
  "g",
);

/**
 * Ancestor tags whose text nodes we must never process.
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
 * Walk text nodes in the HAST; for each `<number> <unit>` match from
 * `UNIT_TABLE`, replace the surrounding text node with:
 *
 * ```html
 * <span class="units">
 *   <span class="num">5</span>
 *   <span class="unit">kg</span>
 * </span>
 * ```
 *
 * Skips text inside `code`, `pre`, `kbd`, `samp`, or `a` ancestors.
 *
 * Replacements are collected during traversal and applied after, so the walk
 * does not iterate freshly-spliced nodes.
 */
export const rehypeUnits: RehypePlugin = () => (tree) => {
  const replacements: Replacement[] = [];

  visitParents(tree, "text", (node, ancestors) => {
    for (const ancestor of ancestors) {
      if (ancestor.type === "element") {
        const tag = (ancestor as Element).tagName;
        if (SKIP_TAGS.has(tag)) return;
      }
    }

    const value = node.value;
    UNIT_RE.lastIndex = 0;
    if (!UNIT_RE.test(value)) return;
    UNIT_RE.lastIndex = 0;

    const parent = ancestors.at(-1);
    if (parent === undefined || !("children" in parent)) return;

    const newNodes: Array<Text | Element> = [];
    let last = 0;

    for (let m = UNIT_RE.exec(value); m !== null; m = UNIT_RE.exec(value)) {
      if (m.index > last) {
        newNodes.push({ type: "text", value: value.slice(last, m.index) });
      }

      const num = m[1] ?? "";
      const unit = m[2] ?? "";

      newNodes.push({
        type: "element",
        tagName: "span",
        properties: { className: ["units"] },
        children: [
          {
            type: "element",
            tagName: "span",
            properties: { className: ["num"] },
            children: [{ type: "text", value: num }],
          },
          {
            type: "element",
            tagName: "span",
            properties: { className: ["unit"] },
            children: [{ type: "text", value: unit }],
          },
        ],
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
