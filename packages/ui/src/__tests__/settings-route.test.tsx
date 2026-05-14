import type { EngineConfigSnapshot, LockClient, PraxisClient } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    hasApiKey: false,
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
      revealApiKey: vi.fn().mockResolvedValue({ apiKey: null }),
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

// ─── API key affordance ───────────────────────────────────────────────────────

describe("SettingsRoute — API key affordance", () => {
  it("renders 'Not configured' status and 'Add' button when hasApiKey=false", async () => {
    const client = makeSettingsClient({ hasApiKey: false });
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText("Not configured")).toBeDefined();
    });

    const addBtn = screen.getByRole("button", { name: "Add" });
    expect(addBtn).toBeDefined();
  });

  it("clicking 'Add' opens an empty password input (revealApiKey returns null → no prefill)", async () => {
    // revealApiKey returns { apiKey: null } for the "not configured" case;
    // the UI correctly shows an empty input regardless of whether it calls
    // revealApiKey — what matters is the input has no prefilled secret.
    const client = makeSettingsClient({ hasApiKey: false });
    // revealApiKey is already mocked to return { apiKey: null } via makeSettingsClient.
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    // The password input must appear with an empty value — no secret leaked.
    await waitFor(() => {
      const input = screen.getByPlaceholderText("sk-…") as HTMLInputElement;
      expect(input).toBeDefined();
      expect(input.value).toBe("");
    });
  });

  it("renders 'API key configured' status and 'Edit' button when hasApiKey=true", async () => {
    const client = makeSettingsClient({ hasApiKey: true });
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText("API key configured")).toBeDefined();
    });

    const editBtn = screen.getByRole("button", { name: "Edit" });
    expect(editBtn).toBeDefined();
    // 'Add' must not appear when a key is already configured.
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });

  it("clicking 'Edit' calls revealApiKey() and prefills the input with the returned key", async () => {
    const client = makeFakeClient({
      config: {
        isLocked: vi.fn().mockResolvedValue(false),
        setLockCode: vi.fn(),
        unlock: vi.fn(),
        selectedEngine: vi.fn().mockResolvedValue("direct.anthropic"),
        setSelectedEngine: vi.fn(),
        engineConfig: vi.fn().mockResolvedValue({
          engineId: "direct.anthropic",
          hasApiKey: true,
        } satisfies EngineConfigSnapshot),
        revealApiKey: vi.fn().mockResolvedValue({ apiKey: "sk-existing" }),
        setEngineConfig: vi.fn().mockResolvedValue(undefined),
      } as PraxisClient["config"],
    });

    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Edit" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => {
      expect(client.config.revealApiKey).toHaveBeenCalledOnce();
    });

    // Input prefilled with the decrypted value.
    await waitFor(() => {
      const input = screen.getByPlaceholderText("sk-…") as HTMLInputElement;
      expect(input.value).toBe("sk-existing");
    });
  });

  it("Save submits updated apiKey and refetches snapshot (hasApiKey updates)", async () => {
    // After save, engineConfig() is called a second time and returns hasApiKey:true.
    const engineConfigFn = vi
      .fn()
      .mockResolvedValueOnce({
        engineId: "direct.anthropic",
        hasApiKey: false,
      } satisfies EngineConfigSnapshot)
      .mockResolvedValueOnce({
        engineId: "direct.anthropic",
        hasApiKey: true,
      } satisfies EngineConfigSnapshot);

    const setEngineConfigFn = vi.fn().mockResolvedValue(undefined);

    const client = makeFakeClient({
      config: {
        isLocked: vi.fn().mockResolvedValue(false),
        setLockCode: vi.fn(),
        unlock: vi.fn(),
        selectedEngine: vi.fn().mockResolvedValue("direct.anthropic"),
        setSelectedEngine: vi.fn(),
        engineConfig: engineConfigFn,
        revealApiKey: vi.fn().mockResolvedValue({ apiKey: null }),
        setEngineConfig: setEngineConfigFn,
      } as PraxisClient["config"],
    });

    renderWithClient(client);

    // Wait for first load.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
    });

    // Open the edit affordance.
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("sk-…")).toBeDefined();
    });

    // Type a new key.
    fireEvent.change(screen.getByPlaceholderText("sk-…"), {
      target: { value: "sk-brand-new" },
    });

    // Submit the form.
    const saveBtn = screen.getByRole("button", { name: "Save" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(setEngineConfigFn).toHaveBeenCalledOnce();
    });

    // setEngineConfig called with the edited apiKey.
    const callArg = setEngineConfigFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg.apiKey).toBe("sk-brand-new");

    // engineConfig() called a second time to refetch.
    await waitFor(() => {
      expect(engineConfigFn).toHaveBeenCalledTimes(2);
    });

    // UI now shows "API key configured".
    await waitFor(() => {
      expect(screen.getByText("API key configured")).toBeDefined();
    });
  });
});
