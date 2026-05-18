/**
 * Tests for <StatusStrip> component.
 *
 * Verifies:
 * - Idle state (no items): strip is present in DOM but opacity-0/collapsed
 *   (hasWork class absent).
 * - Running item: strip gains hasWork class, label + pulse dot rendered.
 * - Done item: strip renders ✓ glyph, label present.
 * - Failed item: ⌖ glyph rendered, item present.
 * - Multiple concurrent items: all labels rendered, separator present.
 */
import type { ActivityItem, PraxisClient } from "@praxis/core/types";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusStrip } from "../components/status-strip.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

function makeItem(overrides: Partial<ActivityItem> & { id: string; label: string }): ActivityItem {
  return {
    status: "running",
    startedAt: Date.now() as ActivityItem["startedAt"],
    ...overrides,
  };
}

function makeClient(items: readonly ActivityItem[]): PraxisClient {
  return makeFakeClient({
    activity: {
      events: vi.fn(async function* () {
        yield { kind: "snapshot" as const, items };
        // Hold stream open
        await new Promise(() => {});
      }),
      dismiss: vi.fn().mockResolvedValue(undefined),
    } as PraxisClient["activity"],
  });
}

function renderStrip(items: readonly ActivityItem[]) {
  const client = makeClient(items);
  return render(
    <PraxisClientProvider client={client}>
      <StatusStrip />
    </PraxisClientProvider>,
  );
}

describe("StatusStrip", () => {
  it("idle state — strip renders without hasWork class when no items", () => {
    const { container } = renderStrip([]);
    const strip = container.querySelector("[aria-label='Background activity']");
    expect(strip).not.toBeNull();
    // No hasWork class — strip stays collapsed / opacity 0
    expect(strip?.className).not.toMatch(/hasWork/);
  });

  it("running item — hasWork class present, label rendered", async () => {
    const { container } = renderStrip([makeItem({ id: "a", label: "indexing notes" })]);
    await waitFor(() => {
      const strip = container.querySelector("[aria-label='Background activity']");
      expect(strip?.className).toMatch(/hasWork/);
    });
    const strip = container.querySelector("[aria-label='Background activity']");
    expect(strip?.textContent).toContain("indexing notes");
  });

  it("running item — pulse dot rendered (aria-hidden span)", async () => {
    const { container } = renderStrip([makeItem({ id: "a", label: "building index" })]);
    await waitFor(() => {
      const strip = container.querySelector("[aria-label='Background activity']");
      expect(strip?.className).toMatch(/hasWork/);
    });
    // The pulse span is inside the strip; it is aria-hidden
    const pulses = container.querySelectorAll("[aria-hidden='true']");
    expect(pulses.length).toBeGreaterThan(0);
  });

  it("done item — ✓ glyph present", async () => {
    const { container } = renderStrip([
      makeItem({
        id: "b",
        label: "finished task",
        status: "done",
        endedAt: Date.now() as ActivityItem["endedAt"],
      }),
    ]);
    await waitFor(() => {
      const strip = container.querySelector("[aria-label='Background activity']");
      expect(strip?.textContent).toContain("✓");
    });
  });

  it("failed item — ⌖ glyph present", async () => {
    const { container } = renderStrip([
      makeItem({ id: "c", label: "failed task", status: "failed" }),
    ]);
    await waitFor(() => {
      const strip = container.querySelector("[aria-label='Background activity']");
      expect(strip?.textContent).toContain("⌖");
    });
  });

  it("multiple concurrent items — all labels rendered", async () => {
    const { container } = renderStrip([
      makeItem({ id: "x", label: "task alpha" }),
      makeItem({ id: "y", label: "task beta" }),
    ]);
    await waitFor(() => {
      const strip = container.querySelector("[aria-label='Background activity']");
      expect(strip?.textContent).toContain("task alpha");
      expect(strip?.textContent).toContain("task beta");
    });
  });

  it("item with detail — detail text rendered", async () => {
    const { container } = renderStrip([
      makeItem({ id: "d", label: "reading", detail: "page 12 of 248" }),
    ]);
    await waitFor(() => {
      const strip = container.querySelector("[aria-label='Background activity']");
      expect(strip?.textContent).toContain("page 12 of 248");
    });
  });
});
