/**
 * Tests for the openSessionInTab helper.
 *
 * Verifies:
 * - Calls session.start → openTab → navigate in order
 * - Returns the new TabId
 * - Passes courseTitle to openTab when provided
 * - Omits courseTitle from openTab when not provided
 * - Propagates session.start errors
 * - Propagates openTab errors
 * - initialMessage is stored for consumeInitialMessage, not sent via session.send
 */
import type { PraxisClient, SessionId, TabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { consumeInitialMessage, openSessionInTab } from "../lib/open-session-in-tab.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeTab(overrides: Partial<TabSummary> = {}): TabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-99"),
    sessionId: brandId<"SessionId">("session-99"),
    modeId: "teach",
    title: "teach · new chat",
    sortOrder: 0,
    openedAt: Date.now() as Timestamp,
    lastSeenAt: Date.now() as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function makeClient(tabResult: TabSummary = makeTab()): {
  client: PraxisClient;
  startFn: ReturnType<typeof vi.fn>;
  openTabFn: ReturnType<typeof vi.fn>;
} {
  const startFn = vi.fn().mockResolvedValue({
    sessionId: brandId<"SessionId">("session-99"),
    modeId: "teach",
    startedAt: Date.now() as Timestamp,
  });

  // openTabFn is the useTabs().openTab callback — passed as the `openTab` arg.
  const openTabFn = vi.fn().mockResolvedValue(tabResult);

  const client = makeFakeClient({
    session: { start: startFn, end: vi.fn(), send: vi.fn(), active: vi.fn(), list: vi.fn() },
    tabs: {
      open: vi.fn(), // NOT used by openSessionInTab — here for completeness
      listOpen: vi.fn(),
      list: vi.fn(),
      get: vi.fn(),
      reopen: vi.fn(),
      close: vi.fn(),
      touch: vi.fn(),
      rename: vi.fn(),
    },
  });

  return { client, startFn, openTabFn };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("openSessionInTab", () => {
  it("calls session.start then openTab then navigate in order", async () => {
    const tab = makeTab();
    const { client, startFn, openTabFn } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);
    const callOrder: string[] = [];

    startFn.mockImplementationOnce(async () => {
      callOrder.push("start");
      return { sessionId: tab.sessionId, modeId: "teach", startedAt: Date.now() as Timestamp };
    });
    openTabFn.mockImplementationOnce(async () => {
      callOrder.push("open");
      return tab;
    });
    navigate.mockImplementationOnce(async () => {
      callOrder.push("navigate");
    });

    await openSessionInTab({
      client,
      navigate,
      openTab: openTabFn,
      startOpts: { modeId: "teach" },
    });

    expect(callOrder).toEqual(["start", "open", "navigate"]);
  });

  it("returns the new TabId", async () => {
    const tab = makeTab({ id: brandId<"TabId">("tab-xyz") });
    const { client, openTabFn } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);

    const result = await openSessionInTab({
      client,
      navigate,
      openTab: openTabFn,
      startOpts: { modeId: "teach" },
    });

    expect(result).toBe("tab-xyz");
  });

  it("navigates to /chat/$tabId with the new tab's id", async () => {
    const tab = makeTab({ id: brandId<"TabId">("tab-nav-test") });
    const { client, openTabFn } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);

    await openSessionInTab({
      client,
      navigate,
      openTab: openTabFn,
      startOpts: { modeId: "teach" },
    });

    expect(navigate).toHaveBeenCalledWith({
      to: "/chat/$tabId",
      params: { tabId: "tab-nav-test" },
    });
  });

  it("does NOT call client.tabs.open — uses the openTab callback instead", async () => {
    // Root cause of the startup-invisible bug: calling client.tabs.open directly
    // bypasses TabsProvider state, so the new tab body never mounts.
    const tab = makeTab();
    const { client, openTabFn } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);

    await openSessionInTab({
      client,
      navigate,
      openTab: openTabFn,
      startOpts: { modeId: "course-create" },
    });

    // The openTab callback (useTabs hook) was called
    expect(openTabFn).toHaveBeenCalledTimes(1);
    // client.tabs.open was NOT called directly
    expect(client.tabs.open).not.toHaveBeenCalled();
  });

  it("passes courseTitle to openTab when provided", async () => {
    const { client, openTabFn } = makeClient();
    const navigate = vi.fn().mockResolvedValue(undefined);

    await openSessionInTab({
      client,
      navigate,
      openTab: openTabFn,
      startOpts: { modeId: "teach" },
      courseTitle: "Algebra 1",
    });

    expect(openTabFn).toHaveBeenCalledWith(expect.objectContaining({ courseTitle: "Algebra 1" }));
  });

  it("omits courseTitle from openTab when not provided", async () => {
    const { client, openTabFn } = makeClient();
    const navigate = vi.fn().mockResolvedValue(undefined);

    await openSessionInTab({
      client,
      navigate,
      openTab: openTabFn,
      startOpts: { modeId: "course-create" },
    });

    const arg = openTabFn.mock.calls[0]?.[0];
    expect("courseTitle" in arg).toBe(false);
  });

  it("passes courseId to session.start when provided", async () => {
    const { client, startFn, openTabFn } = makeClient();
    const navigate = vi.fn().mockResolvedValue(undefined);
    const courseId = brandId<"CourseId">("course-abc");

    await openSessionInTab({
      client,
      navigate,
      openTab: openTabFn,
      startOpts: { modeId: "teach", courseId },
    });

    expect(startFn).toHaveBeenCalledWith({ modeId: "teach", courseId });
  });

  it("propagates session.start errors", async () => {
    const { client, startFn, openTabFn } = makeClient();
    const navigate = vi.fn().mockResolvedValue(undefined);

    startFn.mockRejectedValueOnce(new Error("start failed"));

    await expect(
      openSessionInTab({
        client,
        navigate,
        openTab: openTabFn,
        startOpts: { modeId: "teach" },
      }),
    ).rejects.toThrow("start failed");

    expect(navigate).not.toHaveBeenCalled();
  });

  it("propagates openTab errors", async () => {
    const { client, openTabFn } = makeClient();
    const navigate = vi.fn().mockResolvedValue(undefined);

    openTabFn.mockRejectedValueOnce(new Error("tab open failed"));

    await expect(
      openSessionInTab({
        client,
        navigate,
        openTab: openTabFn,
        startOpts: { modeId: "teach" },
      }),
    ).rejects.toThrow("tab open failed");

    expect(navigate).not.toHaveBeenCalled();
  });

  // ── initialMessage ────────────────────────────────────────────────────────────

  it("does not store initialMessage when not provided", async () => {
    const tab = makeTab({ sessionId: brandId<"SessionId">("session-no-msg") });
    const { client, startFn, openTabFn } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);

    startFn.mockResolvedValueOnce({
      sessionId: tab.sessionId,
      modeId: "teach",
      startedAt: Date.now() as Timestamp,
    });

    await openSessionInTab({
      client,
      navigate,
      openTab: openTabFn,
      startOpts: { modeId: "course-create" },
    });

    expect(consumeInitialMessage(tab.sessionId)).toBeUndefined();
    expect(client.session.send).not.toHaveBeenCalled();
  });

  it("does not store initialMessage when whitespace-only", async () => {
    const sessionId = brandId<"SessionId">("session-ws-only");
    const tab = makeTab({ sessionId });
    const { client, startFn, openTabFn } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);

    startFn.mockResolvedValueOnce({
      sessionId,
      modeId: "teach",
      startedAt: Date.now() as Timestamp,
    });

    await openSessionInTab({
      client,
      navigate,
      openTab: openTabFn,
      startOpts: { modeId: "course-create" },
      initialMessage: "   ",
    });

    expect(consumeInitialMessage(sessionId)).toBeUndefined();
    expect(client.session.send).not.toHaveBeenCalled();
  });

  it("stores initialMessage for consumeInitialMessage (not fire-and-forget)", async () => {
    const sessionId = brandId<"SessionId">("session-with-msg");
    const tab = makeTab({ sessionId });
    const { client, startFn, openTabFn } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);
    const message = "I want to understand calculus, not just memorize it.";

    startFn.mockResolvedValueOnce({
      sessionId,
      modeId: "teach",
      startedAt: Date.now() as Timestamp,
    });

    await openSessionInTab({
      client,
      navigate,
      openTab: openTabFn,
      startOpts: { modeId: "course-create" },
      initialMessage: message,
    });

    // Events NOT consumed by fire-and-forget — stored for the tab body to pick up.
    expect(client.session.send).not.toHaveBeenCalled();
    // consumeInitialMessage returns and clears the stored message.
    expect(consumeInitialMessage(sessionId as unknown as SessionId)).toBe(message);
    // Consuming again returns undefined (cleared).
    expect(consumeInitialMessage(sessionId as unknown as SessionId)).toBeUndefined();
  });

  it("navigation still happens even when initialMessage is provided", async () => {
    const sessionId = brandId<"SessionId">("session-nav-with-msg");
    const tab = makeTab({ sessionId, id: brandId<"TabId">("tab-nav-msg") });
    const { client, startFn, openTabFn } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);

    startFn.mockResolvedValueOnce({
      sessionId,
      modeId: "teach",
      startedAt: Date.now() as Timestamp,
    });

    const result = await openSessionInTab({
      client,
      navigate,
      openTab: openTabFn,
      startOpts: { modeId: "course-create" },
      initialMessage: "hello world",
    });

    expect(result).toBe(tab.id);
    expect(navigate).toHaveBeenCalledWith({
      to: "/chat/$tabId",
      params: { tabId: tab.id },
    });

    // Clean up stored message to avoid polluting other tests.
    consumeInitialMessage(sessionId as unknown as SessionId);
  });
});
