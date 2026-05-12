import type { LockClient, PraxisClient } from "@praxis/core/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { PromptTab } from "../routes/configure/prompt-tab.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

function makeLockClient(overrides?: Partial<LockClient>): LockClient {
  return {
    isSet: vi.fn().mockResolvedValue(false),
    isUnlocked: vi.fn().mockResolvedValue(true),
    setLockCode: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue({ ok: true }),
    lock: vi.fn().mockResolvedValue(undefined),
    clearLock: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeClient(lockClient: LockClient = makeLockClient()): PraxisClient {
  return makeFakeClient({
    author: {
      getModeAppend: vi.fn().mockResolvedValue(null),
      setModeAppend: vi.fn().mockResolvedValue(undefined),
      previewPrompt: vi.fn().mockResolvedValue("composed prompt"),
      getGlobalPrompt: vi.fn(),
      setGlobalPrompt: vi.fn(),
      customizePrompt: vi.fn(),
      clearFragmentOverride: vi.fn(),
      setStyleSliders: vi.fn().mockResolvedValue(undefined),
      createCourse: vi.fn(),
      updateCourse: vi.fn(),
      editGate: vi.fn(),
      bootstrap: vi.fn(),
      createLesson: vi.fn(),
      updateLesson: vi.fn(),
      deleteLesson: vi.fn(),
      createGate: vi.fn(),
      updateGate: vi.fn(),
      deleteGate: vi.fn(),
      overrideGate: vi.fn(),
      getCourseSummary: vi.fn(),
      resetConcept: vi.fn(),
      clearMisconception: vi.fn(),
      exportMemory: vi.fn(),
      deleteAllMemory: vi.fn(),
      listConfiguratorActions: vi.fn(),
    } as PraxisClient["author"],
    lock: lockClient,
  });
}

function renderTab(client: PraxisClient = makeClient()) {
  return render(
    <PraxisClientProvider client={client}>
      <PromptTab />
    </PraxisClientProvider>,
  );
}

describe("PromptTab", () => {
  it("renders the Per-mode append section heading", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText("Per-mode append")).toBeDefined();
    });
  });

  it("renders the intro copy for the Per-mode append section", async () => {
    renderTab();
    await waitFor(() => {
      expect(
        screen.getByText(/Add text to the end of a specific mode/i),
      ).toBeDefined();
    });
  });

  it("renders the Teaching Style section", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText("Teaching Style")).toBeDefined();
    });
  });

  it("renders the Advanced framing copy above the fragment editor", async () => {
    renderTab();
    await waitFor(() => {
      expect(
        screen.getByText(/Advanced: replace specific framework fragments wholesale/i),
      ).toBeDefined();
    });
  });

  it("renders sections in correct order: Per-mode append → Teaching Style → Prompt Fragment Overrides", async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText("Per-mode append")).toBeDefined();
      expect(screen.getByText("Teaching Style")).toBeDefined();
      expect(screen.getByText("Prompt Fragment Overrides")).toBeDefined();
    });

    // Use DOM order to verify Per-mode append comes before Teaching Style,
    // and Teaching Style comes before Prompt Fragment Overrides.
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((el) => el.textContent ?? "");

    const perModeIdx = headings.indexOf("Per-mode append");
    const styleIdx = headings.indexOf("Teaching Style");
    const fragmentIdx = headings.indexOf("Prompt Fragment Overrides");

    expect(perModeIdx).toBeGreaterThanOrEqual(0);
    expect(styleIdx).toBeGreaterThanOrEqual(0);
    expect(fragmentIdx).toBeGreaterThanOrEqual(0);
    expect(perModeIdx).toBeLessThan(styleIdx);
    expect(styleIdx).toBeLessThan(fragmentIdx);
  });

  it("still renders the style sliders (no regression)", async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText("Guidance style")).toBeDefined();
      expect(screen.getByText("Verbosity")).toBeDefined();
      expect(screen.getByText("Tone")).toBeDefined();
    });
  });

  it("still renders the fragment editor (no regression)", async () => {
    renderTab();

    await waitFor(() => {
      // PromptFragmentEditor renders a combobox for fragment selection
      const selects = screen.getAllByRole("combobox");
      expect(selects.length).toBeGreaterThan(0);
    });
  });
});
