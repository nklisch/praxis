import type { LockClient, PraxisClient } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      getGlobalPrompt: vi.fn().mockResolvedValue(null),
      setGlobalPrompt: vi.fn().mockResolvedValue(undefined),
      customizePrompt: vi.fn().mockResolvedValue(undefined),
      clearFragmentOverride: vi.fn().mockResolvedValue(undefined),
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

describe("PromptTab — unified prompt customization surface", () => {
  // ── Structural rendering ───────────────────────────────────────────────

  it("renders the Global Fragment section heading", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText("Global Fragment")).toBeDefined();
    });
  });

  it("renders the mode picker with label", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByLabelText("Mode")).toBeDefined();
    });
  });

  it("renders the Prompt Fragments section heading", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText("Prompt Fragments")).toBeDefined();
    });
  });

  it("renders the Composed Preview section heading", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText("Composed Preview")).toBeDefined();
    });
  });

  it("renders the Teaching Style section heading", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText("Teaching Style")).toBeDefined();
    });
  });

  it("renders sections in correct order: Global → mode picker → Fragments → Preview → Style", async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText("Global Fragment")).toBeDefined();
      expect(screen.getByText("Prompt Fragments")).toBeDefined();
      expect(screen.getByText("Composed Preview")).toBeDefined();
      expect(screen.getByText("Teaching Style")).toBeDefined();
    });

    const headings = screen.getAllByRole("heading", { level: 2 }).map((el) => el.textContent ?? "");

    const globalIdx = headings.indexOf("Global Fragment");
    const fragmentIdx = headings.indexOf("Prompt Fragments");
    const previewIdx = headings.indexOf("Composed Preview");
    const styleIdx = headings.indexOf("Teaching Style");

    expect(globalIdx).toBeGreaterThanOrEqual(0);
    expect(fragmentIdx).toBeGreaterThanOrEqual(0);
    expect(previewIdx).toBeGreaterThanOrEqual(0);
    expect(styleIdx).toBeGreaterThanOrEqual(0);

    // Global comes first, then fragments, then preview, then style sliders.
    expect(globalIdx).toBeLessThan(fragmentIdx);
    expect(fragmentIdx).toBeLessThan(previewIdx);
    expect(previewIdx).toBeLessThan(styleIdx);
  });

  // ── Style sliders (no regression) ──────────────────────────────────────

  it("still renders the style sliders (no regression)", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText("Guidance style")).toBeDefined();
      expect(screen.getByText("Verbosity")).toBeDefined();
      expect(screen.getByText("Tone")).toBeDefined();
    });
  });

  // ── Mode picker ─────────────────────────────────────────────────────────

  it("mode picker defaults to teach", async () => {
    renderTab();
    await waitFor(() => {
      const picker = screen.getByRole("combobox", { name: "Mode" }) as HTMLSelectElement;
      expect(picker.value).toBe("teach");
    });
  });

  it("mode picker lists all registered modes", async () => {
    renderTab();
    await waitFor(() => {
      const picker = screen.getByRole("combobox", { name: "Mode" }) as HTMLSelectElement;
      const options = Array.from(picker.options).map((o) => o.value);
      // All modes from curriculum registry should be present.
      expect(options).toContain("teach");
      expect(options).toContain("quiz");
      expect(options).toContain("homework");
      expect(options).toContain("exam");
      expect(options).toContain("bootstrap");
      expect(options).toContain("study-skills");
    });
  });

  it("mode picker change updates the selected value", async () => {
    renderTab();
    await waitFor(() => {
      const picker = screen.getByRole("combobox", { name: "Mode" }) as HTMLSelectElement;
      expect(picker.value).toBe("teach");
    });

    const picker = screen.getByRole("combobox", { name: "Mode" }) as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: "quiz" } });

    await waitFor(() => {
      expect((screen.getByRole("combobox", { name: "Mode" }) as HTMLSelectElement).value).toBe(
        "quiz",
      );
    });
  });

  // ── Preview toggle ───────────────────────────────────────────────────────

  it("renders the Composed toggle button", async () => {
    renderTab();
    await waitFor(() => {
      const composedBtn = screen.getByRole("tab", { name: "Composed" });
      expect(composedBtn).toBeDefined();
    });
  });

  it("renders the Diff toggle button as disabled", async () => {
    renderTab();
    await waitFor(() => {
      const diffBtn = screen.getByRole("tab", { name: "Diff" }) as HTMLButtonElement;
      expect(diffBtn.disabled).toBe(true);
    });
  });

  it("Diff toggle has a tooltip explaining it is coming soon", async () => {
    renderTab();
    await waitFor(() => {
      const diffBtn = screen.getByRole("tab", { name: "Diff" });
      expect(diffBtn.getAttribute("title")).toBeTruthy();
    });
  });

  // ── IPC: global prompt ───────────────────────────────────────────────────

  it("loads the global prompt on mount", async () => {
    const client = makeClient();
    renderTab(client);
    await waitFor(() => {
      expect(client.author.getGlobalPrompt).toHaveBeenCalled();
    });
  });

  // ── IPC: mode append ─────────────────────────────────────────────────────

  it("loads the mode append for the default mode on mount", async () => {
    const client = makeClient();
    renderTab(client);
    await waitFor(() => {
      expect(client.author.getModeAppend).toHaveBeenCalledWith("teach");
    });
  });

  // ── IPC: preview ─────────────────────────────────────────────────────────

  it("calls previewPrompt for the default mode", async () => {
    const client = makeClient();
    renderTab(client);
    await waitFor(() => {
      expect(client.author.previewPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ modeId: "teach" }),
      );
    });
  });

  // ── Style slider IPC ──────────────────────────────────────────────────────

  it("renders the style save button", async () => {
    renderTab();
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /save style/i });
      expect(btn).toBeDefined();
    });
  });
});
