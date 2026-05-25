import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Figure } from "../../components/markdown/figure.js";
import styles from "../../components/markdown-content.module.css";

afterEach(() => cleanup());

describe("Figure", () => {
  it("renders a <figure> element", () => {
    const { container } = render(<Figure>body content</Figure>);
    expect(container.querySelector("figure")).not.toBeNull();
  });

  it("applies the .figure class to the root element", () => {
    const { container } = render(<Figure>body</Figure>);
    const fig = container.querySelector("figure");
    expect(fig?.className).toContain(styles.figure);
  });

  it("renders children inside the .figureBody element", () => {
    const { container } = render(
      <Figure>
        <p id="inner">step one</p>
      </Figure>,
    );
    const body = container.querySelector(`.${styles.figureBody}`);
    expect(body).not.toBeNull();
    expect(body?.querySelector("#inner")?.textContent).toBe("step one");
  });

  it("renders no <figcaption> when caption is omitted", () => {
    const { container } = render(<Figure>body</Figure>);
    expect(container.querySelector("figcaption")).toBeNull();
  });

  it("renders a <figcaption> with the caption text when caption is provided", () => {
    const { container } = render(<Figure caption="Figure 1: Example">body</Figure>);
    const caption = container.querySelector("figcaption");
    expect(caption).not.toBeNull();
    expect(caption?.textContent).toContain("Figure 1: Example");
  });

  it("applies .figureCaption to the <figcaption> element", () => {
    const { container } = render(<Figure caption="Fig">body</Figure>);
    const caption = container.querySelector("figcaption");
    expect(caption?.className).toContain(styles.figureCaption);
  });

  it("renders no verdict span when verdict is omitted", () => {
    const { container } = render(<Figure caption="Fig">body</Figure>);
    expect(container.querySelector(`.${styles.figureVerdict}`)).toBeNull();
  });

  describe("verdict='ok'", () => {
    it("renders a verdict span with .figureVerdictOk", () => {
      const { container } = render(
        <Figure caption="Fig" verdict="ok">
          body
        </Figure>,
      );
      const verdict = container.querySelector(`.${styles.figureVerdict}`);
      expect(verdict).not.toBeNull();
      expect(verdict?.className).toContain(styles.figureVerdictOk);
    });

    it("renders the checkmark glyph for verdict='ok'", () => {
      const { container } = render(
        <Figure caption="Fig" verdict="ok">
          body
        </Figure>,
      );
      const verdict = container.querySelector(`.${styles.figureVerdict}`);
      expect(verdict?.textContent).toBe("✓");
    });

    it("has an aria-label describing 'correct'", () => {
      const { container } = render(
        <Figure caption="Fig" verdict="ok">
          body
        </Figure>,
      );
      const verdict = container.querySelector(`.${styles.figureVerdict}`);
      expect(verdict?.getAttribute("aria-label")).toBe("correct");
    });
  });

  describe("verdict='check'", () => {
    it("renders a verdict span with .figureVerdictCheck", () => {
      const { container } = render(
        <Figure caption="Fig" verdict="check">
          body
        </Figure>,
      );
      const verdict = container.querySelector(`.${styles.figureVerdict}`);
      expect(verdict).not.toBeNull();
      expect(verdict?.className).toContain(styles.figureVerdictCheck);
    });

    it("renders the '?' glyph for verdict='check'", () => {
      const { container } = render(
        <Figure caption="Fig" verdict="check">
          body
        </Figure>,
      );
      const verdict = container.querySelector(`.${styles.figureVerdict}`);
      expect(verdict?.textContent).toBe("?");
    });

    it("has an aria-label describing 'check your work'", () => {
      const { container } = render(
        <Figure caption="Fig" verdict="check">
          body
        </Figure>,
      );
      const verdict = container.querySelector(`.${styles.figureVerdict}`);
      expect(verdict?.getAttribute("aria-label")).toBe("check your work");
    });
  });

  it("renders both caption and body when both are provided", () => {
    const { container } = render(
      <Figure caption="Worked example 3">
        <p>Step-by-step solution here.</p>
      </Figure>,
    );
    expect(container.querySelector("figcaption")?.textContent).toContain("Worked example 3");
    expect(container.querySelector(`.${styles.figureBody}`)?.textContent).toContain(
      "Step-by-step solution here.",
    );
  });

  it("does not render any interactive controls — pure presentational", () => {
    const { container } = render(
      <Figure caption="Fig" verdict="ok">
        body
      </Figure>,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });
});
