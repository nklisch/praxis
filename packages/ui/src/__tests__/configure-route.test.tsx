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

  // --- Reuse-or-spawn mount path ---

  it("reuses an existing active configure session (does NOT call start)", async () => {
    const existingHandle: SessionHandle = {
      sessionId: brandId<"SessionId">("existing-configure-session"),
      modeId: "configure",
      startedAt: Date.now() as Timestamp,
    };
    const lockClient = makeLockClient();
    const client = makeClient(lockClient, {
      active: vi.fn().mockResolvedValue(existingHandle),
      start: vi.fn().mockResolvedValue(existingHandle),
    });
    renderRoute(client);

    await waitFor(() => {
      expect(client.session.active).toHaveBeenCalledWith({ modeId: "configure" });
    });

    // start must NOT have been called — existing session was reused
    expect(client.session.start).not.toHaveBeenCalled();

    // session status text confirms a session is active
    await waitFor(() => {
      expect(screen.getByText("Configure session active")).toBeDefined();
    });
  });

  it("spawns a fresh session when no existing active configure session (active returns null)", async () => {
    const lockClient = makeLockClient();
    // active returns null → spawn-fresh path
    const client = makeClient(lockClient, {
      active: vi.fn().mockResolvedValue(null),
    });
    renderRoute(client);

    await waitFor(() => {
      expect(client.session.active).toHaveBeenCalledWith({ modeId: "configure" });
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

  // --- "Clear / restart" control ---

  it("shows 'Clear / restart' button once a session is active", async () => {
    const lockClient = makeLockClient();
    const client = makeClient(lockClient);
    renderRoute(client);

    // Wait for the session to become active
    await waitFor(() => {
      expect(screen.getByText("Configure session active")).toBeDefined();
    });

    expect(screen.getByRole("button", { name: /clear \/ restart/i })).toBeDefined();
  });

  it("opens confirm modal when 'Clear / restart' is clicked", async () => {
    const lockClient = makeLockClient();
    const client = makeClient(lockClient);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear \/ restart/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /clear \/ restart/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /restart configure session/i })).toBeDefined();
    });
  });

  it("confirms restart: calls end then start, closes modal", async () => {
    const sessionId1 = brandId<"SessionId">("configure-session-1");
    const sessionId2 = brandId<"SessionId">("configure-session-2");
    const freshHandle: SessionHandle = {
      sessionId: sessionId2,
      modeId: "configure",
      startedAt: Date.now() as Timestamp,
    };
    const lockClient = makeLockClient();
    const client = makeClient(lockClient, {
      active: vi.fn().mockResolvedValue(null),
      end: vi.fn().mockResolvedValue({
        sessionId: sessionId1,
        endedAt: Date.now() as Timestamp,
        unlockedGates: [],
        newMisconceptions: 0,
      }),
      start: vi
        .fn()
        .mockResolvedValueOnce({
          sessionId: sessionId1,
          modeId: "configure",
          startedAt: Date.now() as Timestamp,
        } satisfies SessionHandle)
        .mockResolvedValueOnce(freshHandle),
    });
    renderRoute(client);

    // Wait for the initial session to be active
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear \/ restart/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /clear \/ restart/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /restart configure session/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^restart$/i }));

    await waitFor(() => {
      expect(client.session.end).toHaveBeenCalledWith(sessionId1);
      expect(client.session.start).toHaveBeenLastCalledWith({ modeId: "configure" });
    });

    // Modal should be closed
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /restart configure session/i })).toBeNull();
    });
  });

  it("navigating away (unmount) does NOT end the session — reuse contract", async () => {
    // The configure session must survive navigation so the next mount can re-attach.
    // session.end must never be called in the unmount cleanup; only "Clear / restart" ends it.
    const sessionId = brandId<"SessionId">("configure-session-persist");
    const lockClient = makeLockClient();
    const client = makeClient(lockClient, {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({
        sessionId,
        modeId: "configure",
        startedAt: Date.now() as Timestamp,
      } satisfies SessionHandle),
    });
    const { unmount } = renderRoute(client);

    // Wait for the session to be active before unmounting.
    await waitFor(() => {
      expect(screen.getByText("Configure session active")).toBeDefined();
    });

    unmount();

    // session.end must NOT have been called during unmount — the session stays alive
    // so the next /configure mount can re-attach to it via session.active({ modeId: "configure" }).
    expect(client.session.end).not.toHaveBeenCalled();
  });

  it("cancels restart: does not call end or start (beyond initial mount)", async () => {
    const lockClient = makeLockClient();
    const client = makeClient(lockClient, {
      active: vi.fn().mockResolvedValue(null),
    });
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear \/ restart/i })).toBeDefined();
    });

    // Clear the call count so we only track post-open interactions
    (client.session.end as ReturnType<typeof vi.fn>).mockClear();
    (client.session.start as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.click(screen.getByRole("button", { name: /clear \/ restart/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /restart configure session/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /restart configure session/i })).toBeNull();
    });

    expect(client.session.end).not.toHaveBeenCalled();
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

  // --- Two-tab / rapid-remount race ---

  it("second mount after first session established: reuses session, does NOT call start again", async () => {
    // This tests the sequential-remount case: Mount 1 establishes sessionA,
    // navigates away (unmount), then Mount 2 opens /configure and should attach
    // to sessionA via session.active rather than spawning a duplicate session.
    const sessionA: SessionHandle = {
      sessionId: brandId<"SessionId">("configure-session-A"),
      modeId: "configure",
      startedAt: Date.now() as Timestamp,
    };

    const lockClient = makeLockClient();
    // First call to active() returns null (no session yet).
    // After Mount 1's start() resolves, subsequent active() calls return sessionA.
    const activeMock = vi
      .fn()
      .mockResolvedValueOnce(null) // Mount 1: no session yet
      .mockResolvedValue(sessionA); // Mount 2+: session now exists

    const startMock = vi.fn().mockResolvedValue(sessionA);

    const client = makeClient(lockClient, {
      active: activeMock,
      start: startMock,
    });

    // --- Mount 1: spawns fresh session ---
    const { unmount: unmount1 } = renderRoute(client);

    await waitFor(() => {
      expect(startMock).toHaveBeenCalledTimes(1);
    });

    unmount1();
    cleanup(); // flush DOM between mounts

    // --- Mount 2: should reuse sessionA (second active() call returns sessionA) ---
    renderRoute(client);

    await waitFor(() => {
      expect(activeMock).toHaveBeenCalledTimes(2);
    });

    // start must NOT have been called a second time — session was reused
    expect(startMock).toHaveBeenCalledTimes(1);

    // The session status text confirms the session is active on Mount 2
    await waitFor(() => {
      expect(screen.getByText("Configure session active")).toBeDefined();
    });
  });

  it("true simultaneous mounts: known limitation — both may call start (duplicate-session race accepted for v1)", async () => {
    // Per feature-configure-mode-session-hygiene § Risks:
    //   "Two configure tabs opened in the same ~50ms window: both active() queries
    //    return null before either start() resolves — duplicate session is accepted for v1."
    //
    // This test documents and asserts the current behaviour so future fixes are
    // visible as a test change rather than a silent regression in the other direction.
    //
    // Each mount has its own sessionStartedRef (ref is per-component-instance), so
    // the guard only prevents a single mount from double-starting itself — it does NOT
    // coordinate across two concurrent mount instances.
    const sessionA: SessionHandle = {
      sessionId: brandId<"SessionId">("configure-session-A"),
      modeId: "configure",
      startedAt: Date.now() as Timestamp,
    };
    const sessionB: SessionHandle = {
      sessionId: brandId<"SessionId">("configure-session-B"),
      modeId: "configure",
      startedAt: (Date.now() + 1) as Timestamp,
    };

    const lockClient = makeLockClient();
    // Both mounts fire active() before either start() resolves → both see null.
    const activeMock = vi.fn().mockResolvedValue(null);
    const startMock = vi
      .fn()
      .mockResolvedValueOnce(sessionA)
      .mockResolvedValueOnce(sessionB);

    const clientA = makeClient(lockClient, { active: activeMock, start: startMock });
    // Use the same mock so call counts are shared across the two independent renders.
    const clientB = makeClient(lockClient, { active: activeMock, start: startMock });

    // Mount both routes simultaneously (no await between renders).
    const { unmount: unmountA } = render(
      <PraxisClientProvider client={clientA}>
        <ConfigureRoute />
      </PraxisClientProvider>,
    );
    const { unmount: unmountB } = render(
      <PraxisClientProvider client={clientB}>
        <ConfigureRoute />
      </PraxisClientProvider>,
    );

    // Both mounts complete their active() + start() paths.
    await waitFor(() => {
      expect(startMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    // Current behaviour (v1 accepted limitation): two concurrent mounts that both
    // see active()=null will each call start(), resulting in 2 start calls.
    // If this assertion ever fails (only 1 call), the race has been fixed —
    // update this test to assert start is called exactly once.
    expect(startMock).toHaveBeenCalledTimes(2);

    unmountA();
    unmountB();
  });

  it("unmounting during pending active() does not setState (no React warning)", async () => {
    // The `cancelled` flag in the useEffect cleanup guards every setSession/setSessionError
    // call. If it's removed, React (≥18 dev mode) emits a console.error about state updates
    // on an unmounted component. This test asserts the guard is present and effective.
    const consoleError = vi.spyOn(console, "error");

    let resolveActive!: (v: SessionHandle | null) => void;
    const lockClient = makeLockClient();
    const client = makeClient(lockClient, {
      active: vi.fn().mockReturnValue(new Promise<SessionHandle | null>((r) => { resolveActive = r; })),
    });

    const { unmount } = renderRoute(client);

    // Unmount while active() is still pending — the cancelled flag must suppress
    // any subsequent setSession call.
    unmount();

    // Now resolve active() after unmount — without the cancelled guard this would
    // call setSession on an unmounted component.
    resolveActive({
      sessionId: brandId<"SessionId">("x"),
      modeId: "configure",
      startedAt: 0 as Timestamp,
    } satisfies SessionHandle);

    // Let microtasks and any pending timers flush.
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(consoleError).not.toHaveBeenCalledWith(expect.stringMatching(/unmounted/i));

    consoleError.mockRestore();
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
