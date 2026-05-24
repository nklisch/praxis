import type { PackSummaryClient } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PacksSection } from "../components/library/packs-section.js";

afterEach(() => {
  cleanup();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePack(overrides: Partial<PackSummaryClient> = {}): PackSummaryClient {
  return {
    id: "algebra-1",
    version: "1.0.0",
    name: "Algebra 1 (CCSS)",
    subject: "math.algebra-1",
    gradeLevel: "9-12",
    conceptCount: 32,
    edgeCount: 40,
    imported: false,
    ...overrides,
  };
}

function renderSection(
  packs: ReadonlyArray<PackSummaryClient> | undefined,
  opts: {
    loading?: boolean;
    importing?: string | null;
    onUsePack?: (id: string, name: string) => void;
  } = {},
) {
  const { loading = false, importing = null, onUsePack = vi.fn() } = opts;
  return render(
    <PacksSection packs={packs} loading={loading} onUsePack={onUsePack} importing={importing} />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PacksSection", () => {
  it("renders the PACKS kicker", () => {
    renderSection([]);
    expect(screen.getByText("PACKS")).toBeDefined();
  });

  it("shows loading state when loading=true", () => {
    renderSection(undefined, { loading: true });
    // LoadingState renders "loading…"
    expect(screen.getByText("loading…")).toBeDefined();
  });

  it("shows empty state when packs array is empty", () => {
    renderSection([]);
    // COPY.empty.libraryPacksEmpty
    expect(screen.getByText(/No knowledge packs available/)).toBeDefined();
  });

  it("shows empty state when packs is undefined and not loading", () => {
    renderSection(undefined, { loading: false });
    expect(screen.getByText(/No knowledge packs available/)).toBeDefined();
  });

  it("renders pack name and deck for each pack", async () => {
    renderSection([makePack()]);
    await waitFor(() => {
      expect(screen.getByText("Algebra 1 (CCSS)")).toBeDefined();
      expect(screen.getByText(/math\.algebra-1/)).toBeDefined();
      expect(screen.getByText(/32 concepts/)).toBeDefined();
    });
  });

  it("shows 'Use this pack' button for non-imported packs", async () => {
    renderSection([makePack({ imported: false })]);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Use this pack/i })).toBeDefined();
    });
  });

  it("shows 'Imported' badge for imported packs (no button)", async () => {
    renderSection([makePack({ imported: true })]);
    await waitFor(() => {
      expect(screen.getByText("Imported")).toBeDefined();
    });
    expect(screen.queryByRole("button", { name: /Use this pack/i })).toBeNull();
  });

  it("'Use this pack' button calls onUsePack with packId and packName", async () => {
    const onUsePack = vi.fn();
    renderSection([makePack({ imported: false })], { onUsePack });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Use this pack/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /Use this pack/i }));
    expect(onUsePack).toHaveBeenCalledWith("algebra-1", "Algebra 1 (CCSS)");
  });

  it("'Use this pack' button is disabled while that pack is importing", async () => {
    renderSection([makePack({ imported: false })], { importing: "algebra-1" });
    await waitFor(() => {
      const btn = screen.queryByRole("button", { name: /Importing…/i });
      expect(btn).not.toBeNull();
      expect((btn as HTMLButtonElement | null)?.disabled).toBe(true);
    });
  });

  it("only the importing pack's button is disabled when multiple packs present", async () => {
    const packs = [
      makePack({ id: "algebra-1", name: "Algebra 1 (CCSS)", imported: false }),
      makePack({ id: "geometry", name: "Geometry (CCSS)", imported: false }),
    ];
    renderSection(packs, { importing: "algebra-1" });
    await waitFor(() => {
      expect(screen.getByText("Algebra 1 (CCSS)")).toBeDefined();
    });
    const importingBtn = screen.queryByRole("button", { name: /Importing…/i });
    expect(importingBtn).not.toBeNull();
    expect((importingBtn as HTMLButtonElement | null)?.disabled).toBe(true);

    const otherBtn = screen.getByRole("button", { name: /Use this pack/i });
    expect(otherBtn.getAttribute("disabled")).toBeNull();
  });

  it("renders multiple packs", async () => {
    const packs = [
      makePack({ id: "algebra-1", name: "Algebra 1 (CCSS)" }),
      makePack({ id: "geometry", name: "Geometry (CCSS)", imported: true }),
    ];
    renderSection(packs);
    await waitFor(() => {
      expect(screen.getByText("Algebra 1 (CCSS)")).toBeDefined();
      expect(screen.getByText("Geometry (CCSS)")).toBeDefined();
    });
  });
});
