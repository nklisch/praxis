import type { LockClient, PraxisClient } from "@praxis/core/types";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { ModeAppendEditor } from "../mode-append-editor.js";

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
  storedAppend?: string | null;
  previewResult?: string;
  lockClient?: LockClient;
  setModeAppend?: ReturnType<typeof vi.fn>;
  getModeAppend?: ReturnType<typeof vi.fn>;
}): PraxisClient {
  const {
    storedAppend = null,
    previewResult = "composed prompt text",
    lockClient = makeLockClient(),
    setModeAppend = vi.fn().mockResolvedValue(undefined),
    getModeAppend = vi.fn().mockResolvedValue(storedAppend),
  } = opts ?? {};

  return makeFakeClient({
    author: {
      getModeAppend,
      setModeAppend,
      previewPrompt: vi.fn().mockResolvedValue(previewResult),
      // Minimal stubs for the other required author methods
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
      getGlobalPrompt: vi.fn(),
      setGlobalPrompt: vi.fn(),
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
      <ModeAppendEditor />
    </PraxisClientProvider>,
  );
}

describe("ModeAppendEditor", () => {
  it("shows loading state initially then renders textarea", async () => {
    const client = makeClient();
    renderEditor(client);

    // After load, the textarea appears
    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /append text for teach mode/i }),
      ).toBeDefined();
    });
  });

  it("renders the mode selector dropdown defaulting to teach", async () => {
    const client = makeClient();
    renderEditor(client);

    await waitFor(() => {
      const select = screen.getByRole("combobox", {
        name: /select mode to edit/i,
      }) as HTMLSelectElement;
      expect(select.value).toBe("teach");
    });
  });

  it("populates textarea with stored append for the default mode on mount", async () => {
    const getModeAppend = vi.fn().mockResolvedValue("Be encouraging in teach mode.");
    const client = makeClient({ getModeAppend });
    renderEditor(client);

    await waitFor(() => {
      const textarea = screen.getByRole("textbox", {
        name: /append text for teach mode/i,
      }) as HTMLTextAreaElement;
      expect(textarea.value).toBe("Be encouraging in teach mode.");
    });

    expect(getModeAppend).toHaveBeenCalledWith("teach");
  });

  it("textarea is empty when no append is stored for the mode", async () => {
    const client = makeClient({ storedAppend: null });
    renderEditor(client);

    await waitFor(() => {
      const textarea = screen.getByRole("textbox", {
        name: /append text for teach mode/i,
      }) as HTMLTextAreaElement;
      expect(textarea.value).toBe("");
    });
  });

  it("fetches stored append for the newly selected mode on mode change", async () => {
    const getModeAppend = vi
      .fn()
      .mockResolvedValueOnce("teach text")
      .mockResolvedValueOnce("quiz text");
    const client = makeClient({ getModeAppend });
    renderEditor(client);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /append text for teach mode/i }),
      ).toBeDefined();
    });

    const select = screen.getByRole("combobox", { name: /select mode to edit/i });
    fireEvent.change(select, { target: { value: "quiz" } });

    await waitFor(() => {
      const textarea = screen.getByRole("textbox", {
        name: /append text for quiz mode/i,
      }) as HTMLTextAreaElement;
      expect(textarea.value).toBe("quiz text");
    });

    expect(getModeAppend).toHaveBeenCalledWith("quiz");
  });

  it("save button is disabled when draft equals stored value", async () => {
    const client = makeClient({ storedAppend: "original" });
    renderEditor(client);

    await waitFor(() => {
      const saveBtn = screen.getByRole("button", { name: /save/i });
      expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("save button enables when draft differs from stored", async () => {
    const client = makeClient({ storedAppend: "original" });
    renderEditor(client);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /append text for teach mode/i }),
      ).toBeDefined();
    });

    const textarea = screen.getByRole("textbox", { name: /append text for teach mode/i });
    fireEvent.change(textarea, { target: { value: "modified" } });

    const saveBtn = screen.getByRole("button", { name: /save/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("clicking save calls setModeAppend with the current mode and draft text", async () => {
    const setModeAppend = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({ storedAppend: "", setModeAppend });
    renderEditor(client);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /append text for teach mode/i }),
      ).toBeDefined();
    });

    const textarea = screen.getByRole("textbox", { name: /append text for teach mode/i });
    fireEvent.change(textarea, { target: { value: "Always be encouraging." } });

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(setModeAppend).toHaveBeenCalledWith({
      modeId: "teach",
      text: "Always be encouraging.",
    });
  });

  it("saving empty textarea calls setModeAppend with null to clear the row", async () => {
    const setModeAppend = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({ storedAppend: "some existing text", setModeAppend });
    renderEditor(client);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /append text for teach mode/i }),
      ).toBeDefined();
    });

    const textarea = screen.getByRole("textbox", { name: /append text for teach mode/i });
    fireEvent.change(textarea, { target: { value: "   " } });

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(setModeAppend).toHaveBeenCalledWith({ modeId: "teach", text: null });
  });

  it("shows saved indicator after successful save", async () => {
    const client = makeClient({ storedAppend: "" });
    renderEditor(client);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /append text for teach mode/i }),
      ).toBeDefined();
    });

    const textarea = screen.getByRole("textbox", { name: /append text for teach mode/i });
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
    const setModeAppend = vi.fn().mockRejectedValue(new Error("server error"));
    const client = makeClient({ storedAppend: "", setModeAppend });
    renderEditor(client);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /append text for teach mode/i }),
      ).toBeDefined();
    });

    const textarea = screen.getByRole("textbox", { name: /append text for teach mode/i });
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

  it("renders read-only textarea and lock hint when configurator is locked", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      isUnlocked: vi.fn().mockResolvedValue(false),
    });
    const client = makeClient({ lockClient });
    renderEditor(client);

    await waitFor(() => {
      const textarea = screen.getByRole("textbox", {
        name: /append text for teach mode/i,
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

  it("prompts to confirm discard when switching modes with unsaved edits", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const getModeAppend = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("quiz stored text");
    const client = makeClient({ getModeAppend });
    renderEditor(client);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /append text for teach mode/i }),
      ).toBeDefined();
    });

    // Make an unsaved edit
    const textarea = screen.getByRole("textbox", { name: /append text for teach mode/i });
    fireEvent.change(textarea, { target: { value: "unsaved draft" } });

    // Switch modes — should trigger confirm
    const select = screen.getByRole("combobox", { name: /select mode to edit/i });
    fireEvent.change(select, { target: { value: "quiz" } });

    expect(confirmSpy).toHaveBeenCalledWith(
      "You have unsaved changes. Discard and switch mode?",
    );

    // After confirming, the mode should switch
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /append text for quiz mode/i })).toBeDefined();
    });

    confirmSpy.mockRestore();
  });

  it("does not switch modes when user cancels the unsaved-changes confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const client = makeClient({ storedAppend: "" });
    renderEditor(client);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /append text for teach mode/i }),
      ).toBeDefined();
    });

    // Make an unsaved edit
    const textarea = screen.getByRole("textbox", { name: /append text for teach mode/i });
    fireEvent.change(textarea, { target: { value: "unsaved draft" } });

    // Switch modes — user cancels
    const select = screen.getByRole("combobox", { name: /select mode to edit/i });
    fireEvent.change(select, { target: { value: "quiz" } });

    // Mode should still be teach
    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /append text for teach mode/i }),
      ).toBeDefined();
    });

    confirmSpy.mockRestore();
  });

  it("calls previewPrompt to populate the preview pane", async () => {
    const previewPrompt = vi.fn().mockResolvedValue("composed system prompt for teach");
    const client = makeFakeClient({
      author: {
        getModeAppend: vi.fn().mockResolvedValue("custom append"),
        setModeAppend: vi.fn(),
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
        getGlobalPrompt: vi.fn(),
        setGlobalPrompt: vi.fn(),
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
      expect(screen.getByText("composed system prompt for teach")).toBeDefined();
    });
  });
});
