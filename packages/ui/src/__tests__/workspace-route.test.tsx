import type { Flashcard, Note, PraxisClient } from "@praxis/core/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { WorkspaceRoute } from "../routes/workspace.js";
import { makeFakeClient } from "./helpers/fake-client.js";

const routerMocks = vi.hoisted(() => ({
  search: { tab: "notes" } as { tab?: unknown },
}));

// TanStack Router mocks
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  useSearch: () => routerMocks.search,
  useParams: () => ({ noteId: "note-1" }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

afterEach(() => {
  routerMocks.search = { tab: "notes" };
  cleanup();
});

function makeClient(notes: Note[] = [], cards: Flashcard[] = []): PraxisClient {
  return makeFakeClient({
    library: {
      search: vi.fn().mockResolvedValue([]),
    } as PraxisClient["library"],
    notes: {
      list: vi.fn().mockResolvedValue(notes),
      create: vi.fn().mockResolvedValue(notes[0]),
      delete: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
    } as PraxisClient["notes"],
    flashcards: {
      dueCount: vi.fn().mockResolvedValue(0),
      list: vi.fn().mockResolvedValue(cards),
    } as unknown as PraxisClient["flashcards"],
  });
}

describe("WorkspaceRoute", () => {
  it("renders route kicker", () => {
    render(
      <PraxisClientProvider client={makeClient()}>
        <WorkspaceRoute />
      </PraxisClientProvider>,
    );
    expect(screen.getByText("WORKSPACE")).toBeDefined();
  });

  it("renders three tab buttons", () => {
    render(
      <PraxisClientProvider client={makeClient()}>
        <WorkspaceRoute />
      </PraxisClientProvider>,
    );
    expect(screen.getByRole("tab", { name: "Notes" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Cards" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Review" })).toBeDefined();
  });

  it("shows Catalogue (notes tab) heading by default", async () => {
    render(
      <PraxisClientProvider client={makeClient()}>
        <WorkspaceRoute />
      </PraxisClientProvider>,
    );

    // The Catalogue heading is always present when the notes tab is active
    await waitFor(() => {
      expect(screen.getByText(/the catalogue/i)).toBeDefined();
    });
  });

  it("falls back to notes when the tab search param is invalid", async () => {
    routerMocks.search = { tab: "bogus" };

    render(
      <PraxisClientProvider client={makeClient()}>
        <WorkspaceRoute />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Notes" }).getAttribute("aria-selected")).toBe("true");
      expect(screen.getByText(/the catalogue/i)).toBeDefined();
    });
  });
});
