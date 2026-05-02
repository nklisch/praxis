import type { PraxisClient } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptFragmentEditor } from "../components/prompt-fragment-editor.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

function makeClient(authorOverrides?: Partial<PraxisClient["author"]>): PraxisClient {
  return makeFakeClient({
    author: {
      customizePrompt: vi.fn().mockResolvedValue(undefined),
      clearFragmentOverride: vi.fn().mockResolvedValue(undefined),
      createCourse: vi.fn(),
      editGate: vi.fn(),
      bootstrap: vi.fn(),
      updateCourse: vi.fn(),
      createLesson: vi.fn(),
      updateLesson: vi.fn(),
      deleteLesson: vi.fn(),
      createGate: vi.fn(),
      updateGate: vi.fn(),
      deleteGate: vi.fn(),
      overrideGate: vi.fn(),
      getCourseSummary: vi.fn(),
      setStyleSliders: vi.fn(),
      resetConcept: vi.fn(),
      clearMisconception: vi.fn(),
      exportMemory: vi.fn(),
      deleteAllMemory: vi.fn(),
      listConfiguratorActions: vi.fn(),
      ...authorOverrides,
    } as PraxisClient["author"],
  });
}

function renderEditor(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <PromptFragmentEditor />
    </PraxisClientProvider>,
  );
}

describe("PromptFragmentEditor", () => {
  it("renders the fragment selector", () => {
    const client = makeClient();
    renderEditor(client);
    // Should show a select with the fragment options
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThan(0);
  });

  it("calls customizePrompt on save", async () => {
    const client = makeClient();
    renderEditor(client);

    const textarea = screen.getByPlaceholderText(/Override/i);
    fireEvent.change(textarea, { target: { value: "Custom tutor role text" } });

    fireEvent.click(screen.getByRole("button", { name: /save override/i }));

    await waitFor(() => {
      expect(client.author.customizePrompt).toHaveBeenCalledWith(
        "teach",
        "role.tutor",
        "Custom tutor role text",
      );
    });
  });

  it("calls clearFragmentOverride on clear", async () => {
    const client = makeClient();
    renderEditor(client);

    fireEvent.click(screen.getByRole("button", { name: /clear override/i }));

    await waitFor(() => {
      expect(client.author.clearFragmentOverride).toHaveBeenCalledWith({
        modeId: "teach",
        fragmentId: "role.tutor",
      });
    });
  });
});
