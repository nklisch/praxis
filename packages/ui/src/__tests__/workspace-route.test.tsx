import type { Flashcard, Note, PraxisClient } from "@praxis/core/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { WorkspaceRoute } from "../routes/workspace.js";

// TanStack Router mocks
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  useSearch: () => ({ tab: "notes" }),
  useParams: () => ({ noteId: "note-1" }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

afterEach(() => cleanup());

function makeClient(notes: Note[] = [], cards: Flashcard[] = []): PraxisClient {
  return {
    session: {} as PraxisClient["session"],
    artifacts: {} as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {} as PraxisClient["packs"],
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
  };
}

describe("WorkspaceRoute", () => {
  it("renders page title", () => {
    render(
      <PraxisClientProvider client={makeClient()}>
        <WorkspaceRoute />
      </PraxisClientProvider>,
    );
    expect(screen.getByText("Workspace")).toBeDefined();
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

  it("shows Notes tab content by default (empty state)", async () => {
    render(
      <PraxisClientProvider client={makeClient()}>
        <WorkspaceRoute />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No notes yet/)).toBeDefined();
    });
  });
});
