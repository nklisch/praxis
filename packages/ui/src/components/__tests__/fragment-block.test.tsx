import type { LockClient, PraxisClient, PromptFragment } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { FragmentBlock } from "../fragment-block.js";

afterEach(() => cleanup());

// ── Test fixtures ────────────────────────────────────────────────────────────

const customizableFragment: PromptFragment = {
  id: "role.tutor",
  position: "role",
  customizable: true,
  template: "You are a patient tutor.",
};

const lockedFragment: PromptFragment = {
  id: "preamble.default",
  position: "preamble",
  customizable: false,
  template: "This is the preamble text.",
};

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
  lockClient?: LockClient;
  customizePrompt?: ReturnType<typeof vi.fn>;
  clearFragmentOverride?: ReturnType<typeof vi.fn>;
}): PraxisClient {
  const {
    lockClient = makeLockClient(),
    customizePrompt = vi.fn().mockResolvedValue(undefined),
    clearFragmentOverride = vi.fn().mockResolvedValue(undefined),
  } = opts ?? {};
  return makeFakeClient({
    author: {
      customizePrompt,
      clearFragmentOverride,
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
      listFragmentOverrides: vi.fn().mockResolvedValue([]),
    } as PraxisClient["author"],
    lock: lockClient,
  });
}

interface RenderBlockOpts {
  fragment?: PromptFragment;
  override?: string | null;
  onOverrideChange?: ReturnType<typeof vi.fn>;
  client?: PraxisClient;
}

function renderBlock({
  fragment = customizableFragment,
  override = null,
  onOverrideChange = vi.fn(),
  client = makeClient(),
}: RenderBlockOpts = {}) {
  return render(
    <PraxisClientProvider client={client}>
      <FragmentBlock
        modeId="teach"
        fragment={fragment}
        override={override}
        onOverrideChange={onOverrideChange}
      />
    </PraxisClientProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("FragmentBlock — customizable + unlocked", () => {
  it("renders a textarea when customizable and lock is off", async () => {
    renderBlock({ fragment: customizableFragment });
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeDefined();
    });
  });

  it("textarea is pre-filled with override text when override is set", async () => {
    renderBlock({ fragment: customizableFragment, override: "custom text" });
    await waitFor(() => {
      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(ta.value).toBe("custom text");
    });
  });

  it("textarea is pre-filled with template when no override", async () => {
    renderBlock({ fragment: customizableFragment, override: null });
    await waitFor(() => {
      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(ta.value).toBe(customizableFragment.template);
    });
  });

  it("Save button starts disabled (no dirty state)", async () => {
    renderBlock({ fragment: customizableFragment });
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  it("editing the textarea enables the Save button", async () => {
    renderBlock({ fragment: customizableFragment });
    await waitFor(() => screen.getByRole("textbox"));
    const ta = screen.getByRole("textbox");
    fireEvent.change(ta, { target: { value: "new text" } });
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });

  it("clicking Save calls customizePrompt with the draft text", async () => {
    const customizePrompt = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({ customizePrompt });
    const onOverrideChange = vi.fn();
    renderBlock({ client, fragment: customizableFragment, onOverrideChange });

    await waitFor(() => screen.getByRole("textbox"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "updated role text" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(customizePrompt).toHaveBeenCalledWith("teach", "role.tutor", "updated role text");
      expect(onOverrideChange).toHaveBeenCalled();
    });
  });

  it("Cancel button appears when dirty and restores original text on click", async () => {
    renderBlock({ fragment: customizableFragment, override: "original" });
    await waitFor(() => screen.getByRole("textbox"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "changed" } });
    await waitFor(() => screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(ta.value).toBe("original");
    });
  });
});

describe("FragmentBlock — customizable + configurator lock ON", () => {
  function makeLockedClient() {
    return makeClient({
      lockClient: makeLockClient({
        isSet: vi.fn().mockResolvedValue(true),
        isUnlocked: vi.fn().mockResolvedValue(false),
      }),
    });
  }

  it("renders a read-only pre, not a textarea", async () => {
    const client = makeLockedClient();
    renderBlock({ fragment: customizableFragment, client });
    await waitFor(() => {
      expect(screen.queryByRole("textbox")).toBeNull();
    });
  });

  it("shows the lock hint text", async () => {
    const client = makeLockedClient();
    renderBlock({ fragment: customizableFragment, client });
    await waitFor(() => {
      expect(screen.getByText("Configurator lock is on — unlock to edit.")).toBeDefined();
    });
  });

  it("does not show a Save button", async () => {
    const client = makeLockedClient();
    renderBlock({ fragment: customizableFragment, client });
    await waitFor(() => {
      // Wait for lock state to load by checking for lock hint.
      screen.getByText("Configurator lock is on — unlock to edit.");
    });
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});

describe("FragmentBlock — non-customizable (locked fragment)", () => {
  it("renders a read-only pre with the template text", async () => {
    renderBlock({ fragment: lockedFragment });
    await waitFor(() => {
      expect(screen.getByText(lockedFragment.template)).toBeDefined();
      expect(screen.queryByRole("textbox")).toBeNull();
    });
  });

  it("shows the Locked badge", async () => {
    renderBlock({ fragment: lockedFragment });
    await waitFor(() => {
      expect(screen.getByText("Locked")).toBeDefined();
    });
  });

  it("does not show a Diff button (nothing to diff)", async () => {
    renderBlock({ fragment: lockedFragment });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /diff/i })).toBeNull();
    });
  });

  it("does not show a Save button", async () => {
    renderBlock({ fragment: lockedFragment });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    });
  });
});

describe("FragmentBlock — Edited badge", () => {
  it("shows the Edited badge when override is non-null", async () => {
    renderBlock({ fragment: customizableFragment, override: "some override" });
    await waitFor(() => {
      expect(screen.getByText("Edited")).toBeDefined();
    });
  });

  it("does not show the Edited badge when override is null", async () => {
    renderBlock({ fragment: customizableFragment, override: null });
    await waitFor(() => {
      expect(screen.queryByText("Edited")).toBeNull();
    });
  });
});

describe("FragmentBlock — Return to default", () => {
  it("Return to default button is visible when override is set and unlocked", async () => {
    renderBlock({ fragment: customizableFragment, override: "custom text" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Return to default" })).toBeDefined();
    });
  });

  it("Return to default button calls clearFragmentOverride", async () => {
    const clearFragmentOverride = vi.fn().mockResolvedValue(undefined);
    const onOverrideChange = vi.fn();
    const client = makeClient({ clearFragmentOverride });
    renderBlock({
      client,
      fragment: customizableFragment,
      override: "custom text",
      onOverrideChange,
    });

    await waitFor(() => screen.getByRole("button", { name: "Return to default" }));
    fireEvent.click(screen.getByRole("button", { name: "Return to default" }));

    await waitFor(() => {
      expect(clearFragmentOverride).toHaveBeenCalledWith({
        modeId: "teach",
        fragmentId: "role.tutor",
      });
      expect(onOverrideChange).toHaveBeenCalled();
    });
  });

  it("after Return to default the textarea shows the template text", async () => {
    const clearFragmentOverride = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({ clearFragmentOverride });
    renderBlock({ client, fragment: customizableFragment, override: "custom text" });

    await waitFor(() => screen.getByRole("button", { name: "Return to default" }));
    fireEvent.click(screen.getByRole("button", { name: "Return to default" }));

    await waitFor(() => {
      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(ta.value).toBe(customizableFragment.template);
    });
  });
});

describe("FragmentBlock — Diff toggle", () => {
  it("Diff button is visible on customizable fragment", async () => {
    renderBlock({ fragment: customizableFragment });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Diff" })).toBeDefined();
    });
  });

  it("clicking Diff reveals the default and current columns", async () => {
    renderBlock({ fragment: customizableFragment, override: "my override" });
    await waitFor(() => screen.getByRole("button", { name: "Diff" }));
    fireEvent.click(screen.getByRole("button", { name: "Diff" }));
    await waitFor(() => {
      expect(screen.getByText("Default")).toBeDefined();
      expect(screen.getByText("Current")).toBeDefined();
    });
  });

  it("clicking Diff again hides the diff columns (toggle)", async () => {
    renderBlock({ fragment: customizableFragment, override: "my override" });
    await waitFor(() => screen.getByRole("button", { name: "Diff" }));
    fireEvent.click(screen.getByRole("button", { name: "Diff" }));
    await waitFor(() => screen.getByText("Hide diff"));
    fireEvent.click(screen.getByRole("button", { name: "Hide diff" }));
    await waitFor(() => {
      expect(screen.queryByText("Default")).toBeNull();
      expect(screen.queryByText("Current")).toBeNull();
    });
  });
});
