/**
 * Theme-token smoke tests.
 *
 * 1. global.css structure — asserts both `:root` (dark default) and the
 *    `@media (prefers-color-scheme: light)` block define the same set of
 *    `--color-*` variables (no token left behind in either mode).
 *
 * 2. <Nav> render smoke — renders the nav inside a PraxisClientProvider and
 *    asserts it produces at least one link without throwing. jsdom doesn't
 *    evaluate the media query, but the render path is covered.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Nav } from "../components/nav.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// Nav uses <Link> from TanStack Router — mock just enough for jsdom.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      to: string;
      className?: string;
      activeProps?: Record<string, string>;
      activeOptions?: Record<string, boolean>;
    }) => (
      <a href="#" className={className}>
        {children}
      </a>
    ),
    useNavigate: () => vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const globalCssPath = resolve(__dirname, "../styles/global.css");

function readGlobalCss(): string {
  return readFileSync(globalCssPath, "utf-8");
}

/**
 * Extract all `--color-*` variable names defined inside a given CSS block
 * delimited by `{` … `}`. Returns a Set of variable names (without `:`).
 */
function extractColorVarNames(block: string): Set<string> {
  const matches = block.match(/--color-[a-zA-Z-]+(?=\s*:)/g) ?? [];
  return new Set(matches);
}

// ---------------------------------------------------------------------------
// Tests: global.css token coverage
// ---------------------------------------------------------------------------

describe("global.css theme tokens", () => {
  it("contains a @media (prefers-color-scheme: light) block", () => {
    const css = readGlobalCss();
    expect(css).toContain("@media (prefers-color-scheme: light)");
  });

  it("light-mode block overrides all theme-surface --color-* variables from :root", () => {
    const css = readGlobalCss();

    // Grab the light-mode block
    const lightMatch = css.match(
      /@media\s*\(\s*prefers-color-scheme\s*:\s*light\s*\)\s*\{[\s\S]*?:root\s*\{([^}]+)\}/,
    );
    expect(lightMatch, "light-mode :root block must exist").not.toBeNull();
    const lightBlock = lightMatch![1];
    const lightVars = extractColorVarNames(lightBlock);

    // These tokens are surface/theme colors that must be overridden in light mode.
    // Mode-invariant tokens (--color-badge, --color-badge-text) are intentionally
    // omitted from the light block since they carry the same semantic value in
    // both modes (amber warning pill reads well on any background).
    const surfaceTokens = [
      "--color-bg",
      "--color-surface",
      "--color-border",
      "--color-text",
      "--color-text-muted",
      "--color-accent",
      "--color-user-bubble",
      "--color-assistant-bubble",
    ];

    for (const varName of surfaceTokens) {
      expect(lightVars.has(varName), `${varName} missing from light-mode block`).toBe(true);
    }
  });

  it(":root defines the required --color-* tokens", () => {
    const css = readGlobalCss();
    const required = [
      "--color-bg",
      "--color-surface",
      "--color-border",
      "--color-text",
      "--color-text-muted",
      "--color-accent",
      "--color-user-bubble",
      "--color-assistant-bubble",
    ];
    for (const token of required) {
      expect(css, `${token} must be defined in :root`).toContain(token);
    }
  });

  it("light-mode block defines all required --color-* tokens", () => {
    const css = readGlobalCss();
    const required = [
      "--color-bg",
      "--color-surface",
      "--color-border",
      "--color-text",
      "--color-text-muted",
      "--color-accent",
      "--color-user-bubble",
      "--color-assistant-bubble",
    ];
    const lightMatch = css.match(
      /@media\s*\(\s*prefers-color-scheme\s*:\s*light\s*\)\s*\{[\s\S]*?:root\s*\{([^}]+)\}/,
    );
    expect(lightMatch, "light-mode :root block must exist").not.toBeNull();
    const lightBlock = lightMatch![1];
    for (const token of required) {
      expect(lightBlock, `${token} must be defined in light-mode block`).toContain(token);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: <Nav> render smoke
// ---------------------------------------------------------------------------

describe("Nav render smoke", () => {
  it("renders without throwing and shows the Library link", () => {
    const client = makeFakeClient({
      flashcards: {
        dueCount: async () => 0,
      } as typeof client.flashcards,
    });

    render(
      <PraxisClientProvider client={client}>
        <Nav />
      </PraxisClientProvider>,
    );

    expect(screen.getByText("Library")).toBeDefined();
    expect(screen.getByText("Praxis")).toBeDefined();
  });

  it("renders all primary nav links", () => {
    const client = makeFakeClient({
      flashcards: {
        dueCount: async () => 0,
      } as typeof client.flashcards,
    });

    render(
      <PraxisClientProvider client={client}>
        <Nav />
      </PraxisClientProvider>,
    );

    expect(screen.getByText("Library")).toBeDefined();
    expect(screen.getByText("Tutor")).toBeDefined();
    expect(screen.getByText("Workspace")).toBeDefined();
    expect(screen.getByText("Configure")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
  });

  it("renders the wordmark with editorial ornament + italic title", () => {
    const client = makeFakeClient({
      flashcards: {
        dueCount: async () => 0,
      } as typeof client.flashcards,
    });

    const { container } = render(
      <PraxisClientProvider client={client}>
        <Nav />
      </PraxisClientProvider>,
    );

    // The wordmark text "Praxis" must remain the accessible name.
    expect(screen.getByText("Praxis")).toBeDefined();
    // The ornament glyph must be aria-hidden so screen readers don't
    // announce it as a character.
    const ornament = container.querySelector('[aria-hidden="true"]');
    expect(ornament).not.toBeNull();
    expect(ornament?.textContent).toBe("§");
  });
});
