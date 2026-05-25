import type { Element, Root, Text } from "hast";
import { describe, expect, it } from "vitest";
import { rehypeUnits, UNIT_TABLE } from "../lib/markdown-plugins/rehype-units.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runPlugin(tree: Root): Root {
  // biome-ignore lint/suspicious/noExplicitAny: unified plugin transformer signature
  const transform = rehypeUnits() as any;
  transform(tree);
  return tree;
}

function paragraph(...children: Array<Text | Element>): Element {
  return { type: "element", tagName: "p", properties: {}, children };
}

function text(value: string): Text {
  return { type: "text", value };
}

function el(tag: string, ...children: Array<Text | Element>): Element {
  return { type: "element", tagName: tag, properties: {}, children };
}

/** Find the first <span class="units"> in the element's direct children. */
function findUnitsSpan(node: Element): Element | undefined {
  for (const child of node.children) {
    if (
      child.type === "element" &&
      (child as Element).tagName === "span" &&
      Array.isArray((child as Element).properties?.className) &&
      ((child as Element).properties?.className as string[]).includes("units")
    ) {
      return child as Element;
    }
  }
  return undefined;
}

function numText(span: Element): string {
  const numEl = span.children.find(
    (c): c is Element =>
      c.type === "element" &&
      (c as Element).tagName === "span" &&
      ((c as Element).properties?.className as string[])?.includes("num"),
  );
  return numEl ? ((numEl.children[0] as Text | undefined)?.value ?? "") : "";
}

function unitText(span: Element): string {
  const unitEl = span.children.find(
    (c): c is Element =>
      c.type === "element" &&
      (c as Element).tagName === "span" &&
      ((c as Element).properties?.className as string[])?.includes("unit"),
  );
  return unitEl ? ((unitEl.children[0] as Text | undefined)?.value ?? "") : "";
}

// ---------------------------------------------------------------------------
// UNIT_TABLE shape tests
// ---------------------------------------------------------------------------

describe("UNIT_TABLE", () => {
  it("is exported as a non-empty readonly array", () => {
    expect(Array.isArray(UNIT_TABLE)).toBe(true);
    expect(UNIT_TABLE.length).toBeGreaterThan(0);
  });

  it("contains multi-character units only (no single-letter entries)", () => {
    for (const unit of UNIT_TABLE) {
      expect(unit.length).toBeGreaterThan(1);
    }
  });

  it("contains expected SI multi-char units", () => {
    const table = UNIT_TABLE as readonly string[];
    expect(table).toContain("kg");
    expect(table).toContain("Hz");
    expect(table).toContain("kHz");
    expect(table).toContain("Pa");
    expect(table).toContain("kPa");
    expect(table).toContain("mL");
    expect(table).toContain("°C");
    expect(table).toContain("°F");
    expect(table).toContain("m/s");
    expect(table).toContain("m/s²");
    expect(table).toContain("km/h");
  });

  it("contains expected imperial units", () => {
    const table = UNIT_TABLE as readonly string[];
    expect(table).toContain("ft");
    expect(table).toContain("mi");
    expect(table).toContain("lb");
    expect(table).toContain("oz");
  });

  it("does NOT contain single-letter units g, m, s (high false-positive risk)", () => {
    const table = UNIT_TABLE as readonly string[];
    // Exact single-character entries must not appear
    expect(table).not.toContain("g");
    expect(table).not.toContain("m");
    expect(table).not.toContain("s");
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("rehypeUnits — happy path", () => {
  it("wraps '5kg' in <span class='units'> with .num and .unit children", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("The mass is 5kg."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const unitsSpan = findUnitsSpan(para);
    if (!unitsSpan) throw new Error("expected a .units span");
    expect(numText(unitsSpan)).toBe("5");
    expect(unitText(unitsSpan)).toBe("kg");
  });

  it("wraps '100 Hz' (with space) correctly", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("Frequency: 100 Hz."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const unitsSpan = findUnitsSpan(para);
    if (!unitsSpan) throw new Error("expected a .units span");
    expect(numText(unitsSpan)).toBe("100");
    expect(unitText(unitsSpan)).toBe("Hz");
  });

  it("wraps '9.8 m/s²' (decimal + compound unit)", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("Gravitational acceleration is 9.8 m/s²."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const unitsSpan = findUnitsSpan(para);
    if (!unitsSpan) throw new Error("expected a .units span");
    expect(numText(unitsSpan)).toBe("9.8");
    expect(unitText(unitsSpan)).toBe("m/s²");
  });

  it("wraps '25°C' (no space, degree unit)", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("Temperature is 25°C."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const unitsSpan = findUnitsSpan(para);
    if (!unitsSpan) throw new Error("expected a .units span");
    expect(numText(unitsSpan)).toBe("25");
    expect(unitText(unitsSpan)).toBe("°C");
  });

  it("preserves surrounding text when wrapping", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("Add 100 kJ of energy."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const textNodes = (para.children as Array<Text | Element>).filter(
      (c): c is Text => c.type === "text",
    );
    expect(textNodes.some((t) => t.value.includes("Add "))).toBe(true);
    expect(textNodes.some((t) => t.value.includes(" of energy."))).toBe(true);
  });

  it("wraps multiple unit matches in one text node", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("5kg and 100 Hz."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const spans = (para.children as Array<Text | Element>).filter(
      (c): c is Element =>
        c.type === "element" &&
        Array.isArray((c as Element).properties?.className) &&
        ((c as Element).properties?.className as string[]).includes("units"),
    );
    expect(spans).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// False-positive avoidance — excluded single-letter units
// ---------------------------------------------------------------------------

describe("rehypeUnits — excluded single-letter units", () => {
  it("does NOT match '5g' (g is excluded)", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("Only 5g of sugar."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const unitsSpan = findUnitsSpan(para);
    // `g` is not in UNIT_TABLE, so no wrapping should occur for "5g".
    expect(unitsSpan).toBeUndefined();
  });

  it("does NOT match '5m' (m is excluded)", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("Move 5m to the left."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    // `m` is not in UNIT_TABLE (only multi-char like `mm`, `km`, etc. are).
    const unitsSpan = findUnitsSpan(para);
    expect(unitsSpan).toBeUndefined();
  });

  it("does NOT match '10s' (s is excluded)", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("Wait 10s before continuing."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const unitsSpan = findUnitsSpan(para);
    expect(unitsSpan).toBeUndefined();
  });

  it("leaves plain numbers without a unit unchanged", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("There are 42 students."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    expect(para.children).toHaveLength(1);
    expect((para.children[0] as Text).value).toBe("There are 42 students.");
  });
});

// ---------------------------------------------------------------------------
// Ancestor-skip: must not wrap inside code / pre / kbd / samp / a
// ---------------------------------------------------------------------------

describe("rehypeUnits — ancestor-skip", () => {
  it("skips text inside <code>", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(el("code", text("5kg")))],
    };
    runPlugin(tree);
    const code = (tree.children[0] as Element).children[0] as Element;
    expect(code.children).toHaveLength(1);
    expect((code.children[0] as Text).value).toBe("5kg");
  });

  it("skips text inside <pre>", () => {
    const tree: Root = {
      type: "root",
      children: [el("pre", el("code", text("mass = 100 kg")))],
    };
    runPlugin(tree);
    const pre = tree.children[0] as Element;
    const code = pre.children[0] as Element;
    expect(code.children.length).toBe(1);
    expect((code.children[0] as Text).value).toBe("mass = 100 kg");
  });

  it("skips text inside <a>", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(el("a", text("100 Hz signal")))],
    };
    runPlugin(tree);
    const anchor = (tree.children[0] as Element).children[0] as Element;
    // Text should be unchanged
    expect(anchor.children.length).toBe(1);
    expect((anchor.children[0] as Text).value).toBe("100 Hz signal");
  });

  it("skips text inside <kbd>", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(el("kbd", text("5kHz")))],
    };
    runPlugin(tree);
    const kbd = (tree.children[0] as Element).children[0] as Element;
    expect(kbd.children.length).toBe(1);
  });

  it("skips text inside <samp>", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(el("samp", text("100 Pa")))],
    };
    runPlugin(tree);
    const samp = (tree.children[0] as Element).children[0] as Element;
    expect(samp.children.length).toBe(1);
  });
});
