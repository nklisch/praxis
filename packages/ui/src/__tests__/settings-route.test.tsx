import type {
  ArtifactsClientSurface,
  AuthoringClient,
  EngineConfigSnapshot,
  MemoryClientService,
  PraxisClient,
  SessionService,
} from "@praxis/core/types";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { SettingsRoute } from "../routes/settings.js";

function makeFakeClient(configOverride?: Partial<EngineConfigSnapshot>): PraxisClient {
  const defaultConfig: EngineConfigSnapshot = {
    engineId: "direct.anthropic",
    ...configOverride,
  };

  return {
    session: {} as SessionService,
    artifacts: {} as ArtifactsClientSurface,
    author: {} as AuthoringClient,
    memory: {} as MemoryClientService,
    config: {
      isLocked: vi.fn().mockResolvedValue(false),
      setLockCode: vi.fn(),
      unlock: vi.fn(),
      selectedEngine: vi.fn().mockResolvedValue("direct.anthropic"),
      setSelectedEngine: vi.fn(),
      engineConfig: vi.fn().mockResolvedValue(defaultConfig),
      setEngineConfig: vi.fn().mockResolvedValue(undefined),
    },
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    // biome-ignore lint/suspicious/noExplicitAny: Phase 10 placeholder
    packs: {} as PraxisClient["packs"],
    notes: {} as PraxisClient["notes"],
    flashcards: {} as PraxisClient["flashcards"],
    claudeAuth: {} as PraxisClient["claudeAuth"],
    shell: {} as PraxisClient["shell"],
    tabs: {} as PraxisClient["tabs"],
  };
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
    const client = makeFakeClient();
    renderWithClient(client);

    await waitFor(() => {
      expect(client.config.engineConfig).toHaveBeenCalledOnce();
    });
  });

  it("renders the engine selector after loading", async () => {
    const client = makeFakeClient();
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
    const client = makeFakeClient();
    renderWithClient(client);

    await waitFor(() => {
      // The save button has type="submit"
      const buttons = screen.getAllByRole("button");
      const saveBtn = buttons.find((b) => b.textContent?.toLowerCase().includes("save"));
      expect(saveBtn).toBeDefined();
    });
  });

  it("shows loading text while config is pending", () => {
    const client = makeFakeClient();
    // Don't await — check initial render.
    renderWithClient(client);
    // COPY.loading.default = "loading…"
    expect(screen.getByText("loading…")).toBeDefined();
  });
});
