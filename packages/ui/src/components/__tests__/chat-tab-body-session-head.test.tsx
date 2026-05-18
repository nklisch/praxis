/**
 * Tests for TeachChatTabBody post Refined Bubbles restyle:
 * 1. Confirms <SessionHead> mounts in the tab body (kicker + title visible).
 * 2. Preserves tab-body-isolation: all tab bodies mount simultaneously;
 *    inactive ones are hidden via display:none in the PARENT — this component
 *    itself does NOT manage visibility (that is the parent's job, per the pattern).
 *    We verify the component renders cleanly and contains its session head.
 */
import type { PraxisClient, SessionTabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { AuthProvider } from "../../context/auth-context.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { TeachChatTabBody } from "../chat-tab-body.js";

afterEach(() => cleanup());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ tabId: undefined }),
    useSearch: () => ({}),
  };
});

function makeSessionTab(overrides: Partial<SessionTabSummary> = {}): SessionTabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "teach",
    title: "algebra · L3",
    sortOrder: 0,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 5_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function makeClient(): PraxisClient {
  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("session-1"),
        modeId: "teach",
        startedAt: Date.now() as Timestamp,
      }),
      end: vi.fn().mockResolvedValue(null),
      send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
      list: vi.fn().mockResolvedValue([]),
      spawnFromAssignment: vi.fn().mockResolvedValue(null),
    },
    memory: {
      episodic: vi.fn(async function* () {}),
      studentModel: vi.fn(),
      misconceptions: vi.fn(),
      procedural: vi.fn(),
      affective: vi.fn(),
      export: vi.fn(),
      delete: vi.fn(),
    } as unknown as PraxisClient["memory"],
    assignments: {
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      getResponses: vi.fn().mockResolvedValue([]),
      recordResponse: vi.fn().mockResolvedValue(undefined),
      submit: vi.fn().mockResolvedValue(null),
    },
    quickCheck: {
      events: vi.fn(async function* () {}),
    } as unknown as PraxisClient["quickCheck"],
  });
}

function renderTeachTab(tab: SessionTabSummary, client: PraxisClient = makeClient()) {
  return render(
    <PraxisClientProvider client={client}>
      <AuthProvider>
        <TeachChatTabBody tab={tab} />
      </AuthProvider>
    </PraxisClientProvider>,
  );
}

describe("TeachChatTabBody — SessionHead integration", () => {
  it("renders a <header> element for the session head", async () => {
    const { container } = renderTeachTab(makeSessionTab());
    await waitFor(() => {
      expect(container.querySelector("header")).not.toBeNull();
    });
  });

  it("displays the session title from the tab in the session head", async () => {
    const { container } = renderTeachTab(makeSessionTab({ title: "algebra · L3" }));
    await waitFor(() => {
      expect(container.textContent).toContain("algebra · L3");
    });
  });

  it("displays the mode label (teach) in the session head kicker", async () => {
    const { container } = renderTeachTab(makeSessionTab({ modeId: "teach" }));
    await waitFor(() => {
      expect(container.textContent).toContain("teach");
    });
  });

  it("renders the session title in an h1 inside the header", async () => {
    const { container } = renderTeachTab(makeSessionTab({ title: "Chain rule" }));
    await waitFor(() => {
      const h1 = container.querySelector("h1");
      expect(h1?.textContent).toBe("Chain rule");
    });
  });

  it("mounts and renders without errors (tab-body-isolation: component does not manage its own visibility)", () => {
    // Per the tab-body-isolation pattern, all tab bodies mount at once and visibility
    // is controlled by display:none in the PARENT (chat.tsx). This test verifies the
    // component itself mounts cleanly regardless of whether it is "active" — there is
    // no internal visibility toggle.
    expect(() => renderTeachTab(makeSessionTab())).not.toThrow();
  });
});
