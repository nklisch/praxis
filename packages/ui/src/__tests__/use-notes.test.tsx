import type { Note, NoteBody, PraxisClient } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useNotes } from "../hooks/use-notes.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: brandId<"NoteId">("note-1"),
    studentId: brandId("student-1"),
    context: {},
    format: "cornell",
    body: JSON.stringify({ kind: "cornell", questions: ["Q?"], details: ["D."], summary: "S" }),
    links: [],
    createdAt: Date.now() as Note["createdAt"],
    updatedAt: Date.now() as Note["updatedAt"],
    ...overrides,
  };
}

function makeClient(notes: Note[] | "error"): PraxisClient {
  const listFn =
    notes === "error"
      ? vi.fn().mockRejectedValue(new Error("fetch failed"))
      : vi.fn().mockResolvedValue(notes);
  const createFn = vi.fn().mockResolvedValue(makeNote());
  const deleteFn = vi.fn().mockResolvedValue(undefined);

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
      list: listFn,
      create: createFn,
      delete: deleteFn,
      get: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(makeNote()),
    } as PraxisClient["notes"],
    flashcards: {
      dueCount: vi.fn().mockResolvedValue(0),
    } as unknown as PraxisClient["flashcards"],
  };
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useNotes", () => {
  it("returns empty list initially then loads notes", async () => {
    const client = makeClient([makeNote()]);
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.notes).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("sets error state on fetch failure", async () => {
    const client = makeClient("error");
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("fetch failed");
    expect(result.current.notes).toHaveLength(0);
  });

  it("createNote calls client.notes.create and refreshes", async () => {
    const client = makeClient([]);
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const body: NoteBody = { kind: "free", text: "hello" };
    await act(async () => {
      await result.current.createNote({ format: "free", body });
    });

    expect(client.notes.create).toHaveBeenCalledWith({ format: "free", body });
  });

  it("deleteNote removes card from local list optimistically", async () => {
    const note = makeNote();
    const client = makeClient([note]);
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    await act(async () => {
      await result.current.deleteNote(note.id);
    });

    expect(result.current.notes).toHaveLength(0);
    expect(client.notes.delete).toHaveBeenCalledWith(note.id);
  });
});
