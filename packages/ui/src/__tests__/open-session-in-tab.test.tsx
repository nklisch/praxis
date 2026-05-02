/**
 * Tests for the openSessionInTab helper.
 *
 * Verifies:
 * - Calls session.start → tabs.open → navigate in order
 * - Returns the new TabId
 * - Passes courseTitle to tabs.open when provided
 * - Omits courseTitle from tabs.open when not provided
 * - Propagates session.start errors
 * - Propagates tabs.open errors
 */
import type { PraxisClient, TabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { openSessionInTab } from "../lib/open-session-in-tab.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeTab(overrides: Partial<TabSummary> = {}): TabSummary {
  return {
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
  openFn: ReturnType<typeof vi.fn>;
} {
  const startFn = vi.fn().mockResolvedValue({
    sessionId: brandId<"SessionId">("session-99"),
    modeId: "teach",
    startedAt: Date.now() as Timestamp,
  });

  const openFn = vi.fn().mockResolvedValue(tabResult);

  const client = makeFakeClient({
    session: { start: startFn, end: vi.fn(), send: vi.fn(), active: vi.fn(), list: vi.fn() },
    tabs: {
      open: openFn,
      listOpen: vi.fn(),
      list: vi.fn(),
      get: vi.fn(),
      reopen: vi.fn(),
      close: vi.fn(),
      touch: vi.fn(),
      rename: vi.fn(),
    },
  });

  return { client, startFn, openFn };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("openSessionInTab", () => {
  it("calls session.start then tabs.open then navigate in order", async () => {
    const tab = makeTab();
    const { client, startFn, openFn } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);
    const callOrder: string[] = [];

    startFn.mockImplementationOnce(async () => {
      callOrder.push("start");
      return { sessionId: tab.sessionId, modeId: "teach", startedAt: Date.now() as Timestamp };
    });
    openFn.mockImplementationOnce(async () => {
      callOrder.push("open");
      return tab;
    });
    navigate.mockImplementationOnce(async () => {
      callOrder.push("navigate");
    });

    await openSessionInTab({
      client,
      navigate,
      startOpts: { modeId: "teach" },
    });

    expect(callOrder).toEqual(["start", "open", "navigate"]);
  });

  it("returns the new TabId", async () => {
    const tab = makeTab({ id: brandId<"TabId">("tab-xyz") });
    const { client } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);

    const result = await openSessionInTab({
      client,
      navigate,
      startOpts: { modeId: "teach" },
    });

    expect(result).toBe("tab-xyz");
  });

  it("navigates to /chat/$tabId with the new tab's id", async () => {
    const tab = makeTab({ id: brandId<"TabId">("tab-nav-test") });
    const { client } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);

    await openSessionInTab({
      client,
      navigate,
      startOpts: { modeId: "teach" },
    });

    expect(navigate).toHaveBeenCalledWith({
      to: "/chat/$tabId",
      params: { tabId: "tab-nav-test" },
    });
  });

  it("passes courseTitle to tabs.open when provided", async () => {
    const { client, openFn } = makeClient();
    const navigate = vi.fn().mockResolvedValue(undefined);

    await openSessionInTab({
      client,
      navigate,
      startOpts: { modeId: "teach" },
      courseTitle: "Algebra 1",
    });

    expect(openFn).toHaveBeenCalledWith(expect.objectContaining({ courseTitle: "Algebra 1" }));
  });

  it("omits courseTitle from tabs.open when not provided", async () => {
    const { client, openFn } = makeClient();
    const navigate = vi.fn().mockResolvedValue(undefined);

    await openSessionInTab({
      client,
      navigate,
      startOpts: { modeId: "bootstrap" },
    });

    const arg = openFn.mock.calls[0]?.[0];
    expect("courseTitle" in arg).toBe(false);
  });

  it("passes courseId to session.start when provided", async () => {
    const { client, startFn } = makeClient();
    const navigate = vi.fn().mockResolvedValue(undefined);
    const courseId = brandId<"CourseId">("course-abc");

    await openSessionInTab({
      client,
      navigate,
      startOpts: { modeId: "teach", courseId },
    });

    expect(startFn).toHaveBeenCalledWith({ modeId: "teach", courseId });
  });

  it("propagates session.start errors", async () => {
    const { client, startFn } = makeClient();
    const navigate = vi.fn().mockResolvedValue(undefined);

    startFn.mockRejectedValueOnce(new Error("start failed"));

    await expect(
      openSessionInTab({
        client,
        navigate,
        startOpts: { modeId: "teach" },
      }),
    ).rejects.toThrow("start failed");

    expect(navigate).not.toHaveBeenCalled();
  });

  it("propagates tabs.open errors", async () => {
    const { client, openFn } = makeClient();
    const navigate = vi.fn().mockResolvedValue(undefined);

    openFn.mockRejectedValueOnce(new Error("tab open failed"));

    await expect(
      openSessionInTab({
        client,
        navigate,
        startOpts: { modeId: "teach" },
      }),
    ).rejects.toThrow("tab open failed");

    expect(navigate).not.toHaveBeenCalled();
  });
});
