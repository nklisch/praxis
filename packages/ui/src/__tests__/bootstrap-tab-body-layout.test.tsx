/**
 * Layout regression test for BootstrapTabBody.
 *
 * Specifically guards against the vertical-space collapse bug:
 * when the sub-agents panel is hidden, its space must be fully
 * reclaimed by the draft scroll area.
 *
 * The fix introduces two structural wrappers in the right outline pane:
 *   .draftScroll  — flex:1 scrollable area that always fills available height
 *   .subAgentRow  — flex-shrink:0 anchor at the bottom for SubAgentPanel
 *
 * jsdom has no real layout engine, so these tests verify the DOM structure
 * and CSS-module class names, not computed heights. The class-name assertions
 * are the machine-checkable proxy for the layout invariant.
 */
import type { SessionTabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// Heavy sub-components — mock to isolate layout concerns.
vi.mock("../components/chat-tab-body.js", () => ({
  TeachChatTabBody: () => <div data-testid="chat-pane" />,
}));
vi.mock("../components/draft-card.js", () => ({
  DraftCard: () => <div data-testid="draft-card" />,
}));
vi.mock("../hooks/use-drafts.js", () => ({
  useDrafts: () => ({ current: null }),
}));
vi.mock("../hooks/use-bootstrap-budget.js", () => ({
  BOOTSTRAP_BUDGET_MIN: 5,
  BOOTSTRAP_BUDGET_MAX: 200,
  useBootstrapBudget: () => ({ maxSteps: 100, saving: false, setMaxSteps: vi.fn() }),
}));

// Import BootstrapTabBody AFTER mocks (Vitest hoists vi.mock calls).
const { BootstrapTabBody } = await import("../components/bootstrap-tab-body.js");

afterEach(() => cleanup());

function makeTab(overrides: Partial<SessionTabSummary> = {}): SessionTabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "bootstrap",
    title: "bootstrap",
    sortOrder: 0,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 5_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function renderBootstrap(subAgentCallId: string | null) {
  // Mock useCurrentSubAgent inside the module via the hook's own module.
  vi.doMock("../hooks/use-current-sub-agent.js", () => ({
    useCurrentSubAgent: () => subAgentCallId,
  }));

  const client = makeFakeClient({
    subAgent: {
      list: vi.fn().mockResolvedValue([]),
      events: vi.fn(async function* () {}),
    } as unknown as ReturnType<typeof makeFakeClient>["subAgent"],
  });

  return render(
    <PraxisClientProvider client={client}>
      <BootstrapTabBody tab={makeTab()} />
    </PraxisClientProvider>,
  );
}

describe("BootstrapTabBody — outline pane layout structure", () => {
  it("draftScroll wrapper exists and encloses the draft area", () => {
    const { container } = renderBootstrap(null);
    // CSS modules mangle class names; look for the substring "draftScroll" in
    // any class. This class carries flex:1 + overflow-y:auto — the key layout rule.
    const draftScrollEl = Array.from(container.querySelectorAll("*")).find((el) =>
      Array.from(el.classList).some((c) => /draftScroll/.test(c)),
    );
    expect(draftScrollEl, "draftScroll wrapper must exist in outline pane").toBeTruthy();
  });

  it("subAgentRow wrapper exists and encloses the SubAgentPanel slot", () => {
    const { container } = renderBootstrap(null);
    // subAgentRow carries flex-shrink:0 — ensures the panel row never steals
    // space from the draft scroll area.
    const subAgentRowEl = Array.from(container.querySelectorAll("*")).find((el) =>
      Array.from(el.classList).some((c) => /subAgentRow/.test(c)),
    );
    expect(subAgentRowEl, "subAgentRow wrapper must exist in outline pane").toBeTruthy();
  });

  it("subAgentRow is a sibling of draftScroll, not a descendant", () => {
    const { container } = renderBootstrap(null);
    const draftScrollEl = Array.from(container.querySelectorAll("*")).find((el) =>
      Array.from(el.classList).some((c) => /draftScroll/.test(c)),
    );
    const subAgentRowEl = Array.from(container.querySelectorAll("*")).find((el) =>
      Array.from(el.classList).some((c) => /subAgentRow/.test(c)),
    );
    expect(draftScrollEl).toBeTruthy();
    expect(subAgentRowEl).toBeTruthy();
    // subAgentRow must NOT be inside draftScroll — if it were, the panel's
    // height would be included in the scrollable region rather than anchored
    // below it, causing the space-reservation bug.
    expect(draftScrollEl?.contains(subAgentRowEl ?? null)).toBe(false);
  });

  it("subAgentRow renders nothing visible when no sub-agent is active", () => {
    const { container } = renderBootstrap(null);
    const subAgentRowEl = Array.from(container.querySelectorAll("*")).find((el) =>
      Array.from(el.classList).some((c) => /subAgentRow/.test(c)),
    );
    // When parentCallId === null, SubAgentPanel returns null — so subAgentRow
    // has no child elements (empty wrapper = no reserved height in real layout).
    expect(subAgentRowEl?.childElementCount).toBe(0);
  });
});
