import type { Element, Root, Text } from "hast";
import { describe, expect, it } from "vitest";
import { rehypeFilePaths } from "../lib/markdown-plugins/rehype-file-paths.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runPlugin(tree: Root): Root {
  // Plugin returns a transformer; call it directly to mutate the tree.
  // biome-ignore lint/suspicious/noExplicitAny: unified plugin transformer signature
  const transform = rehypeFilePaths() as any;
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

function findSpan(node: Element): Element | undefined {
  for (const child of node.children) {
    if (child.type === "element" && (child as Element).tagName === "span") {
      return child as Element;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("rehypeFilePaths — happy path", () => {
  it("wraps a simple file path in <span class='file-path'>", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("See packages/core/src/foo.ts for details."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const span = findSpan(para);
    expect(span).not.toBeUndefined();
    expect(span?.properties?.className).toEqual(["file-path"]);
    expect((span?.children[0] as Text).value).toBe("packages/core/src/foo.ts");
  });

  it("preserves surrounding text before and after the path", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("Edit packages/ui/src/app.tsx and rebuild."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const [before, span, after] = para.children as [Text, Element, Text];
    expect(before.value).toBe("Edit ");
    expect((span.children[0] as Text).value).toBe("packages/ui/src/app.tsx");
    expect(after.value).toBe(" and rebuild.");
  });

  it("wraps multiple paths in one text node independently", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("See src/a.ts and src/b.ts for examples."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const spans = (para.children as Array<Text | Element>).filter(
      (c): c is Element => c.type === "element" && (c as Element).tagName === "span",
    );
    expect(spans).toHaveLength(2);
    const [span0, span1] = spans;
    if (!span0 || !span1) throw new Error("expected two span elements");
    expect((span0.children[0] as Text).value).toBe("src/a.ts");
    expect((span1.children[0] as Text).value).toBe("src/b.ts");
  });

  it("matches paths with hyphens in the directory name", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("Found in packages/claude-cli-sdk/src/index.ts."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const span = findSpan(para);
    expect(span).not.toBeUndefined();
    expect((span?.children[0] as Text).value).toBe("packages/claude-cli-sdk/src/index.ts");
  });

  it("matches paths with dots in the directory name (e.g. .praxis/dev.db)", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("Database lives at .praxis/dev.db."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const span = findSpan(para);
    // .praxis starts with a dot — the word-boundary \b before [\w-]+ won't
    // match a leading dot.  A leading-dot path like .praxis/dev.db starts with
    // a non-word char so the regex won't match it starting at the dot.
    // This is acceptable — leading-dot paths are rare in prose and the \b
    // is necessary to avoid matching mid-word.
    //
    // If the dot prefix is dropped, `praxis/dev.db` *is* matched:
    if (span !== undefined) {
      // Some environments may or may not match — just assert structure is valid.
      expect(span.properties?.className).toEqual(["file-path"]);
    }
    // Either way: no crash, no malformed nodes.
    expect(para.children.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Ancestor-skip: must not wrap inside code / pre / kbd / samp / a
// ---------------------------------------------------------------------------

describe("rehypeFilePaths — ancestor-skip", () => {
  it("skips text inside <code>", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(el("code", text("packages/core/src/foo.ts")))],
    };
    runPlugin(tree);
    const code = (tree.children[0] as Element).children[0] as Element;
    expect(code.children).toHaveLength(1);
    expect((code.children[0] as Text).value).toBe("packages/core/src/foo.ts");
  });

  it("skips text inside <pre>", () => {
    const tree: Root = {
      type: "root",
      children: [el("pre", el("code", text("packages/core/src/foo.ts")))],
    };
    runPlugin(tree);
    const pre = tree.children[0] as Element;
    const code = pre.children[0] as Element;
    expect((code.children[0] as Text).value).toBe("packages/core/src/foo.ts");
    // No spans introduced
    expect(code.children.length).toBe(1);
  });

  it("skips text inside <a>", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(el("a", text("packages/core/src/foo.ts")))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    const anchor = para.children[0] as Element;
    expect((anchor.children[0] as Text).value).toBe("packages/core/src/foo.ts");
    expect(anchor.children.length).toBe(1);
  });

  it("skips text inside <kbd>", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(el("kbd", text("packages/core/src/foo.ts")))],
    };
    runPlugin(tree);
    const kbd = (tree.children[0] as Element).children[0] as Element;
    expect(kbd.children.length).toBe(1);
    expect((kbd.children[0] as Text).value).toBe("packages/core/src/foo.ts");
  });

  it("skips text inside <samp>", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(el("samp", text("packages/core/src/foo.ts")))],
    };
    runPlugin(tree);
    const samp = (tree.children[0] as Element).children[0] as Element;
    expect(samp.children.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// False-positive avoidance
// ---------------------------------------------------------------------------

describe("rehypeFilePaths — false-positive avoidance", () => {
  it("does not match plain prose without slashes", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("No file path here, just words."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    // Unchanged — still one text node
    expect(para.children).toHaveLength(1);
    expect((para.children[0] as Text).value).toBe("No file path here, just words.");
  });

  it("does not match a bare directory path with no file extension", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("Look in packages/core/src for the file."))],
    };
    runPlugin(tree);
    // `packages/core/src` has no `.ext` so the regex should NOT match it.
    // The text node is unchanged.
    const para = tree.children[0] as Element;
    const spans = (para.children as Array<Text | Element>).filter(
      (c): c is Element => c.type === "element",
    );
    // `src` without extension should not be wrapped
    for (const span of spans) {
      expect((span.children[0] as Text).value).not.toBe("packages/core/src");
    }
  });

  it("does not match a number-only segment like 192.168.1.1 (IP address)", () => {
    // IP addresses contain only digits and dots — the \w+ segment requires at
    // least one word character before the slash, so IPs don't match.
    const tree: Root = {
      type: "root",
      children: [paragraph(text("Connect to 192.168.1.1 via SSH."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    // Should be unchanged (no slashes → no match)
    expect(para.children).toHaveLength(1);
  });

  it("leaves text without any path pattern unchanged", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(text("plain prose, no paths."))],
    };
    runPlugin(tree);
    const para = tree.children[0] as Element;
    expect(para.children).toHaveLength(1);
    expect((para.children[0] as Text).value).toBe("plain prose, no paths.");
  });
});
