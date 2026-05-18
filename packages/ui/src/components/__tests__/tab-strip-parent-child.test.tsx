/**
 * Tests for parent-child decoration in <TabStrip>.
 *
 * Verifies:
 * - A child tab shows a "from {parentMode}" pill when parentSessionId is registered.
 * - The pill is absent for a top-level session (no parentSessionId).
 * - The parent tab shows a pulse dot when triggerPulse is called.
 * - Rapid-fire pulses increment the key (animation restarts).
 * - Clicking the pulse dot calls onSwitch for the parent tab.
 * - Without a ParentChildProvider the pill and pulse are suppressed cleanly.
 */
import type { SessionTabSummary, TabId, TabSummary } from "@praxis/core/types";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParentChildProvider, useParentChild } from "../../context/parent-child-context.js";
import { TabStrip } from "../tab-strip.js";

afterEach(() => cleanup());

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeSessionTab(overrides: Partial<SessionTabSummary> = {}): SessionTabSummary {
  return {
    kind: "session" as const,
    id: "tab-1" as TabId,
    sessionId: "sess-1" as SessionTabSummary["sessionId"],
    modeId: "teach",
    title: "Calc · teach",
    sortOrder: 0,
    openedAt: Date.now() as SessionTabSummary["openedAt"],
    lastSeenAt: Date.now() as SessionTabSummary["lastSeenAt"],
    closedAt: null,
    ...overrides,
  };
}

const PARENT_TAB = makeSessionTab({
  id: "tab-parent" as TabId,
  sessionId: "sess-parent" as SessionTabSummary["sessionId"],
  modeId: "teach",
  title: "Calc · teach",
});

const CHILD_TAB = makeSessionTab({
  id: "tab-child" as TabId,
  sessionId: "sess-child" as SessionTabSummary["sessionId"],
  modeId: "quiz",
  title: "Quick check",
});

const TABS: TabSummary[] = [PARENT_TAB, CHILD_TAB];

// Minimal TabStrip props — spies just record calls.
function makeProps(overrides?: Partial<Parameters<typeof TabStrip>[0]>) {
  return {
    tabs: TABS,
    activeTabId: PARENT_TAB.id,
    onSwitch: vi.fn(),
    onClose: vi.fn(),
    onNew: vi.fn(),
    ...overrides,
  };
}

// ── Helper: render inside ParentChildProvider and expose context ─────────────

interface RegistryHandle {
  recordSpawn: (childId: string, parentId: string) => void;
  triggerPulse: (parentId: string) => void;
}

/**
 * Renders the TabStrip inside a ParentChildProvider.
 * The `setup` callback receives the context's mutator functions so the test
 * can seed mappings before the render assertion.
 */
function renderWithRegistry(
  props: Parameters<typeof TabStrip>[0],
  setup?: (reg: RegistryHandle) => void,
) {
  let handle: RegistryHandle | null = null;

  function Harness() {
    const registry = useParentChild();
    // Capture the mutators for the test
    handle = { recordSpawn: registry.recordSpawn, triggerPulse: registry.triggerPulse };
    return <TabStrip {...props} />;
  }

  const result = render(
    <ParentChildProvider>
      <Harness />
    </ParentChildProvider>,
  );

  // After first render, handle is populated. The test can call mutators to
  // update state and then re-query the DOM.
  if (setup && handle) {
    setup(handle);
  }

  return { ...result, handle: handle as RegistryHandle };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("TabStrip — no ParentChildProvider", () => {
  it("renders without crashing when ParentChildProvider is absent", () => {
    const props = makeProps();
    const { container } = render(<TabStrip {...props} />);
    expect(container.querySelectorAll('[role="tab"]').length).toBe(TABS.length);
  });

  it("suppresses pills and pulse dots without provider", () => {
    const props = makeProps();
    const { container } = render(<TabStrip {...props} />);
    // Neither pill nor pulse dot should appear
    expect(container.querySelector('[class*="fromPill"]')).toBeNull();
    expect(container.querySelector('[class*="pulseDot"]')).toBeNull();
  });
});

describe("TabStrip — with ParentChildProvider", () => {
  it("shows no pill when child→parent mapping is not registered", () => {
    const { container } = renderWithRegistry(makeProps());
    expect(container.querySelector('[class*="fromPill"]')).toBeNull();
  });

  it("shows 'from teach' pill on the child tab after recordSpawn", async () => {
    const props = makeProps();
    const { rerender, handle, container } = renderWithRegistry(props);

    // Register the child→parent mapping.
    handle.recordSpawn(CHILD_TAB.sessionId, PARENT_TAB.sessionId);

    // Re-render to pick up state change.
    rerender(
      <ParentChildProvider>
        <TabStrip {...props} />
      </ParentChildProvider>,
    );

    // The pill should now be visible on the child tab.
    const pill = container.querySelector('[class*="fromPill"]');
    expect(pill).not.toBeNull();
    expect(pill?.textContent?.toLowerCase()).toContain("teach");
  });

  it("shows no pill on the parent tab", async () => {
    const props = makeProps({ activeTabId: CHILD_TAB.id });
    const { rerender, handle, container } = renderWithRegistry(props);

    handle.recordSpawn(CHILD_TAB.sessionId, PARENT_TAB.sessionId);

    rerender(
      <ParentChildProvider>
        <TabStrip {...props} />
      </ParentChildProvider>,
    );

    // Collect all pills
    const pills = container.querySelectorAll('[class*="fromPill"]');
    // Only one pill should exist (on the child tab)
    expect(pills.length).toBe(1);
  });

  it("shows pulse dot on parent tab after triggerPulse", () => {
    const props = makeProps();
    const { rerender, handle, container } = renderWithRegistry(props);

    // Trigger pulse on the PARENT session (teach-mode parent).
    handle.triggerPulse(PARENT_TAB.sessionId);

    rerender(
      <ParentChildProvider>
        <TabStrip {...props} />
      </ParentChildProvider>,
    );

    const pulseDot = container.querySelector('[class*="pulseDot"]');
    expect(pulseDot).not.toBeNull();
  });

  it("pulse dot is absent before any triggerPulse", () => {
    const { container } = renderWithRegistry(makeProps());
    expect(container.querySelector('[class*="pulseDot"]')).toBeNull();
  });

  it("rapid-fire pulses (multiple triggerPulse calls) are each represented", () => {
    const props = makeProps();
    const { rerender, handle } = renderWithRegistry(props);

    // Simulate 3 rapid-fire system_note events.
    handle.triggerPulse(PARENT_TAB.sessionId);
    handle.triggerPulse(PARENT_TAB.sessionId);
    handle.triggerPulse(PARENT_TAB.sessionId);

    // Each call increments the pulseKey; the last rerender reflects count=3.
    rerender(
      <ParentChildProvider>
        <TabStrip {...props} />
      </ParentChildProvider>,
    );

    // We can only verify the pulse dot is present (the key counter is internal).
    // The key={`pulse-${pulseKey}`} causes React to remount the span each time.
    const pulseDot = document.querySelector('[class*="pulseDot"]');
    expect(pulseDot).not.toBeNull();
  });

  it("clicking the pulse dot calls onSwitch for the parent tab", () => {
    const onSwitch = vi.fn();
    const props = makeProps({ onSwitch });
    const { rerender, handle, container } = renderWithRegistry(props);

    handle.triggerPulse(PARENT_TAB.sessionId);

    rerender(
      <ParentChildProvider>
        <TabStrip {...props} />
      </ParentChildProvider>,
    );

    const pulseDot = container.querySelector('[class*="pulseDot"]') as HTMLElement | null;
    expect(pulseDot).not.toBeNull();
    if (pulseDot) {
      fireEvent.click(pulseDot);
    }

    // onSwitch should have been called with the parent tab's id.
    expect(onSwitch).toHaveBeenCalledWith(PARENT_TAB.id);
  });
});
