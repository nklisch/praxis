import type { Element, Root, Text } from "hast";
import { describe, expect, it } from "vitest";
import { rehypeCitationChips } from "../lib/rehype-citation-chips.js";

function runPlugin(tree: Root): Root {
  // Plugin returns a transformer; call it directly to mutate the tree.
  // biome-ignore lint/suspicious/noExplicitAny: unified plugin transformer signature
  const transform = rehypeCitationChips() as any;
  transform(tree);
  return tree;
}

function paragraph(...children: Array<Text | Element>): Element {
  return { type: "element", tagName: "p", properties: {}, children };
}

function text(value: string): Text {
  return { type: "text", value };
}

function code(...children: Array<Text | Element>): Element {
  return { type: "element", tagName: "code", properties: {}, children };
}

function pre(...children: Array<Text | Element>): Element {
  return { type: "element", tagName: "pre", properties: {}, children };
}

describe("rehypeCitationChips", () => {
  it("converts [N] in plain text to a citation-chip element", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("See [1] for details."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    expect(para.children).toHaveLength(3);
    expect((para.children[0] as Text).value).toBe("See ");
    const chip = para.children[1] as Element;
    expect(chip.tagName).toBe("citation-chip");
    expect(chip.properties?.dataIndex).toBe("1");
    expect((para.children[2] as Text).value).toBe(" for details.");
  });

  it("preserves [N] inside <code> ancestors", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(code(text("arr[1]")))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const codeNode = para.children[0] as Element;
    expect(codeNode.children).toHaveLength(1);
    expect((codeNode.children[0] as Text).value).toBe("arr[1]");
  });

  it("preserves [N] inside <pre> ancestors", () => {
    const tree: Root = {
      type: "root",
      children: [pre(code(text("arr[2] = 3")))],
    };
    runPlugin(tree);
    const preNode = tree.children[0] as Element;
    const codeNode = preNode.children[0] as Element;
    expect((codeNode.children[0] as Text).value).toBe("arr[2] = 3");
  });

  it("handles multiple chips in one text node", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("See [1] and [2] together."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    expect(para.children).toHaveLength(5);
    expect((para.children[0] as Text).value).toBe("See ");
    expect((para.children[1] as Element).tagName).toBe("citation-chip");
    expect((para.children[1] as Element).properties?.dataIndex).toBe("1");
    expect((para.children[2] as Text).value).toBe(" and ");
    expect((para.children[3] as Element).tagName).toBe("citation-chip");
    expect((para.children[3] as Element).properties?.dataIndex).toBe("2");
    expect((para.children[4] as Text).value).toBe(" together.");
  });

  it("leaves text without [N] unchanged", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("plain prose, no chips."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    expect(para.children).toHaveLength(1);
    expect((para.children[0] as Text).value).toBe("plain prose, no chips.");
  });

  it("emits chip with no surrounding text when input is just [N]", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("[3]"))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    expect(para.children).toHaveLength(1);
    expect((para.children[0] as Element).tagName).toBe("citation-chip");
    expect((para.children[0] as Element).properties?.dataIndex).toBe("3");
  });

  it("processes multiple paragraphs independently", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("first [1].")), paragraph(text("second [2]."))],
    };
    runPlugin(tree);
    expect(((tree.children[0] as Element).children[1] as Element).properties?.dataIndex).toBe("1");
    expect(((tree.children[1] as Element).children[1] as Element).properties?.dataIndex).toBe("2");
  });
});
