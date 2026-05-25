import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Definition } from "../../components/markdown/definition.js";
import styles from "../../components/markdown-content.module.css";

afterEach(() => cleanup());

describe("Definition", () => {
  it("renders a <dfn> element", () => {
    const { container } = render(
      <Definition term="mitosis" isFirstOccurrence={false}>
        mitosis
      </Definition>,
    );
    expect(container.querySelector("dfn")).not.toBeNull();
  });

  it("applies .definition class when isFirstOccurrence=true", () => {
    const { container } = render(
      <Definition term="entropy" isFirstOccurrence={true}>
        entropy
      </Definition>,
    );
    const dfn = container.querySelector("dfn");
    expect(dfn?.className).toContain(styles.definition);
  });

  it("does NOT apply .definition class when isFirstOccurrence=false", () => {
    const { container } = render(
      <Definition term="entropy" isFirstOccurrence={false}>
        entropy
      </Definition>,
    );
    const dfn = container.querySelector("dfn");
    // class should be undefined / empty string when not first occurrence
    expect(dfn?.className ?? "").not.toContain(styles.definition);
  });

  it("renders the term text as children", () => {
    const { container } = render(
      <Definition term="photosynthesis" isFirstOccurrence={true}>
        photosynthesis
      </Definition>,
    );
    expect(container.querySelector("dfn")?.textContent).toBe("photosynthesis");
  });

  it("sets the title attribute to the term", () => {
    const { container } = render(
      <Definition term="osmosis" isFirstOccurrence={false}>
        osmosis
      </Definition>,
    );
    expect(container.querySelector("dfn")?.getAttribute("title")).toBe("osmosis");
  });

  it("is pure presentational — no buttons or interactive controls", () => {
    const { container } = render(
      <Definition term="velocity" isFirstOccurrence={true}>
        velocity
      </Definition>,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });
});
