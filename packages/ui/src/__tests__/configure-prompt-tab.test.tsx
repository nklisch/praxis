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
      previewPromptWithAttribution: vi.fn().mockResolvedValue({
        prompt: "composed prompt",
        segments: [],
      }),
      getGlobalPrompt: vi.fn().mockResolvedValue(null),
      setGlobalPrompt: vi.fn().mockResolvedValue(undefined),
      customizePrompt: vi.fn().mockResolvedValue(undefined),
      clearFragmentOverride: vi.fn().mockResolvedValue(undefined),
      listFragmentOverrides: vi.fn().mockResolvedValue([]),
      setStyleSliders: vi.fn().mockResolvedValue(undefined),
    } as unknown as PraxisClient["author"],
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

describe("PromptTab — v3 two-section surface", () => {
  it("renders exactly two top-level sections", async () => {
    const { container } = renderTab();
    // The two section headings introduced by the v3 layout.
    expect(screen.getByText("Teaching Style")).toBeDefined();
    expect(screen.getByText("Prompt blocks")).toBeDefined();
    // Wait for the async block stack to finish loading before counting sections,
    // so any post-load section addition would also be visible.
    await waitFor(() => {
      expect(screen.getByText("Global prompt")).toBeDefined();
    });
    const sections = container.querySelectorAll("section");
    expect(sections.length).toBe(2);
  });

  it("renders Teaching Style before Prompt blocks in DOM order", () => {
    renderTab();
    const styleHeading = screen.getByText("Teaching Style");
    const blocksHeading = screen.getByText("Prompt blocks");
    // Heading order in the DOM matches the section order.
    expect(
      styleHeading.compareDocumentPosition(blocksHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not render the retired Global Fragment / Composed Preview / Prompt Fragments headings", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText("Prompt blocks")).toBeDefined();
    });
    expect(screen.queryByText("Global Fragment")).toBeNull();
    expect(screen.queryByText("Composed Preview")).toBeNull();
    expect(screen.queryByText("Prompt Fragments")).toBeNull();
  });

  it("renders the prompt block stack with the mode picker", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByLabelText(/mode/i)).toBeDefined();
    });
  });
});
