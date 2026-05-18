/**
 * Theme-token smoke tests.
 *
 * 1. global.css structure — asserts the `:root` block and the dark-mode blocks
 *    (both @media and data-theme) define the expected set of `--color-*`
 *    variables from the locked Studio Quiet / System Editorial token vocabulary.
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
  it("contains a @media (prefers-color-scheme: dark) block", () => {
    const css = readGlobalCss();
    expect(css).toContain("@media (prefers-color-scheme: dark)");
  });

  it("contains a :root[data-theme='dark'] explicit override block", () => {
    const css = readGlobalCss();
    expect(css).toContain(':root[data-theme="dark"]');
  });

  it(":root defines the required Studio Quiet --color-* tokens", () => {
    const css = readGlobalCss();
    const required = [
      "--color-bg-primary",
      "--color-bg-secondary",
      "--color-bg-tertiary",
      "--color-bg-inverse",
      "--color-text-primary",
      "--color-text-secondary",
      "--color-text-tertiary",
      "--color-text-inverse",
      "--color-text-link",
      "--color-border",
      "--color-accent",
      "--color-accent-muted",
      "--color-success",
      "--color-warning",
      "--color-danger",
    ];
    for (const token of required) {
      expect(css, `${token} must be defined in :root`).toContain(token);
    }
  });

  it(":root defines all seven mode-tint tokens", () => {
    const css = readGlobalCss();
    const tints = [
      "--tint-teach",
      "--tint-course-create",
      "--tint-quiz",
      "--tint-homework",
      "--tint-exam",
      "--tint-configure",
      "--tint-study-skills",
    ];
    for (const tint of tints) {
      expect(css, `${tint} must be defined in :root`).toContain(tint);
    }
  });

  it("--tint-route is declared as var(--color-text-secondary)", () => {
    const css = readGlobalCss();
    expect(css).toContain("--tint-route: var(--color-text-secondary)");
  });

  it("dark-mode block (data-theme) overrides all surface --color-* variables", () => {
    const css = readGlobalCss();

    // Grab the explicit data-theme="dark" block
    const darkMatch = css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/);
    expect(darkMatch, 'data-theme="dark" :root block must exist').not.toBeNull();
    const darkBlock = darkMatch![1];
    const darkVars = extractColorVarNames(darkBlock);

    const surfaceTokens = [
      "--color-bg-primary",
      "--color-bg-secondary",
      "--color-bg-tertiary",
      "--color-text-primary",
      "--color-text-secondary",
      "--color-accent",
      "--color-accent-muted",
      "--color-danger",
    ];

    for (const varName of surfaceTokens) {
      expect(darkVars.has(varName), `${varName} missing from data-theme="dark" block`).toBe(true);
    }
  });

  it("no legacy variable names remain in global.css", () => {
    const css = readGlobalCss();
    const forbidden = [
      "--color-bg:",
      "--color-surface:",
      "--color-text:",
      "--color-text-muted:",
      "--color-fg:",
      "--color-error:",
      "--color-user-bubble:",
      "--color-assistant-bubble:",
      "--color-badge:",
      "--color-badge-text:",
      "--color-primary:",
    ];
    for (const name of forbidden) {
      expect(css, `legacy token ${name} must not appear in global.css`).not.toContain(name);
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
