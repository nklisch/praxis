import type { EngineConfigSnapshot, LockClient, PraxisClient } from "@praxis/core/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { SettingsRoute } from "../routes/settings.js";
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

function makeSettingsClient(configOverride?: Partial<EngineConfigSnapshot>): PraxisClient {
  const defaultConfig: EngineConfigSnapshot = {
    engineId: "direct.anthropic",
    ...configOverride,
  };

  return makeFakeClient({
    config: {
      isLocked: vi.fn().mockResolvedValue(false),
      setLockCode: vi.fn(),
      unlock: vi.fn(),
      selectedEngine: vi.fn().mockResolvedValue("direct.anthropic"),
      setSelectedEngine: vi.fn(),
      engineConfig: vi.fn().mockResolvedValue(defaultConfig),
      setEngineConfig: vi.fn().mockResolvedValue(undefined),
    },
    author: {
      getGlobalPrompt: vi.fn().mockResolvedValue(null),
      setGlobalPrompt: vi.fn().mockResolvedValue(undefined),
      previewPrompt: vi.fn().mockResolvedValue("preview text"),
      createCourse: vi.fn(),
      editGate: vi.fn(),
      bootstrap: vi.fn(),
      customizePrompt: vi.fn(),
      updateCourse: vi.fn(),
      createLesson: vi.fn(),
      updateLesson: vi.fn(),
      deleteLesson: vi.fn(),
      createGate: vi.fn(),
      updateGate: vi.fn(),
      deleteGate: vi.fn(),
      overrideGate: vi.fn(),
      getCourseSummary: vi.fn(),
      clearFragmentOverride: vi.fn(),
      setStyleSliders: vi.fn(),
      setModeAppend: vi.fn(),
      getModeAppend: vi.fn(),
      resetConcept: vi.fn(),
      clearMisconception: vi.fn(),
      exportMemory: vi.fn(),
      deleteAllMemory: vi.fn(),
      listConfiguratorActions: vi.fn(),
    } as PraxisClient["author"],
    lock: makeLockClient(),
  });
}

function renderWithClient(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <SettingsRoute />
    </PraxisClientProvider>,
  );
}

describe("SettingsRoute", () => {
  it("loads engine config on mount", async () => {
    const client = makeSettingsClient();
    renderWithClient(client);

    await waitFor(() => {
      expect(client.config.engineConfig).toHaveBeenCalledOnce();
    });
  });

  it("renders the engine selector after loading", async () => {
    const client = makeSettingsClient();
    renderWithClient(client);

    await waitFor(() => {
      // RouteHeader renders the kicker "SETTINGS"
      expect(screen.getByText("SETTINGS")).toBeDefined();
    });

    // There are multiple selects (Engine + Effort). Get all comboboxes.
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects.length).toBeGreaterThan(0);
    // The first select is the Engine selector.
    expect(selects[0]?.value).toBe("direct.anthropic");
  });

  it("renders Save button", async () => {
    const client = makeSettingsClient();
    renderWithClient(client);

    await waitFor(() => {
      // The save button has type="submit"
      const buttons = screen.getAllByRole("button");
      const saveBtn = buttons.find((b) => b.textContent?.toLowerCase().includes("save"));
      expect(saveBtn).toBeDefined();
    });
  });

  it("shows loading text while config is pending", () => {
    const client = makeSettingsClient();
    // Don't await — check initial render.
    renderWithClient(client);
    // COPY.loading.default = "loading…"
    expect(screen.getByText("loading…")).toBeDefined();
  });

  it("does not render the GlobalPromptEditor (moved to Configure prompt tab)", async () => {
    const client = makeSettingsClient();
    renderWithClient(client);

    // Wait for the config to load so we're not racing the loading state.
    await waitFor(() => {
      expect(screen.getByText("SETTINGS")).toBeDefined();
    });

    // The "Global prompt" heading and its textarea should NOT be present in Settings.
    const globalHeading = screen.queryByText("Global prompt");
    expect(globalHeading).toBeNull();
  });
});
