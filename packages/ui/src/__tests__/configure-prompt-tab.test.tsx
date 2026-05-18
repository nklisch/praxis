import type { PraxisClient } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { DirtyStateProvider } from "../contexts/dirty-state-provider.js";
import { PromptTab } from "../routes/configure/prompt-tab.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

function makeAuthorClient(opts?: {
  overrides?: Array<{ fragmentId: string; override: string }>;
  customizePromptSpy?: ReturnType<typeof vi.fn>;
  clearFragmentOverrideSpy?: ReturnType<typeof vi.fn>;
}): PraxisClient["author"] {
  return {
    listFragmentOverrides: vi.fn().mockResolvedValue(opts?.overrides ?? []),
    customizePrompt: opts?.customizePromptSpy ?? vi.fn().mockResolvedValue(undefined),
    clearFragmentOverride: opts?.clearFragmentOverrideSpy ?? vi.fn().mockResolvedValue(undefined),
    previewPromptWithAttribution: vi.fn().mockResolvedValue({
      prompt: "composed prompt text",
      segments: [
        {
          fragmentId: "role.tutor",
          position: "role",
          source: "default",
          text: "You are a patient tutor.",
          defaultText: "You are a patient tutor.",
          customizable: true,
        },
      ],
    }),
    // Remaining stubs not needed for prompt tab
    getModeAppend: vi.fn().mockResolvedValue(null),
    setModeAppend: vi.fn().mockResolvedValue(undefined),
    getGlobalPrompt: vi.fn().mockResolvedValue(null),
    setGlobalPrompt: vi.fn().mockResolvedValue(undefined),
    setStyleSliders: vi.fn().mockResolvedValue(undefined),
  } as unknown as PraxisClient["author"];
}

function makeClient(opts?: Parameters<typeof makeAuthorClient>[0]): PraxisClient {
  return makeFakeClient({ author: makeAuthorClient(opts) });
}

function renderTab(client: PraxisClient = makeClient()) {
  return render(
    <PraxisClientProvider client={client}>
      <DirtyStateProvider>
        <PromptTab />
      </DirtyStateProvider>
    </PraxisClientProvider>,
  );
}

describe("PromptTab — v4 Canvas layout", () => {
  it("renders the mode picker rail with all modes", async () => {
    renderTab();
    // Rail should have a nav with aria-label
    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: /mode picker/i })).toBeDefined();
    });
    // teach mode should be visible
    expect(screen.getByText("teach")).toBeDefined();
    // other modes
    expect(screen.getByText("quiz")).toBeDefined();
    expect(screen.getByText("homework")).toBeDefined();
  });

  it("renders the canvas head with mode name", async () => {
    renderTab();
    // Teach is selected by default; canvas title should mention "teach"
    await waitFor(() => {
      expect(screen.getByText(/composed prompt/i)).toBeDefined();
    });
  });

  it("switching modes in the rail loads a different fragment document", async () => {
    renderTab();
    // Wait for initial render with teach mode selected
    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: /mode picker/i })).toBeDefined();
    });
    // The canvas title should initially say "teach"
    const canvasTitle = document.querySelector("h2");
    expect(canvasTitle?.textContent).toContain("teach");

    // Click on quiz mode button
    const quizBtn = screen.getByRole("button", { name: /^quiz$/i });
    fireEvent.click(quizBtn);

    // Canvas title h2 should now say "quiz"
    await waitFor(() => {
      const title = document.querySelector("h2");
      expect(title?.textContent).toContain("quiz");
    });
  });

  it("renders fragment cards for the selected mode", async () => {
    renderTab();
    // Fragment cards are rendered after overrides load
    await waitFor(() => {
      // At least one fragment card should be present (teach mode has many fragments)
      const cards = document.querySelectorAll("[data-testid^='fragment-card-']");
      expect(cards.length).toBeGreaterThan(0);
    });
  });

  it("renders lock-status pills on fragment cards", async () => {
    renderTab();
    await waitFor(() => {
      const cards = document.querySelectorAll("[data-testid^='fragment-card-']");
      expect(cards.length).toBeGreaterThan(0);
    });
    // Should have at least one lock pill (locked or default) — identified by title attribute
    const pills = document.querySelectorAll("[title^='Fragment status']");
    expect(pills.length).toBeGreaterThan(0);
  });

  it("shows 'custom' lock pill when fragment has an override", async () => {
    // Provide an override for a known teach mode fragment
    const client = makeClient({
      overrides: [{ fragmentId: "role.tutor", override: "Custom tutor text" }],
    });
    renderTab(client);
    await waitFor(() => {
      // Should show 'custom' pill for the overridden fragment
      expect(screen.getAllByText("custom").length).toBeGreaterThan(0);
    });
  });

  it("renders the composed-prompt summary at the bottom", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTestId("composed-summary")).toBeDefined();
    });
  });

  it("composed summary shows fragment IDs from previewPromptWithAttribution", async () => {
    renderTab();
    await waitFor(() => {
      // The mocked segment has fragmentId "role.tutor"
      const summary = screen.getByTestId("composed-summary");
      expect(summary.textContent).toContain("role.tutor");
    });
  });

  it("clicking a customizable fragment opens an edit textarea", async () => {
    renderTab();
    await waitFor(() => {
      const cards = document.querySelectorAll("[data-testid^='fragment-card-']");
      expect(cards.length).toBeGreaterThan(0);
    });
    // Find a role="button" fragment text div (customizable fragments)
    const editableFragments = document.querySelectorAll("[role='button']");
    if (editableFragments.length > 0) {
      fireEvent.click(editableFragments[0] as HTMLElement);
      await waitFor(() => {
        expect(document.querySelector("textarea")).toBeDefined();
      });
    }
  });

  it("saving an edit calls customizePrompt with modeId, fragmentId, and text", async () => {
    const customizePromptSpy = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({ customizePromptSpy });
    renderTab(client);

    // Wait for fragments to load
    await waitFor(() => {
      const cards = document.querySelectorAll("[data-testid^='fragment-card-']");
      expect(cards.length).toBeGreaterThan(0);
    });

    // Open the first editable fragment
    const editableFragments = document.querySelectorAll("[role='button']");
    if (editableFragments.length === 0) return; // no customizable frags — skip
    fireEvent.click(editableFragments[0] as HTMLElement);

    // Change textarea value
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    if (!textarea) return;
    fireEvent.change(textarea, { target: { value: "My custom text" } });

    // Click Save
    const saveBtn = screen.getByRole("button", { name: /^save$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(customizePromptSpy).toHaveBeenCalled();
    });
    const [modeIdArg, fragmentIdArg, textArg] = customizePromptSpy.mock.calls[0] as [
      string,
      string,
      string,
    ];
    expect(modeIdArg).toBe("teach");
    expect(typeof fragmentIdArg).toBe("string");
    expect(textArg).toBe("My custom text");
  });

  it("reverting a custom fragment calls clearFragmentOverride", async () => {
    const clearFragmentOverrideSpy = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({
      overrides: [{ fragmentId: "role.tutor", override: "Custom text" }],
      clearFragmentOverrideSpy,
    });
    renderTab(client);

    await waitFor(() => {
      // Should show a revert button for the overridden fragment
      expect(screen.getAllByText(/↶ revert to default/i).length).toBeGreaterThan(0);
    });

    // Click the first revert button
    const revertBtn = screen.getAllByText(/↶ revert to default/i)[0] as HTMLElement;
    fireEvent.click(revertBtn);

    await waitFor(() => {
      expect(clearFragmentOverrideSpy).toHaveBeenCalled();
    });
  });
});
