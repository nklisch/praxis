/**
 * Tests for TopNav — the app-shell running head.
 *
 * Verifies:
 * - Wordmark renders as italic "Praxis".
 * - All six surface links render with their labels.
 * - All six glyph ornaments render.
 * - Active link receives the linkActive CSS class via activeProps.
 * - nav element has accessible aria-label.
 * - themeSlot content renders inside the running head.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../components/theme-toggle.js";
import { TopNav } from "../components/top-nav.js";

afterEach(() => cleanup());

// Mock TanStack Router — Link renders a plain <a> that accepts activeProps
// so we can verify the active class is applied when the link matches.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    // Minimal Link stub: renders an anchor; applies activeProps.className when
    // the `to` prop matches `mockActivePath` (set per-test via `__setActivePath`).
    Link: ({
      to,
      children,
      className,
      activeProps,
    }: {
      to: string;
      children: React.ReactNode;
      className?: string;
      activeProps?: { className?: string };
      activeOptions?: unknown;
    }) => {
      const isActive = (globalThis as Record<string, unknown>).__mockActivePath === to;
      const appliedClass = isActive && activeProps?.className ? activeProps.className : className;
      return (
        <a href={to} className={appliedClass}>
          {children}
        </a>
      );
    },
  };
});

/** Point the mock router at a specific path to simulate active link state. */
function setActivePath(path: string) {
  (globalThis as Record<string, unknown>).__mockActivePath = path;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__mockActivePath;
});

describe("TopNav", () => {
  it("renders the italic Praxis wordmark", () => {
    render(<TopNav />);
    // The wordmark is an <em> inside the header.
    const em = screen.getByText("Praxis");
    expect(em.tagName.toLowerCase()).toBe("em");
  });

  it("renders the main navigation with accessible label", () => {
    render(<TopNav />);
    expect(screen.getByRole("navigation", { name: /main navigation/i })).toBeDefined();
  });

  it("renders all six surface link labels", () => {
    render(<TopNav />);
    expect(screen.getByRole("link", { name: /Library/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Workspace/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Concept maps/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Progress/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Configure/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Settings/i })).toBeDefined();
  });

  it("renders all six typographic glyph ornaments", () => {
    render(<TopNav />);
    // Glyphs are aria-hidden — use DOM query rather than getByText for a11y purity.
    const glyphs = document.querySelectorAll("[aria-hidden=true]");
    const glyphTexts = Array.from(glyphs).map((el) => el.textContent);
    expect(glyphTexts).toContain("§"); // Library
    expect(glyphTexts).toContain("¶"); // Workspace
    expect(glyphTexts).toContain("‡"); // Concept maps
    expect(glyphTexts).toContain("‖"); // Progress
    expect(glyphTexts).toContain("⁂"); // Configure
    expect(glyphTexts).toContain("·"); // Settings
  });

  it("Library link points to /", () => {
    render(<TopNav />);
    const link = screen.getByRole("link", { name: /Library/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/");
  });

  it("Workspace link points to /workspace", () => {
    render(<TopNav />);
    const link = screen.getByRole("link", { name: /Workspace/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/workspace");
  });

  it("Configure link points to /configure", () => {
    render(<TopNav />);
    const link = screen.getByRole("link", { name: /Configure/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/configure");
  });

  it("Settings link points to /settings", () => {
    render(<TopNav />);
    const link = screen.getByRole("link", { name: /Settings/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/settings");
  });

  it("Settings link receives the linkActive CSS class when /settings is active", () => {
    setActivePath("/settings");
    render(<TopNav />);
    const settingsLink = screen.getByRole("link", { name: /Settings/i });
    expect(settingsLink.className).toMatch(/linkActive/);
  });

  it("Settings link does not receive the linkActive CSS class when another path is active", () => {
    setActivePath("/configure");
    render(<TopNav />);
    const settingsLink = screen.getByRole("link", { name: /Settings/i });
    expect(settingsLink.className).not.toMatch(/linkActive/);
  });

  it("active link receives the linkActive CSS class via activeProps", () => {
    setActivePath("/workspace");
    render(<TopNav />);
    const workspaceLink = screen.getByRole("link", { name: /Workspace/i });
    // The active class should contain "linkActive" (CSS modules suffix-hashes it
    // in production, but jsdom/vitest passes the module CSS identifier through).
    expect(workspaceLink.className).toMatch(/linkActive/);
  });

  it("inactive links do not receive the linkActive CSS class", () => {
    setActivePath("/workspace");
    render(<TopNav />);
    const libraryLink = screen.getByRole("link", { name: /Library/i });
    expect(libraryLink.className).not.toMatch(/linkActive/);
  });

  it("renders ThemeToggle buttons when themeSlot is provided", () => {
    render(<TopNav themeSlot={<ThemeToggle />} />);
    // ThemeToggle renders 3 buttons: auto · light · dark
    expect(screen.getByRole("button", { name: "auto" })).toBeDefined();
    expect(screen.getByRole("button", { name: "light" })).toBeDefined();
    expect(screen.getByRole("button", { name: "dark" })).toBeDefined();
  });

  it("ThemeToggle sits inside the running head when themeSlot is provided", () => {
    render(<TopNav themeSlot={<ThemeToggle />} />);
    const header = screen.getByRole("banner");
    const autoBtn = screen.getByRole("button", { name: "auto" });
    expect(header.contains(autoBtn)).toBe(true);
  });

  it("does not render theme toggle buttons when themeSlot is absent", () => {
    render(<TopNav />);
    expect(screen.queryByRole("button", { name: "auto" })).toBeNull();
  });
});
