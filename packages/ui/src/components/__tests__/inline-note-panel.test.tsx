/**
 * Tests for InlineNotePanel.
 *
 * Covers:
 *  - Slide-in lifecycle: renders when mounted.
 *  - Title input pre-filled with initialTitle.
 *  - Dismiss button calls onDismiss.
 *  - Esc key calls onDismiss.
 *  - Save button calls client.notes.create and fires onSaved.
 *  - ⌘↵ triggers save.
 */
import type { Note, PraxisClient } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { InlineNotePanel } from "../inline-note-panel.js";

afterEach(() => cleanup());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ tabId: undefined }),
    useSearch: () => ({}),
  };
});

function makeNoteStub(): Note {
  return {
    id: brandId<"NoteId">("note-1"),
    studentId: brandId<"StudentId">("student-1"),
    context: { sessionId: "session-1" },
    format: "cornell",
    links: [],
    createdAt: Date.now() as Note["createdAt"],
    updatedAt: Date.now() as Note["updatedAt"],
  };
}

function makeClientWithNotes(createFn: PraxisClient["notes"]["create"]): PraxisClient {
  return makeFakeClient({
    notes: {
      create: createFn,
      update: vi.fn().mockResolvedValue(makeNoteStub()),
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      setAnnotations: vi.fn().mockResolvedValue(undefined),
      getAnnotations: vi.fn().mockResolvedValue([]),
    } as PraxisClient["notes"],
  });
}

function renderPanel(
  client: PraxisClient,
  props: {
    onSaved?: (noteId: Note["id"]) => void;
    onDismiss?: () => void;
    initialTitle?: string;
  } = {},
) {
  const onSaved = props.onSaved ?? vi.fn();
  const onDismiss = props.onDismiss ?? vi.fn();

  return {
    onSaved,
    onDismiss,
    ...render(
      <PraxisClientProvider client={client}>
        <InlineNotePanel
          format="cornell"
          sessionId={brandId<"SessionId">("session-1")}
          initialTitle={props.initialTitle ?? "Test note"}
          onSaved={onSaved}
          onDismiss={onDismiss}
        />
      </PraxisClientProvider>,
    ),
  };
}

describe("InlineNotePanel", () => {
  it("renders the panel with the given title", () => {
    const client = makeClientWithNotes(vi.fn().mockResolvedValue(makeNoteStub()));
    renderPanel(client, { initialTitle: "Chain rule note" });

    const titleInput = screen.getByTestId("inline-note-title") as HTMLInputElement;
    expect(titleInput.value).toBe("Chain rule note");
  });

  it("shows the panel container", () => {
    const client = makeClientWithNotes(vi.fn().mockResolvedValue(makeNoteStub()));
    renderPanel(client);

    expect(screen.getByTestId("inline-note-panel")).toBeTruthy();
  });

  it("dismiss button calls onDismiss", () => {
    const client = makeClientWithNotes(vi.fn().mockResolvedValue(makeNoteStub()));
    const onDismiss = vi.fn();
    renderPanel(client, { onDismiss });

    fireEvent.click(screen.getByTestId("inline-note-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Esc key calls onDismiss", () => {
    const client = makeClientWithNotes(vi.fn().mockResolvedValue(makeNoteStub()));
    const onDismiss = vi.fn();
    renderPanel(client, { onDismiss });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("save button calls client.notes.create with correct args", async () => {
    const createFn = vi.fn().mockResolvedValue(makeNoteStub());
    const client = makeClientWithNotes(createFn);
    const onSaved = vi.fn();
    renderPanel(client, { onSaved });

    fireEvent.click(screen.getByTestId("inline-note-save"));

    await waitFor(() => {
      expect(createFn).toHaveBeenCalledTimes(1);
    });

    const [callArg] = createFn.mock.calls[0] as [Parameters<PraxisClient["notes"]["create"]>[0]];
    expect(callArg.format).toBe("cornell");
    expect(callArg.context?.sessionId).toBeDefined();
  });

  it("save button calls onSaved with the returned note id", async () => {
    const stub = makeNoteStub();
    const createFn = vi.fn().mockResolvedValue(stub);
    const client = makeClientWithNotes(createFn);
    const onSaved = vi.fn();
    renderPanel(client, { onSaved });

    fireEvent.click(screen.getByTestId("inline-note-save"));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(stub.id);
    });
  });

  it("⌘↵ triggers save", async () => {
    const createFn = vi.fn().mockResolvedValue(makeNoteStub());
    const client = makeClientWithNotes(createFn);
    const onSaved = vi.fn();
    renderPanel(client, { onSaved });

    fireEvent.keyDown(window, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(createFn).toHaveBeenCalledTimes(1);
    });
  });

  it("shows 'Saving…' while save is in flight", async () => {
    // Never resolve the promise so we can assert on interim state.
    const createFn = vi.fn().mockReturnValue(new Promise(() => {}));
    const client = makeClientWithNotes(createFn);
    renderPanel(client);

    fireEvent.click(screen.getByTestId("inline-note-save"));

    await waitFor(() => {
      expect(screen.getByTestId("inline-note-save").textContent).toBe("Saving…");
    });
  });
});
