/**
 * Integration regression guard for the course-create startup flow.
 *
 * Story: story-course-create-startup-e2e-render-test
 *
 * The fix for epic-course-create-readiness-startup-invisible (commit 700a0b5)
 * landed strong unit tests for `openSessionInTab` and `consumeInitialMessage`.
 * But the unit-level tests mocked `useTabs`, so they would have passed even
 * with the original bug (calling `client.tabs.open` directly, bypassing the
 * TabsProvider state update that makes the tab body mount).
 *
 * This test closes that gap:
 *  - Mounts <CourseCreateRoute> inside a REAL <TabsProvider> (no useTabs mock).
 *  - Drives the "Start Praxis →" CTA with a non-empty context string.
 *  - Asserts that `client.tabs.open` was called (proving the real useTabs.openTab
 *    path was used, not a direct client.tabs.open call that bypasses state).
 *  - Asserts the CourseCreateTabBody mounts (TabsProvider state update propagated).
 *  - Asserts that the prefill context flows into AuthoringChatPane as a
 *    prefillMessage that triggers session.send, and that the resulting engine
 *    event text renders in the DOM.
 *
 * Regression class caught: if openSessionInTab calls client.tabs.open directly
 * instead of useTabs().openTab, the TabsProvider never sees the new tab, the tab
 * body never mounts, and consumeInitialMessage is never called — so session.send
 * is never called and no engine event reaches the DOM.
 */
import type {
  EngineEvent,
  EpisodicEvent,
  PraxisClient,
  SessionHandle,
  SessionId,
  SessionTabSummary,
  TabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseCreateTabBody } from "../components/course-create-tab-body.js";
import { AuthProvider } from "../context/auth-context.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { TabsProvider, useTabs } from "../context/tabs-context.js";
import { CourseCreateRoute } from "../routes/course-create.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// ── Router mocks ───────────────────────────────────────────────────────────────
// Mock TanStack Router hooks used by both CourseCreateRoute and CourseCreateTabBody.
// Do NOT mock useTabs — this test exercises the real TabsProvider integration.
const mockNavigate = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearch: () => ({}),
    useParams: () => ({}),
  };
});

afterEach(() => {
  cleanup();
  mockNavigate.mockClear();
});

// ── Fixture constants ──────────────────────────────────────────────────────────

const SESSION_ID = brandId<"SessionId">("int-session-1") as SessionId;
const TAB_ID = brandId<"TabId">("int-tab-1");

function makeSessionTab(): SessionTabSummary {
  return {
    kind: "session",
    id: TAB_ID,
    sessionId: SESSION_ID,
    modeId: "course-create",
    title: "new course · course-create",
    sortOrder: 0,
    openedAt: Date.now() as Timestamp,
    lastSeenAt: Date.now() as Timestamp,
    closedAt: null,
  };
}

// ── Engine event stream helpers ────────────────────────────────────────────────

async function* makeModelMessageStream(
  content: string,
): AsyncGenerator<EngineEvent, void, unknown> {
  yield {
    type: "model_message",
    content,
    partial: false,
  } as EngineEvent;
}

async function* makeEmptyEpisodicStream(): AsyncGenerator<EpisodicEvent, void, unknown> {}

// ── Client builder ─────────────────────────────────────────────────────────────

/**
 * Build the fake PraxisClient for this integration test.
 *
 * The session.send async generator yields a single model_message event.
 * This event is what should appear in the DOM once the prefill flows through.
 */
function makeIntegrationClient(
  opts: { engineEventContent?: string; sendSpy?: ReturnType<typeof vi.fn> } = {},
): PraxisClient {
  const { engineEventContent = "Hello from Praxis tutor!", sendSpy } = opts;

  const tab = makeSessionTab();

  const sessionHandle: SessionHandle = {
    sessionId: SESSION_ID,
    modeId: "course-create",
    startedAt: Date.now() as Timestamp,
  };

  const sendImpl = async function* (
    _sessionId: SessionId,
    _message: string,
  ): AsyncGenerator<EngineEvent, void, unknown> {
    yield* makeModelMessageStream(engineEventContent);
  };

  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue(sessionHandle),
      end: vi.fn().mockResolvedValue({
        sessionId: SESSION_ID,
        endedAt: Date.now() as Timestamp,
        unlockedGates: [],
        newMisconceptions: 0,
      }),
      // send is the critical path: called by AuthoringChatPane when prefillMessage lands.
      send: (sendSpy ?? vi.fn()).mockImplementation(sendImpl),
      discardIfUnpromoted: vi.fn().mockResolvedValue({ discarded: false }),
    } as PraxisClient["session"],

    tabs: {
      // listOpen is called by TabsProvider on mount — start with no open tabs.
      listOpen: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      // open is called by useTabs().openTab (via openSessionInTab) — returns the new tab.
      // This is the critical assertion: if openSessionInTab calls client.tabs.open directly
      // (bypassing useTabs), the TabsProvider state never updates and the tab body never mounts.
      open: vi.fn().mockResolvedValue(tab satisfies TabSummary),
      reopen: vi.fn().mockResolvedValue(tab),
      close: vi.fn().mockResolvedValue(undefined),
      touch: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(tab),
    } as PraxisClient["tabs"],

    memory: {
      episodic: vi.fn().mockReturnValue(makeEmptyEpisodicStream()),
    } as unknown as PraxisClient["memory"],

    author: {
      listConfiguratorActions: vi.fn().mockResolvedValue([]),
    } as unknown as PraxisClient["author"],

    quickCheck: {
      events: vi.fn(async function* () {}),
      resolve: vi.fn().mockResolvedValue({}),
    } as unknown as PraxisClient["quickCheck"],

    drafts: {
      // CourseCreateTabBody subscribes to this on mount — return empty stream.
      events: vi.fn(async function* () {}),
    } as unknown as PraxisClient["drafts"],

    documentScopes: {
      listForScope: vi.fn().mockResolvedValue([]),
      listOrphaned: vi.fn().mockResolvedValue([]),
      listScopesForDocument: vi.fn().mockResolvedValue([]),
      attach: vi.fn().mockResolvedValue({ attached: true }),
      detach: vi.fn().mockResolvedValue({ detached: true }),
    } as PraxisClient["documentScopes"],

    config: {
      courseCreateConfig: vi.fn().mockResolvedValue({ maxSteps: 50 }),
      setCourseCreateConfig: vi.fn().mockResolvedValue({}),
    } as unknown as PraxisClient["config"],

    ingest: {
      pickFile: vi.fn().mockResolvedValue(null),
      pickPaths: vi.fn().mockResolvedValue([]),
      isAvailable: () => true,
      start: vi.fn(async function* () {}),
      candidatesFor: vi.fn().mockResolvedValue([]),
      writeTempText: vi.fn().mockResolvedValue("/tmp/test.txt"),
    } as PraxisClient["ingest"],

    packs: {
      listAvailable: vi.fn().mockResolvedValue([]),
      listImported: vi.fn().mockResolvedValue([]),
      import: vi.fn().mockResolvedValue({}),
    } as PraxisClient["packs"],
  });
}

// ── Test shell ────────────────────────────────────────────────────────────────
//
// A minimal integration shell that:
//  1. Renders <CourseCreateRoute> so the CTA can be clicked.
//  2. Observes the real TabsProvider state for open tabs.
//  3. Renders <CourseCreateTabBody> for each open course-create tab, exactly as
//     <ChatRoute> would in the real app (via <ChatTabBody> → <CourseCreateTabBody>).
//
// This wires CourseCreateRoute → TabsProvider → CourseCreateTabBody without
// pulling in the full ChatRoute (which brings in ChatRightPanel, DocumentList,
// tldraw, useMatches, etc.).

function TabBodyShell() {
  const { openTabs } = useTabs();
  const courseCreateTabs = openTabs.filter(
    (t): t is SessionTabSummary => t.kind === "session" && t.modeId === "course-create",
  );
  return (
    <>
      {courseCreateTabs.map((tab) => (
        <CourseCreateTabBody key={tab.id} tab={tab} />
      ))}
    </>
  );
}

function IntegrationShell({ client }: { client: PraxisClient }) {
  return (
    <PraxisClientProvider client={client}>
      <AuthProvider>
        <TabsProvider>
          <CourseCreateRoute />
          <TabBodyShell />
        </TabsProvider>
      </AuthProvider>
    </PraxisClientProvider>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("CourseCreateRoute → TabsProvider → CourseCreateTabBody integration", () => {
  /**
   * The primary regression test.
   *
   * Proves the full startup loop:
   *  CourseCreateRoute CTA click
   *    → openSessionInTab (real useTabs().openTab, not client.tabs.open direct)
   *    → TabsProvider state update (new tab in openTabs)
   *    → CourseCreateTabBody mounts (TabBodyShell sees the new tab)
   *    → consumeInitialMessage returns the context text
   *    → AuthoringChatPane sends prefill via session.send
   *    → engine model_message event renders in DOM
   *
   * If openSessionInTab called client.tabs.open directly (the original bug),
   * TabsProvider state would never update, TabBodyShell would render nothing,
   * consumeInitialMessage would never fire, and session.send would never be called —
   * the engine event text would not appear in the DOM.
   */
  it("engine event from session.send renders in the DOM after CTA click (real TabsProvider)", async () => {
    const ENGINE_RESPONSE = "Welcome to your course-create session!";
    const sendSpy = vi.fn();
    const client = makeIntegrationClient({ engineEventContent: ENGINE_RESPONSE, sendSpy });

    render(<IntegrationShell client={client} />);

    // Wait for the route to finish loading (TabsProvider fetches listOpen).
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start Praxis/i })).toBeDefined();
    });

    // Fill in context text (non-empty → stored as prefillMessage for the tab body).
    const contextText =
      "I'm returning to calculus after 10 years — help me build a refresher course.";
    fireEvent.change(screen.getByRole("textbox"), { target: { value: contextText } });

    // Click the CTA.
    await act(async () => {
      screen.getByRole("button", { name: /Start Praxis/i }).click();
    });

    // 1. session.start was called (proves the session was opened).
    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "course-create" });
    });

    // 2. client.tabs.open was called — this is the real useTabs().openTab path.
    //    If openSessionInTab called client.tabs.open directly, this would be true
    //    too — but the key is that the TabsProvider state update would be missing.
    //    The downstream assertions (tab body mount, engine event) prove state propagated.
    await waitFor(() => {
      expect(client.tabs.open).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: SESSION_ID }),
      );
    });

    // 3. navigate was called after the tab opened (proves the full openSessionInTab flow).
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/chat/$tabId" }));
    });

    // 4. The CourseCreateTabBody mounts (proves TabsProvider state propagated to TabBodyShell).
    //    "Course-design assistant" is the AuthoringChatPane header label for course-create mode.
    await waitFor(() => {
      expect(screen.getByText("Course-design assistant")).toBeDefined();
    });

    // 5. The engine event text renders in the DOM (proves the prefill → session.send → render loop).
    //    This would NOT appear if:
    //      a) client.tabs.open was bypassed (tab body never mounts)
    //      b) consumeInitialMessage was not called (no prefill → send never fires)
    //      c) session.send was never called (no events → no text)
    await waitFor(
      () => {
        expect(screen.getByText(ENGINE_RESPONSE)).toBeDefined();
      },
      { timeout: 3000 },
    );

    // 6. session.send was called with the context text (prefill forwarded correctly).
    expect(sendSpy).toHaveBeenCalledWith(SESSION_ID, contextText);
  });

  /**
   * Complementary: verify that WITHOUT context text, no prefill is stored and
   * session.send is NOT called on mount (the tab body opens silently).
   */
  it("no prefill stored and session.send not called when context is empty", async () => {
    const sendSpy = vi.fn();
    const client = makeIntegrationClient({ sendSpy });

    render(<IntegrationShell client={client} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start Praxis/i })).toBeDefined();
    });

    // Context textarea is empty — click Start Praxis without filling it.
    await act(async () => {
      screen.getByRole("button", { name: /Start Praxis/i }).click();
    });

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "course-create" });
    });

    // Tab body mounts (TabsProvider state propagated).
    await waitFor(() => {
      expect(screen.getByText("Course-design assistant")).toBeDefined();
    });

    // session.send must NOT be called — no prefill means the pane waits for the user to type.
    // Give it a moment to confirm it remains uncalled.
    await new Promise((r) => setTimeout(r, 100));
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
