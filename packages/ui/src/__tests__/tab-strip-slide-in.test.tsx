/**
 * Tests for the tab slide-in animation in <TabStrip>.
 *
 * Verifies that newly-added tabs receive the .tabNew CSS class (which triggers
 * the tabSlideIn keyframe), and that tabs present from the first render do not
 * get the animation class.
 */
import type { TabId, TabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabStrip } from "../components/tab-strip.js";

afterEach(() => cleanup());

function makeTab(overrides: Partial<TabSummary> = {}): TabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "teach",
    title: "teach · new chat",
    sortOrder: 0,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 5_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function renderStrip(
  tabs: TabSummary[],
  activeTabId: TabId | null = null,
  onSwitch = vi.fn(),
  onClose = vi.fn(),
  onNew = vi.fn(),
) {
  return render(
    <TabStrip
      tabs={tabs}
      activeTabId={activeTabId}
      onSwitch={onSwitch}
      onClose={onClose}
      onNew={onNew}
    />,
  );
}

describe("TabStrip — slide-in animation", () => {
  it("new tab gets data-new-tab attribute when added after initial render", async () => {
    const tab1 = makeTab({ id: brandId<"TabId">("t1"), title: "algebra" });
    const tab2 = makeTab({
      id: brandId<"TabId">("t2"),
      title: "calculus",
      sortOrder: 1,
    });

    const { rerender, container } = renderStrip([tab1]);

    // Add tab2 — it's new
    await act(async () => {
      rerender(
        <TabStrip
          tabs={[tab1, tab2]}
          activeTabId={null}
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNew={vi.fn()}
        />,
      );
    });

    const newTabButton = container.querySelector('[data-new-tab="true"]');
    expect(newTabButton).not.toBeNull();
  });

  it("tabs present from initial render do not get the new-tab attribute", async () => {
    const tab1 = makeTab({ id: brandId<"TabId">("t1"), title: "algebra" });

    const { container } = renderStrip([tab1]);

    // tab1 was present from the start — it should NOT be marked as new
    const newTabButton = container.querySelector('[data-new-tab="true"]');
    expect(newTabButton).toBeNull();
  });

  it("tab that was already seen does not get new-tab attribute when re-rendered", async () => {
    const tab1 = makeTab({ id: brandId<"TabId">("t1"), title: "algebra" });

    const { rerender, container } = renderStrip([tab1]);

    // Re-render with same tab — should not be marked as new
    await act(async () => {
      rerender(
        <TabStrip
          tabs={[tab1]}
          activeTabId={null}
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNew={vi.fn()}
        />,
      );
    });

    const newTabButton = container.querySelector('[data-new-tab="true"]');
    expect(newTabButton).toBeNull();
  });

  it("animation class is cleared after the animation duration", async () => {
    vi.useFakeTimers();

    const tab1 = makeTab({ id: brandId<"TabId">("t1"), title: "algebra" });
    const tab2 = makeTab({
      id: brandId<"TabId">("t2"),
      title: "calculus",
      sortOrder: 1,
    });

    const { rerender, container } = renderStrip([tab1]);

    await act(async () => {
      rerender(
        <TabStrip
          tabs={[tab1, tab2]}
          activeTabId={null}
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNew={vi.fn()}
        />,
      );
    });

    // Right after rerender — tab2 should be marked new
    let newTabButton = container.querySelector('[data-new-tab="true"]');
    expect(newTabButton).not.toBeNull();

    // Advance past the 250ms cleanup timer
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Now the new-tab attribute should be gone
    newTabButton = container.querySelector('[data-new-tab="true"]');
    expect(newTabButton).toBeNull();

    vi.useRealTimers();
  });

  it("only the newly added tab gets the animation class, not existing ones", async () => {
    const tab1 = makeTab({ id: brandId<"TabId">("t1"), title: "algebra" });
    const tab2 = makeTab({
      id: brandId<"TabId">("t2"),
      title: "calculus",
      sortOrder: 1,
    });
    const tab3 = makeTab({
      id: brandId<"TabId">("t3"),
      title: "physics",
      sortOrder: 2,
    });

    // Start with two tabs
    const { rerender, container } = renderStrip([tab1, tab2]);

    // Add a third
    await act(async () => {
      rerender(
        <TabStrip
          tabs={[tab1, tab2, tab3]}
          activeTabId={null}
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNew={vi.fn()}
        />,
      );
    });

    // Only tab3 should be new
    const newTabButtons = container.querySelectorAll('[data-new-tab="true"]');
    expect(newTabButtons.length).toBe(1);
  });
});
