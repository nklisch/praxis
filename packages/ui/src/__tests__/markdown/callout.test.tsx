import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Callout, type CalloutType } from "../../components/markdown/callout.js";
import styles from "../../components/markdown-content.module.css";

afterEach(() => cleanup());

const TYPES: CalloutType[] = ["theorem", "lemma", "hint", "warning"];

const TYPE_CLASS: Record<CalloutType, string> = {
  theorem: styles.calloutTheorem,
  lemma: styles.calloutLemma,
  hint: styles.calloutHint,
  warning: styles.calloutWarning,
};

describe("Callout", () => {
  it("renders as an <aside> with role='note'", () => {
    const { container } = render(<Callout type="hint">body text</Callout>);
    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside?.getAttribute("role")).toBe("note");
  });

  it("always applies the base .callout class", () => {
    const { container } = render(<Callout type="theorem">body</Callout>);
    const aside = container.querySelector("aside");
    expect(aside?.className).toContain(styles.callout);
  });

  for (const type of TYPES) {
    it(`applies the modifier class for type="${type}"`, () => {
      const { container } = render(<Callout type={type}>body</Callout>);
      const aside = container.querySelector("aside");
      expect(aside?.className).toContain(TYPE_CLASS[type]);
    });
  }

  it("renders the icon label text", () => {
    const { container } = render(<Callout type="warning">body</Callout>);
    const icon = container.querySelector(`.${styles.calloutIcon}`);
    expect(icon).not.toBeNull();
    expect(icon?.textContent).toBe("Warning");
  });

  it("renders children inside the .calloutBody element", () => {
    const { container } = render(
      <Callout type="lemma">
        <p id="test-body">the body</p>
      </Callout>,
    );
    const body = container.querySelector(`.${styles.calloutBody}`);
    expect(body).not.toBeNull();
    expect(body?.querySelector("#test-body")?.textContent).toBe("the body");
  });

  it("does not render any interactive controls — pure presentational", () => {
    const { container } = render(<Callout type="hint">click me</Callout>);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  it("renders nested markdown-like children (bold, em, code)", () => {
    const { container } = render(
      <Callout type="theorem">
        Use <strong>bold</strong> and <em>italic</em> and <code>code</code>.
      </Callout>,
    );
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  // Accessibility: icon is aria-hidden so screen readers don't double-announce
  it("marks the icon span aria-hidden", () => {
    const { container } = render(<Callout type="hint">body</Callout>);
    const icon = container.querySelector(`.${styles.calloutIcon}`);
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });
});
