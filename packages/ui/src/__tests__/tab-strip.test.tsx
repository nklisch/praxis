/**
 * Tests for the TabStrip component.
 *
 * Verifies:
 * - Renders one tab per element with mode ornament and title
 * - Active tab has aria-selected=true
 * - Clicking a tab fires onSwitch with the tabId
 * - Clicking the close button fires onClose and NOT onSwitch
 * - Middle-click on a tab fires onClose
 * - "+" fires onNew
 */
import type { TabId, TabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function renderStrip({
  tabs,
  activeTabId = null,
  onSwitch = vi.fn(),
  onClose = vi.fn(),
  onNew = vi.fn(),
}: {
  tabs: TabSummary[];
  activeTabId?: TabId | null;
  onSwitch?: (tabId: TabId) => void;
  onClose?: (tabId: TabId) => void;
  onNew?: () => void;
}) {
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

describe("TabStrip", () => {
  it("renders one tab per element with the tab title", () => {
    const tab1 = makeTab({ id: brandId<"TabId">("t1"), title: "algebra · teach" });
    const tab2 = makeTab({
      id: brandId<"TabId">("t2"),
      title: "calc · bootstrap",
      modeId: "bootstrap",
      sortOrder: 1,
    });
    renderStrip({ tabs: [tab1, tab2] });

    expect(screen.getByText("algebra · teach")).toBeDefined();
    expect(screen.getByText("calc · bootstrap")).toBeDefined();
  });

  it("renders the mode ornament for each tab", () => {
    const tab = makeTab({ modeId: "teach" }); // teach ornament = §
    renderStrip({ tabs: [tab] });

    expect(screen.getByText("§")).toBeDefined();
  });

  it("marks the active tab with aria-selected=true", () => {
    const tab = makeTab();
    renderStrip({ tabs: [tab], activeTabId: tab.id });

    const tabButton = screen.getByRole("tab");
    expect(tabButton.getAttribute("aria-selected")).toBe("true");
  });

  it("marks non-active tabs with aria-selected=false", () => {
    const tab1 = makeTab({ id: brandId<"TabId">("t1") });
    const tab2 = makeTab({ id: brandId<"TabId">("t2"), sortOrder: 1 });
    renderStrip({ tabs: [tab1, tab2], activeTabId: tab1.id });

    const tabButtons = screen.getAllByRole("tab");
    const activeCount = tabButtons.filter((b) => b.getAttribute("aria-selected") === "true").length;
    expect(activeCount).toBe(1);
  });

  it("clicking a tab calls onSwitch with its id", () => {
    const onSwitch = vi.fn();
    const tab = makeTab();
    renderStrip({ tabs: [tab], onSwitch });

    fireEvent.click(screen.getByRole("tab"));

    expect(onSwitch).toHaveBeenCalledWith(tab.id);
  });

  it("clicking the close button calls onClose and NOT onSwitch", () => {
    const onSwitch = vi.fn();
    const onClose = vi.fn();
    const tab = makeTab({ title: "algebra · teach" });
    renderStrip({ tabs: [tab], onSwitch, onClose });

    fireEvent.click(screen.getByLabelText("Close algebra · teach"));

    expect(onClose).toHaveBeenCalledWith(tab.id);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("middle-click on a tab calls onClose", () => {
    const onClose = vi.fn();
    const tab = makeTab();
    renderStrip({ tabs: [tab], onClose });

    fireEvent.mouseDown(screen.getByRole("tab"), { button: 1 });

    expect(onClose).toHaveBeenCalledWith(tab.id);
  });

  it("clicking '+' calls onNew", () => {
    const onNew = vi.fn();
    renderStrip({ tabs: [], onNew });

    fireEvent.click(screen.getByRole("button", { name: /open new session/i }));

    expect(onNew).toHaveBeenCalledOnce();
  });

  it("renders the tablist with role=tablist", () => {
    renderStrip({ tabs: [] });

    expect(screen.getByRole("tablist")).toBeDefined();
  });

  it("renders an empty strip with just the '+' button when no tabs", () => {
    renderStrip({ tabs: [] });

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
  });
});
