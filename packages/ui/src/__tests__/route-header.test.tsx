import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RouteHeader } from "../components/route-header.js";

afterEach(() => {
  cleanup();
});

describe("RouteHeader", () => {
  it("renders the ornament, kicker, and title", () => {
    render(<RouteHeader ornament="¶" kicker="COURSES" title="courses" />);

    expect(screen.getByText("¶")).toBeDefined();
    expect(screen.getByText("COURSES")).toBeDefined();
    expect(screen.getByText("courses")).toBeDefined();
  });

  it("renders the optional deck when provided", () => {
    render(
      <RouteHeader
        ornament="§"
        kicker="PACKS"
        title="knowledge packs"
        deck="available curriculum"
      />,
    );

    expect(screen.getByText("available curriculum")).toBeDefined();
  });

  it("does not render a deck element when deck is omitted", () => {
    render(<RouteHeader ornament="·" kicker="SETTINGS" title="settings" />);

    expect(screen.queryByText(/—/)).toBeNull();
  });

  it("renders optional actions when provided", () => {
    render(
      <RouteHeader
        ornament="¶"
        kicker="COURSES"
        title="courses"
        actions={<button type="button">+ New course</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "+ New course" })).toBeDefined();
  });

  it("renders no actions area when actions is omitted", () => {
    render(<RouteHeader ornament="¶" kicker="COURSES" title="courses" />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders as a header landmark element", () => {
    render(<RouteHeader ornament="¶" kicker="COURSES" title="courses" />);

    expect(screen.getByRole("banner")).toBeDefined();
  });

  it("applies an inline --tint-route style when tint prop is provided", () => {
    const { container } = render(
      <RouteHeader ornament="¶" kicker="COURSES" title="courses" tint="#d4a373" />,
    );

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    // The inline style should carry the tint override
    expect(header?.getAttribute("style")).toContain("--tint-route");
    expect(header?.getAttribute("style")).toContain("#d4a373");
  });

  it("does not set an inline style when tint is not provided", () => {
    const { container } = render(<RouteHeader ornament="¶" kicker="COURSES" title="courses" />);

    const header = container.querySelector("header");
    expect(header?.getAttribute("style")).toBeNull();
  });
});
