import type { PackSummaryClient, PraxisClient } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { PacksRoute } from "../routes/packs.js";

// TanStack Router hooks used in the route tree but not in PacksRoute directly.
// Mock to prevent errors when rendering standalone.
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

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

function makeClient(listResult: PackSummaryClient[] | "error" = [], importDelay = 0): PraxisClient {
  return {
    session: {} as PraxisClient["session"],
    artifacts: {} as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {
      listAvailable:
        listResult === "error"
          ? vi.fn().mockRejectedValue(new Error("network error"))
          : vi.fn().mockResolvedValue(listResult),
      listImported: vi.fn().mockResolvedValue([]),
      import: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  packId: "algebra-1",
                  version: "1.0.0",
                  conceptGraphId: "graph-123",
                  importedAt: Date.now(),
                }),
              importDelay,
            ),
          ),
      ),
    } as PraxisClient["packs"],
    notes: {} as PraxisClient["notes"],
    flashcards: {} as PraxisClient["flashcards"],
    claudeAuth: {} as PraxisClient["claudeAuth"],
    shell: {} as PraxisClient["shell"],
    tabs: {} as PraxisClient["tabs"],
  };
}

function renderRoute(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <PacksRoute />
    </PraxisClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PacksRoute", () => {
  it("renders the route kicker and title", async () => {
    const client = makeClient([]);
    renderRoute(client);

    expect(screen.getByText("PACKS")).toBeDefined();
    // RouteHeader renders the display title
    expect(screen.getByText("knowledge packs")).toBeDefined();
  });

  it("shows loading state initially", () => {
    const client = makeClient([]);
    renderRoute(client);
    // COPY.loading.default
    expect(screen.getByText("loading…")).toBeDefined();
  });

  it("shows empty state when there are no packs", async () => {
    const client = makeClient([]);
    renderRoute(client);

    await waitFor(() => {
      // COPY.empty.packs
      expect(screen.getByText(/No knowledge packs available/)).toBeDefined();
    });
  });

  it("shows error state when listAvailable fails", async () => {
    const client = makeClient("error");
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText(/network error/)).toBeDefined();
    });
  });

  it("renders pack cards with name, version, and metadata", async () => {
    const client = makeClient([makePack()]);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("Algebra 1 (CCSS)")).toBeDefined();
    });

    expect(screen.getByText("v1.0.0")).toBeDefined();
    expect(screen.getByText("math.algebra-1")).toBeDefined();
    expect(screen.getByText(/32 concepts/)).toBeDefined();
    expect(screen.getByText(/40 edges/)).toBeDefined();
  });

  it("shows Import button for un-imported packs", async () => {
    const client = makeClient([makePack({ imported: false })]);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Import Algebra 1/i })).toBeDefined();
    });
  });

  it("shows Imported badge for imported packs (no button)", async () => {
    const client = makeClient([makePack({ imported: true })]);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("Imported")).toBeDefined();
    });

    expect(screen.queryByRole("button", { name: /Import/i })).toBeNull();
  });

  it("Import button calls packs.import on click", async () => {
    const client = makeClient([makePack({ imported: false })]);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Import Algebra 1/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Import Algebra 1/i }));

    await waitFor(() => {
      expect(client.packs.import).toHaveBeenCalledWith("algebra-1");
    });
  });

  it("Import button is disabled while import is in flight", async () => {
    // importDelay > 0 keeps the import pending long enough to assert disabled state
    const client = makeClient([makePack({ imported: false })], 5000);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Import Algebra 1/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Import Algebra 1/i }));

    await waitFor(() => {
      const btn = screen.queryByRole("button", { name: /Importing/i });
      expect(btn).not.toBeNull();
      expect((btn as HTMLButtonElement | null)?.disabled).toBe(true);
    });
  });

  it("renders multiple packs in the list", async () => {
    const packs = [
      makePack({ id: "algebra-1", name: "Algebra 1 (CCSS)" }),
      makePack({ id: "geometry", name: "Geometry (CCSS)", imported: true }),
    ];
    const client = makeClient(packs);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("Algebra 1 (CCSS)")).toBeDefined();
      expect(screen.getByText("Geometry (CCSS)")).toBeDefined();
    });
  });

  it("does not show edge count when edgeCount is 0", async () => {
    const client = makeClient([makePack({ edgeCount: 0 })]);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByText("Algebra 1 (CCSS)")).toBeDefined();
    });

    expect(screen.queryByText(/0 edges/)).toBeNull();
  });
});
