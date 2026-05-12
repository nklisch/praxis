import type { LockClient, PraxisClient } from "@praxis/core/types";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { GlobalPromptEditor } from "../global-prompt-editor.js";

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

function makeClient(opts?: {
  storedPrompt?: string | null;
  previewResult?: string;
  lockClient?: LockClient;
  setGlobalPrompt?: ReturnType<typeof vi.fn>;
}): PraxisClient {
  const {
    storedPrompt = null,
    previewResult = "composed prompt text",
    lockClient = makeLockClient(),
    setGlobalPrompt = vi.fn().mockResolvedValue(undefined),
  } = opts ?? {};

  return makeFakeClient({
    author: {
      getGlobalPrompt: vi.fn().mockResolvedValue(storedPrompt),
      setGlobalPrompt,
      previewPrompt: vi.fn().mockResolvedValue(previewResult),
      // Fill in other required author methods minimally
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
    lock: lockClient,
  });
}

function renderEditor(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <GlobalPromptEditor />
    </PraxisClientProvider>,
  );
}

describe("GlobalPromptEditor", () => {
  it("shows loading state initially then renders textarea", async () => {
    const client = makeClient();
    renderEditor(client);

    // Initially loading
    expect(screen.getByText("loading…")).toBeDefined();

    // After load, the textarea appears
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /global prompt text/i })).toBeDefined();
    });
  });

  it("populates textarea with stored global prompt on mount", async () => {
    const client = makeClient({ storedPrompt: "Be patient with students." });
    renderEditor(client);

    await waitFor(() => {
      const textarea = screen.getByRole("textbox", {
        name: /global prompt text/i,
      }) as HTMLTextAreaElement;
      expect(textarea.value).toBe("Be patient with students.");
    });
  });

  it("textarea is empty when no global prompt is stored", async () => {
    const client = makeClient({ storedPrompt: null });
    renderEditor(client);

    await waitFor(() => {
      const textarea = screen.getByRole("textbox", {
        name: /global prompt text/i,
      }) as HTMLTextAreaElement;
      expect(textarea.value).toBe("");
    });
  });

  it("save button is disabled when draft equals stored value", async () => {
    const client = makeClient({ storedPrompt: "original" });
    renderEditor(client);

    await waitFor(() => {
      const saveBtn = screen.getByRole("button", { name: /save/i });
      expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("save button enables when draft differs from stored", async () => {
    const client = makeClient({ storedPrompt: "original" });
    renderEditor(client);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /global prompt text/i })).toBeDefined();
    });

    const textarea = screen.getByRole("textbox", { name: /global prompt text/i });
    fireEvent.change(textarea, { target: { value: "modified" } });

    const saveBtn = screen.getByRole("button", { name: /save/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("clicking save calls setGlobalPrompt with the draft text", async () => {
    const setGlobalPrompt = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({ storedPrompt: "", setGlobalPrompt });
    renderEditor(client);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /global prompt text/i })).toBeDefined();
    });

    const textarea = screen.getByRole("textbox", { name: /global prompt text/i });
    fireEvent.change(textarea, { target: { value: "Encourage curiosity." } });

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(setGlobalPrompt).toHaveBeenCalledWith("Encourage curiosity.");
  });

  it("saving empty textarea calls setGlobalPrompt(null) to clear the row", async () => {
    const setGlobalPrompt = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({ storedPrompt: "some existing text", setGlobalPrompt });
    renderEditor(client);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /global prompt text/i })).toBeDefined();
    });

    const textarea = screen.getByRole("textbox", { name: /global prompt text/i });
    fireEvent.change(textarea, { target: { value: "   " } });

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(setGlobalPrompt).toHaveBeenCalledWith(null);
  });

  it("shows saved indicator after successful save", async () => {
    const client = makeClient({ storedPrompt: "" });
    renderEditor(client);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /global prompt text/i })).toBeDefined();
    });

    const textarea = screen.getByRole("textbox", { name: /global prompt text/i });
    fireEvent.change(textarea, { target: { value: "new instruction" } });

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/saved ·/i)).toBeDefined();
    });
  });

  it("shows inline error when save fails", async () => {
    const setGlobalPrompt = vi.fn().mockRejectedValue(new Error("server error"));
    const client = makeClient({ storedPrompt: "", setGlobalPrompt });
    renderEditor(client);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /global prompt text/i })).toBeDefined();
    });

    const textarea = screen.getByRole("textbox", { name: /global prompt text/i });
    fireEvent.change(textarea, { target: { value: "something" } });

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByText(/server error/i)).toBeDefined();
    });
  });

  it("renders the mode selector dropdown", async () => {
    const client = makeClient();
    renderEditor(client);

    await waitFor(() => {
      // The preview pane's mode selector
      expect(screen.getByRole("combobox")).toBeDefined();
    });
  });

  it("renders read-only textarea and lock hint when configurator is locked", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      isUnlocked: vi.fn().mockResolvedValue(false),
    });
    const client = makeClient({ lockClient });
    renderEditor(client);

    await waitFor(() => {
      const textarea = screen.getByRole("textbox", {
        name: /global prompt text/i,
      }) as HTMLTextAreaElement;
      expect(textarea.readOnly).toBe(true);
    });

    // Lock hint should be present
    expect(screen.getByRole("note")).toBeDefined();
    expect(screen.getByText(/unlock/i)).toBeDefined();
  });

  it("hides the save button when configurator is locked", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      isUnlocked: vi.fn().mockResolvedValue(false),
    });
    const client = makeClient({ lockClient });
    renderEditor(client);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    });
  });

  it("calls previewPrompt on mount to populate the preview pane", async () => {
    const previewPrompt = vi.fn().mockResolvedValue("composed system prompt");
    const client = makeFakeClient({
      author: {
        getGlobalPrompt: vi.fn().mockResolvedValue("custom text"),
        setGlobalPrompt: vi.fn(),
        previewPrompt,
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

    renderEditor(client);

    await waitFor(() => {
      expect(previewPrompt).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("composed system prompt")).toBeDefined();
    });
  });
});
