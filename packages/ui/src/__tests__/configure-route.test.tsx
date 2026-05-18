import type {
  ConfiguratorActionRow,
  LockClient,
  PraxisClient,
  SessionHandle,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { ConfigureRoute } from "../routes/configure.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// Mock TanStack Router
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useSearch: () => ({}),
  };
});

// Mock React Flow (not needed in this route test)
vi.mock("@xyflow/react", () => ({
  ReactFlow: () => <div data-testid="react-flow" />,
  Background: () => null,
  Controls: () => null,
}));

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

function makeClient(
  lockClient: LockClient,
  sessionOverrides?: Partial<PraxisClient["session"]>,
): PraxisClient {
  const session: PraxisClient["session"] = {
    active: vi.fn().mockResolvedValue(null),
    start: vi.fn().mockResolvedValue({
      sessionId: brandId<"SessionId">("configure-session-1"),
      modeId: "configure",
      startedAt: Date.now() as Timestamp,
    } satisfies SessionHandle),
    end: vi.fn().mockResolvedValue({
      sessionId: brandId<"SessionId">("configure-session-1"),
      endedAt: Date.now() as Timestamp,
      unlockedGates: [],
      newMisconceptions: 0,
    }),
    send: vi.fn(),
    ...sessionOverrides,
  };

  return makeFakeClient({
    session,
    artifacts: {
      courses: vi.fn().mockResolvedValue([]),
      course: vi.fn(),
      lessons: vi.fn().mockResolvedValue([]),
      gates: vi.fn().mockResolvedValue([]),
      progress: vi.fn(),
      flashcards: vi.fn(),
      notes: vi.fn(),
      gateView: vi.fn().mockResolvedValue([]),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
      concepts: vi.fn().mockResolvedValue([]),
    } as PraxisClient["artifacts"],
    author: {
      getCourseSummary: vi
        .fn()
        .mockResolvedValue({ course: null, lessons: [], gates: [], concepts: [] }),
      listConfiguratorActions: vi.fn().mockResolvedValue([] as ConfiguratorActionRow[]),
      createLesson: vi.fn(),
      updateLesson: vi.fn(),
      deleteLesson: vi.fn(),
      createGate: vi.fn(),
      updateGate: vi.fn(),
      deleteGate: vi.fn(),
      overrideGate: vi.fn(),
      customizePrompt: vi.fn(),
      clearFragmentOverride: vi.fn(),
      setStyleSliders: vi.fn(),
      resetConcept: vi.fn(),
      clearMisconception: vi.fn(),
      exportMemory: vi.fn(),
      deleteAllMemory: vi.fn(),
      updateCourse: vi.fn(),
      createCourse: vi.fn(),
      editGate: vi.fn(),
      bootstrap: vi.fn(),
      getGlobalPrompt: vi.fn().mockResolvedValue(null),
      setGlobalPrompt: vi.fn().mockResolvedValue(undefined),
      getModeAppend: vi.fn().mockResolvedValue(null),
      setModeAppend: vi.fn().mockResolvedValue(undefined),
      listFragmentOverrides: vi.fn().mockResolvedValue([]),
      previewPromptWithAttribution: vi.fn().mockResolvedValue({ segments: [], fullText: "" }),
    } as unknown as PraxisClient["author"],
    memory: {
      studentModel: vi
        .fn()
        .mockResolvedValue({ studentId: "s1", conceptMastery: new Map(), lastUpdated: Date.now() }),
      misconceptions: vi.fn().mockResolvedValue([]),
      procedural: vi.fn(),
      affective: vi.fn(),
      episodic: vi.fn(),
      export: vi.fn(),
      delete: vi.fn(),
    } as PraxisClient["memory"],
    lock: lockClient,
  });
}

function renderRoute(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <ConfigureRoute />
    </PraxisClientProvider>,
  );
}

describe("ConfigureRoute", () => {
  it("shows locked screen when lock is set and not unlocked", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      isUnlocked: vi.fn().mockResolvedValue(false),
    });
    const client = makeClient(lockClient);
    renderRoute(client);

    await waitFor(() => {
      // RouteHeader renders the kicker "CONFIGURE" and title "configure"
      expect(screen.getByText("CONFIGURE")).toBeDefined();
    });

    expect(screen.getByRole("button", { name: /Unlock/i })).toBeDefined();
  });

  it("shows unlock modal when Unlock button is clicked on locked screen", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      isUnlocked: vi.fn().mockResolvedValue(false),
    });
    const client = makeClient(lockClient);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("CONFIGURE")).toBeDefined();
    });

    // Click the Unlock button on the locked screen
    const unlockBtn = screen.getAllByRole("button", { name: /unlock/i })[0];
    if (unlockBtn) fireEvent.click(unlockBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
  });

  it("renders workspace with tabs when unlocked", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(false),
      isUnlocked: vi.fn().mockResolvedValue(true),
    });
    const client = makeClient(lockClient);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Course" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Gates" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Prompt" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Memory" })).toBeDefined();
    });
  });

  it("renders inspector strip in the canvas column", async () => {
    const lockClient = makeLockClient();
    const client = makeClient(lockClient);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Course" })).toBeDefined();
    });

    // Inspector strip placeholder is present beneath the canvas
    expect(screen.getByTestId("inspector-strip")).toBeDefined();
  });

  it("renders the authoring chat pane in the right panel", async () => {
    const lockClient = makeLockClient();
    const client = makeClient(lockClient);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Course" })).toBeDefined();
    });

    // The side chat panel (AuthoringChatPane) renders its header label
    expect(screen.getByText("Configure assistant")).toBeDefined();
  });

  it("all tab panels are mounted simultaneously (tab-body-isolation)", async () => {
    const lockClient = makeLockClient();
    const client = makeClient(lockClient);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Course" })).toBeDefined();
    });

    // Tab-body isolation: all panels mount at once; content from hidden panels
    // is still in the DOM (just display:none). PromptTab's mode picker rail
    // (with "Modes" label) mounts even when Course is the active tab.
    expect(screen.getByText("Modes")).toBeDefined();
  });

  it("starts a configure session when unlocked", async () => {
    const lockClient = makeLockClient();
    const client = makeClient(lockClient);
    renderRoute(client);

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "configure" });
    });
  });

  it("does not start session when locked", async () => {
    const lockClient = makeLockClient({
      isSet: vi.fn().mockResolvedValue(true),
      isUnlocked: vi.fn().mockResolvedValue(false),
    });
    const client = makeClient(lockClient);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("CONFIGURE")).toBeDefined();
    });

    expect(client.session.start).not.toHaveBeenCalled();
  });

  it("switches tabs when tab buttons are clicked", async () => {
    const lockClient = makeLockClient();
    const client = makeClient(lockClient);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Course" })).toBeDefined();
    });

    // Click Prompt tab — the canvas kicker "⁂ Configure · prompts" becomes visible.
    // (PromptTab already mounts due to tab-body-isolation; clicking Prompt makes it active.)
    fireEvent.click(screen.getByRole("button", { name: "Prompt" }));

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: /mode picker/i })).toBeDefined();
    });
  });

  it("Prompt tab change-dot lights up when the prompts surface marks dirty", async () => {
    // Regression test for dirty-key mismatch: TABS registers "configure.prompts"
    // and FragmentDocument calls useDirtyState("configure.prompts") — they must match.
    const lockClient = makeLockClient();
    const client = makeClient(lockClient, undefined);

    // Return a fragment override so FragmentDocument sets hasAnyOverride=true → markDirty().
    (client.author.listFragmentOverrides as ReturnType<typeof vi.fn>).mockResolvedValue([
      { fragmentId: "teach.system.role", override: "custom text" },
    ]);

    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Prompt" })).toBeDefined();
    });

    // The Prompt tab button should show a change-dot (title="unsaved changes")
    // once FragmentDocument's useEffect fires and calls markDirty().
    await waitFor(() => {
      const promptBtn = screen.getByRole("button", { name: "Prompt" });
      expect(promptBtn.querySelector('[title="unsaved changes"]')).not.toBeNull();
    });
  });

  it("tab buttons show NO change-dot when their dirty key is clean", async () => {
    // No overrides returned → no tab marks dirty → no change-dots anywhere.
    const lockClient = makeLockClient();
    const client = makeClient(lockClient);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Course" })).toBeDefined();
    });

    // Wait for any async dirty-state effects to settle.
    await waitFor(() => {
      for (const name of ["Course", "Gates", "Prompt", "Memory"]) {
        const btn = screen.getByRole("button", { name });
        expect(btn.querySelector('[title="unsaved changes"]')).toBeNull();
      }
    });
  });

  it("cross-tab independence: Prompt dirty does NOT light dots on Course, Gates, or Memory", async () => {
    // Mark only the Prompt surface dirty (via listFragmentOverrides returning data).
    const lockClient = makeLockClient();
    const client = makeClient(lockClient);

    (client.author.listFragmentOverrides as ReturnType<typeof vi.fn>).mockResolvedValue([
      { fragmentId: "teach.system.role", override: "custom text" },
    ]);

    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Prompt" })).toBeDefined();
    });

    // Wait for Prompt's dot to appear.
    await waitFor(() => {
      const promptBtn = screen.getByRole("button", { name: "Prompt" });
      expect(promptBtn.querySelector('[title="unsaved changes"]')).not.toBeNull();
    });

    // Other tabs must still be clean — no cross-contamination.
    for (const name of ["Course", "Gates", "Memory"]) {
      const btn = screen.getByRole("button", { name });
      expect(btn.querySelector('[title="unsaved changes"]')).toBeNull();
    }
  });
});
