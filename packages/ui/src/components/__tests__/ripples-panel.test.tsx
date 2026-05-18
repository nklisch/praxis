/**
 * Tests for <RipplesPanel />.
 *
 * Verifies:
 * - Shows "—" when no candidate is selected (idle state).
 * - Calls computeRipples when elementId + candidateId are set.
 * - Renders correct numbers for each stat.
 * - Shows error hint when computeRipples throws.
 */

import type { ConceptId, ConceptMapId, RippleSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { RipplesPanel } from "../ripples-panel.js";

afterEach(() => cleanup());

const MAP_ID = brandId<"ConceptMapId">("map-test") as ConceptMapId;
const ELEMENT_ID = "shape:node-1";
const CANDIDATE_ID = brandId<"ConceptId">("concept-algebra") as ConceptId;

function makeClient(computeRipples?: (input: unknown) => Promise<RippleSummary>) {
  return makeFakeClient({
    conceptMaps: {
      computeRipples: computeRipples
        ? vi.fn().mockImplementation(computeRipples)
        : vi
            .fn()
            .mockResolvedValue({ conceptCountDelta: 2, notesRetagged: 3, tutorRefsAffected: 1 }),
    } as unknown as import("@praxis/core/types").PraxisClient["conceptMaps"],
  });
}

function renderPanel(props: {
  elementId?: string | null;
  candidateId?: ConceptId | null;
  client?: ReturnType<typeof makeClient>;
}) {
  const client = props.client ?? makeClient();
  return render(
    <PraxisClientProvider client={client}>
      <RipplesPanel
        mapId={MAP_ID}
        elementId={props.elementId ?? null}
        candidateId={props.candidateId ?? null}
      />
    </PraxisClientProvider>,
  );
}

describe("<RipplesPanel />", () => {
  it("renders the panel in idle state (—) when no candidate is selected", async () => {
    renderPanel({ elementId: null, candidateId: null });

    // All stats should show "—" when idle.
    const stats = screen.getAllByText("—");
    expect(stats.length).toBeGreaterThanOrEqual(3);
  });

  it("calls computeRipples and renders correct numbers", async () => {
    const ripples: RippleSummary = { conceptCountDelta: 2, notesRetagged: 5, tutorRefsAffected: 1 };
    const client = makeClient(async () => ripples);

    renderPanel({ elementId: ELEMENT_ID, candidateId: CANDIDATE_ID, client });

    await waitFor(() => {
      // conceptCountDelta = +2 (formatted with +)
      expect(screen.getByTestId("ripple-stat-concept-delta")).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.getByText("+2")).toBeDefined();
      expect(screen.getByText("5")).toBeDefined();
      expect(screen.getByText("1")).toBeDefined();
    });

    expect(client.conceptMaps.computeRipples).toHaveBeenCalledWith({
      mapId: MAP_ID,
      elementId: ELEMENT_ID,
      candidateId: CANDIDATE_ID,
    });
  });

  it("shows loading indicator while fetching", async () => {
    // Return a promise that never resolves to observe loading state.
    let resolveRipples!: (r: RippleSummary) => void;
    const pending = new Promise<RippleSummary>((res) => {
      resolveRipples = res;
    });
    const client = makeClient(async () => pending);

    renderPanel({ elementId: ELEMENT_ID, candidateId: CANDIDATE_ID, client });

    // Panel should be rendering (loading dot present) while fetch is in-flight.
    await waitFor(() => {
      expect(screen.getByLabelText("Loading")).toBeDefined();
    });

    // Resolve to clean up the pending promise.
    resolveRipples({ conceptCountDelta: 0, notesRetagged: 0, tutorRefsAffected: 0 });
  });

  it("shows error hint when computeRipples throws", async () => {
    const client = makeClient(async () => {
      throw new Error("ripples failed");
    });

    renderPanel({ elementId: ELEMENT_ID, candidateId: CANDIDATE_ID, client });

    await waitFor(() => {
      expect(screen.getByText("Could not compute ripples.")).toBeDefined();
    });
  });

  it("resets to idle when elementId becomes null", async () => {
    const ripples: RippleSummary = { conceptCountDelta: 1, notesRetagged: 0, tutorRefsAffected: 0 };
    const client = makeClient(async () => ripples);

    const { rerender } = render(
      <PraxisClientProvider client={client}>
        <RipplesPanel mapId={MAP_ID} elementId={ELEMENT_ID} candidateId={CANDIDATE_ID} />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("+1")).toBeDefined();
    });

    // Now clear the candidate.
    rerender(
      <PraxisClientProvider client={client}>
        <RipplesPanel mapId={MAP_ID} elementId={null} candidateId={null} />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      const stats = screen.getAllByText("—");
      expect(stats.length).toBeGreaterThanOrEqual(3);
    });
  });
});
