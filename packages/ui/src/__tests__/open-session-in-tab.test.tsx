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
import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { openSessionInTab } from "../lib/open-session-in-tab.js";
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
      startOpts: { modeId: "course-create" },
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

  // ── initialMessage ────────────────────────────────────────────────────────────

  it("does not call session.send when initialMessage is not provided", async () => {
    const { client, startFn } = makeClient();
    const navigate = vi.fn().mockResolvedValue(undefined);
    const sendFn = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: overwriting session for spy purposes
    (client.session as any).send = sendFn;

    await openSessionInTab({ client, navigate, startOpts: { modeId: "course-create" } });

    // Allow any microtasks to flush
    await Promise.resolve();
    await Promise.resolve();

    expect(sendFn).not.toHaveBeenCalled();
    expect(startFn).toHaveBeenCalled();
  });

  it("does not call session.send when initialMessage is whitespace-only", async () => {
    const { client } = makeClient();
    const navigate = vi.fn().mockResolvedValue(undefined);
    const sendFn = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: overwriting session for spy purposes
    (client.session as any).send = sendFn;

    await openSessionInTab({
      client,
      navigate,
      startOpts: { modeId: "course-create" },
      initialMessage: "   ",
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(sendFn).not.toHaveBeenCalled();
  });

  it("fire-and-forget sends initialMessage when non-empty", async () => {
    const tab = makeTab();
    const { client } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);

    const sendFn = vi.fn().mockReturnValue(
      (async function* () {
        // empty event stream
      })(),
    );
    // biome-ignore lint/suspicious/noExplicitAny: overwriting session for spy purposes
    (client.session as any).send = sendFn;

    const message = "I want to understand calculus, not just memorize it.";

    await openSessionInTab({
      client,
      navigate,
      startOpts: { modeId: "course-create" },
      initialMessage: message,
    });

    // The fire-and-forget send is async — wait for it to resolve
    await waitFor(() => {
      expect(sendFn).toHaveBeenCalledWith(tab.sessionId, message);
    });
  });

  it("sends initialMessage verbatim (callers are responsible for trimming)", async () => {
    const tab = makeTab();
    const { client } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);

    const sendFn = vi.fn().mockReturnValue((async function* () {})());
    // biome-ignore lint/suspicious/noExplicitAny: overwriting session for spy purposes
    (client.session as any).send = sendFn;

    const rawMessage = "learn calculus deeply";

    await openSessionInTab({
      client,
      navigate,
      startOpts: { modeId: "course-create" },
      initialMessage: rawMessage,
    });

    await waitFor(() => {
      expect(sendFn).toHaveBeenCalledWith(tab.sessionId, rawMessage);
    });
  });

  it("does not block navigation when initialMessage send fails", async () => {
    const tab = makeTab();
    const { client } = makeClient(tab);
    const navigate = vi.fn().mockResolvedValue(undefined);

    // Return a rejected promise wrapped in an async iterable — triggers the
    // fire-and-forget catch path without needing a generator body.
    const failingIterable: AsyncIterable<never> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => Promise.reject(new Error("send failed")),
          return: () => Promise.resolve({ done: true as const, value: undefined }),
        };
      },
    };
    const sendFn = vi.fn().mockReturnValue(failingIterable);
    // biome-ignore lint/suspicious/noExplicitAny: overwriting session for spy purposes
    (client.session as any).send = sendFn;

    // Should not throw even though send fails
    const result = await openSessionInTab({
      client,
      navigate,
      startOpts: { modeId: "course-create" },
      initialMessage: "hello",
    });

    expect(result).toBe(tab.id);
    expect(navigate).toHaveBeenCalled();
  });
});
