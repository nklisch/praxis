/**
 * Tests for the <ResumedBanner> component.
 *
 * Verifies:
 * - Renders with the "Resumed" label and session title.
 * - Has proper ARIA attributes (role="status", aria-live="polite").
 * - The dot ornament is present.
 * - Title separator is rendered via CSS ::before (we check the element is present).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResumedBanner } from "../components/resumed-banner.js";

afterEach(() => cleanup());

describe("ResumedBanner", () => {
  it("renders with role=status for accessibility", () => {
    const { container } = render(<ResumedBanner title="algebra · teach" />);
    const banner = container.querySelector('[role="status"]');
    expect(banner).not.toBeNull();
  });

  it("has aria-live=polite", () => {
    const { container } = render(<ResumedBanner title="algebra · teach" />);
    const banner = container.querySelector('[aria-live="polite"]');
    expect(banner).not.toBeNull();
  });

  it("renders the 'Resumed' label text", () => {
    const { container } = render(<ResumedBanner title="algebra · teach" />);
    const label = container.querySelector('[class*="label"]');
    expect(label?.textContent?.toLowerCase()).toContain("resumed");
  });

  it("renders the session title", () => {
    const { container } = render(<ResumedBanner title="algebra · teach" />);
    const titleEl = container.querySelector('[class*="title"]');
    expect(titleEl?.textContent).toContain("algebra · teach");
  });

  it("renders the dot ornament (aria-hidden)", () => {
    const { container } = render(<ResumedBanner title="algebra · teach" />);
    const dot = container.querySelector('[class*="dot"][aria-hidden="true"]');
    expect(dot).not.toBeNull();
  });

  it("includes the session title in the aria-label on the banner", () => {
    const { container } = render(<ResumedBanner title="Chain rule" />);
    const banner = container.querySelector('[aria-label]');
    expect(banner?.getAttribute("aria-label")).toContain("Chain rule");
  });

  it("truncates very long titles gracefully (CSS handles it; component still renders)", () => {
    const longTitle = "A very long session title that exceeds the max-width limit set by CSS";
    const { container } = render(<ResumedBanner title={longTitle} />);
    const titleEl = container.querySelector('[class*="title"]');
    // Component renders; CSS truncation doesn't affect DOM content
    expect(titleEl?.textContent).toContain(longTitle);
  });

  it("renders without crashing when title is empty string", () => {
    expect(() => render(<ResumedBanner title="" />)).not.toThrow();
  });
});
