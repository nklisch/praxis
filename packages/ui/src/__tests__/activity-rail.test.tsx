/**
 * Tests for <ActivityRail> component.
 *
 * Verifies:
 * - Empty items → component returns null (no <aside>).
 * - One running item → row with ° glyph + italic label.
 * - One done item → row with · glyph.
 * - One failed item → row with ⌖ glyph + dismiss button.
 * - Dismiss button click → dismiss callback invoked.
 */
import type { ActivityItem, PraxisClient } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { ActivityRail } from "../components/activity-rail.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

function makeItem(overrides: Partial<ActivityItem> & { id: string; label: string }): ActivityItem {
  return {
    status: "running",
    startedAt: Date.now() as ActivityItem["startedAt"],
    ...overrides,
  };
}

async function* neverStream(): AsyncGenerator<never, void, unknown> {
  // Yield nothing — stream stays open until unmount.
  await new Promise(() => {});
}

function makeClient(
  items: readonly ActivityItem[],
  dismissFn = vi.fn().mockResolvedValue(undefined),
): PraxisClient {
  return makeFakeClient({
    activity: {
      events: vi.fn(async function* () {
        // Deliver snapshot immediately
        yield { kind: "snapshot" as const, items };
        // Then hold open
        await new Promise(() => {});
      }),
      dismiss: dismissFn,
    } as PraxisClient["activity"],
  });
}

function renderRail(items: readonly ActivityItem[], dismissFn = vi.fn()) {
  const client = makeClient(items, dismissFn);
  return render(
    <PraxisClientProvider client={client}>
      <ActivityRail />
    </PraxisClientProvider>,
  );
}

describe("ActivityRail", () => {
  it("empty items — component renders null (no aside)", () => {
    renderRail([]);
    expect(document.querySelector("aside")).toBeNull();
  });

  it("one running item — aside visible, ° glyph, label text", async () => {
    const { findByRole } = renderRail([makeItem({ id: "x", label: "reading algebra" })]);
    const aside = await findByRole("complementary");
    expect(aside).toBeDefined();
    expect(aside.textContent).toContain("°");
    expect(aside.textContent).toContain("reading algebra");
  });

  it("one done item — · glyph visible", async () => {
    const { findByRole } = renderRail([
      makeItem({ id: "x", label: "indexing", status: "done", endedAt: Date.now() as ActivityItem["endedAt"] }),
    ]);
    const aside = await findByRole("complementary");
    expect(aside.textContent).toContain("·");
  });

  it("one failed item — ⌖ glyph + dismiss button visible", async () => {
    const { findByRole, findByLabelText } = renderRail([
      makeItem({ id: "x", label: "reading", status: "failed" }),
    ]);
    const aside = await findByRole("complementary");
    expect(aside.textContent).toContain("⌖");
    const btn = await findByLabelText("Dismiss reading");
    expect(btn).toBeDefined();
  });

  it("dismiss button click — dismiss called with item id", async () => {
    const dismissFn = vi.fn().mockResolvedValue(undefined);
    const { findByLabelText } = renderRail(
      [makeItem({ id: "failed-item", label: "failed work", status: "failed" })],
      dismissFn,
    );
    const btn = await findByLabelText("Dismiss failed work");
    fireEvent.click(btn);
    // allow microtask
    await new Promise((r) => setTimeout(r, 0));
    expect(dismissFn).toHaveBeenCalledWith("failed-item");
  });

  it("multiple items — all render as list items", async () => {
    const { findAllByRole } = renderRail([
      makeItem({ id: "a", label: "task a" }),
      makeItem({ id: "b", label: "task b" }),
    ]);
    const listItems = await findAllByRole("listitem");
    expect(listItems).toHaveLength(2);
  });
});
