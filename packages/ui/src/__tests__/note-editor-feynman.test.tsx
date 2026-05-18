import type { Annotation, NoteId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeynmanBody } from "../components/note-editor-feynman.js";
import { NoteEditorFeynman } from "../components/note-editor-feynman.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

const FAKE_NOTE_ID = "note-1" as NoteId;

function makeBody(overrides: Partial<FeynmanBody> = {}): FeynmanBody {
  return {
    kind: "feynman",
    explanation: "Photosynthesis is how plants eat sunlight.",
    followUps: ["Why is chlorophyll green?"],
    ...overrides,
  };
}

function makeClient(
  overrides: {
    getAnnotations?: (noteId: NoteId) => Promise<Annotation[]>;
    setAnnotations?: (input: { noteId: NoteId; annotations: Annotation[] }) => Promise<void>;
  } = {},
) {
  return makeFakeClient({
    notes: {
      getAnnotations: overrides.getAnnotations ?? vi.fn().mockResolvedValue([]),
      setAnnotations: overrides.setAnnotations ?? vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof makeFakeClient>["notes"],
  });
}

function renderEditor(
  props: Partial<Parameters<typeof NoteEditorFeynman>[0]> & { noteId?: NoteId } = {},
  client = makeClient(),
) {
  const body = props.body ?? makeBody();
  const onChange = props.onChange ?? vi.fn();
  return render(
    <PraxisClientProvider client={client}>
      <NoteEditorFeynman
        body={body}
        onChange={onChange}
        noteId={props.noteId}
        onSpawnFromCue={props.onSpawnFromCue}
      />
    </PraxisClientProvider>,
  );
}

// ── Mode toggle ───────────────────────────────────────────────────────────────

describe("NoteEditorFeynman — mode toggle", () => {
  it("starts in writing mode — shows explanation textarea", () => {
    renderEditor();
    expect(screen.getByLabelText("Explanation", { exact: false })).toBeDefined();
  });

  it("switches to reviewing mode when the review button is clicked", async () => {
    renderEditor({ body: makeBody() });
    const reviewBtn = screen.getByRole("button", { name: /i'm reviewing/i });
    fireEvent.click(reviewBtn);
    await waitFor(() => expect(screen.getByTestId("annotation-body")).toBeDefined());
    expect(screen.queryByLabelText("Explanation", { exact: false })).toBeNull();
  });

  it("switches back to writing mode after returning from reviewing", async () => {
    renderEditor({ body: makeBody() });
    fireEvent.click(screen.getByRole("button", { name: /i'm reviewing/i }));
    await waitFor(() => screen.getByTestId("annotation-body"));
    fireEvent.click(screen.getByRole("button", { name: /i'm writing/i }));
    await waitFor(() =>
      expect(screen.getByLabelText("Explanation", { exact: false })).toBeDefined(),
    );
  });
});

// ── Writing mode: existing behaviour ─────────────────────────────────────────

describe("NoteEditorFeynman — writing mode", () => {
  it("renders explanation textarea with initial value", () => {
    renderEditor();
    const el = screen.getByLabelText("Explanation", {
      exact: false,
    }) as HTMLTextAreaElement;
    expect(el.value).toBe("Photosynthesis is how plants eat sunlight.");
  });

  it("renders follow-up textarea", () => {
    renderEditor();
    const el = screen.getByLabelText("Follow-up 1") as HTMLTextAreaElement;
    expect(el.value).toBe("Why is chlorophyll green?");
  });

  it("calls onChange when explanation changes", () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.change(screen.getByLabelText("Explanation", { exact: false }), {
      target: { value: "Plants use light." },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ explanation: "Plants use light." }),
    );
  });

  it("Add follow-up button appends empty string", () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByText("+ Add follow-up"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        followUps: ["Why is chlorophyll green?", ""],
      }),
    );
  });

  it("remove follow-up button removes entry", () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByLabelText("Remove follow-up 1"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ followUps: [] }));
  });

  it("does not render spawn buttons when onSpawnFromCue is not provided", () => {
    renderEditor();
    expect(screen.queryByLabelText("Talk to Praxis about follow-up 1")).toBeNull();
  });

  it("renders a spawn button for each follow-up when onSpawnFromCue is provided", () => {
    const body = makeBody({ followUps: ["Q1", "Q2"] });
    renderEditor({ body, onSpawnFromCue: () => {} });
    expect(screen.getByLabelText("Talk to Praxis about follow-up 1")).toBeDefined();
    expect(screen.getByLabelText("Talk to Praxis about follow-up 2")).toBeDefined();
  });

  it("calls onSpawnFromCue with the follow-up index string when spawn button is clicked", () => {
    const onSpawnFromCue = vi.fn();
    const body = makeBody({ followUps: ["Q1", "Q2"] });
    renderEditor({ body, onSpawnFromCue });
    fireEvent.click(screen.getByLabelText("Talk to Praxis about follow-up 2"));
    expect(onSpawnFromCue).toHaveBeenCalledWith("1");
  });
});

// ── Review mode: annotation round-trip ───────────────────────────────────────

describe("NoteEditorFeynman — review mode", () => {
  it("loads existing annotations via getAnnotations on mount when noteId is provided", async () => {
    const existingAnnotations: Annotation[] = [
      { rangeStart: 0, rangeEnd: 14, text: "explain more", severity: "soft" },
    ];
    const getAnnotations = vi.fn().mockResolvedValue(existingAnnotations);
    const client = makeClient({ getAnnotations });

    renderEditor({ noteId: FAKE_NOTE_ID }, client);

    await waitFor(() => expect(getAnnotations).toHaveBeenCalledWith(FAKE_NOTE_ID));
  });

  it("renders existing annotations as margin notes after switching to review mode", async () => {
    const existingAnnotations: Annotation[] = [
      { rangeStart: 0, rangeEnd: 14, text: "gap here", severity: "soft" },
    ];
    const client = makeClient({ getAnnotations: vi.fn().mockResolvedValue(existingAnnotations) });

    renderEditor({ noteId: FAKE_NOTE_ID }, client);

    // Switch to reviewing.
    fireEvent.click(screen.getByRole("button", { name: /i'm reviewing/i }));

    await waitFor(() => expect(screen.getByTestId("margin-note-0")).toBeDefined());
    expect(screen.getByTestId("margin-note-0").textContent).toContain("gap here");
  });

  it("load-bearing annotation gets the strong style class", async () => {
    const existingAnnotations: Annotation[] = [
      { rangeStart: 0, rangeEnd: 5, text: "critical", severity: "load_bearing" },
    ];
    const client = makeClient({ getAnnotations: vi.fn().mockResolvedValue(existingAnnotations) });

    renderEditor({ noteId: FAKE_NOTE_ID }, client);
    fireEvent.click(screen.getByRole("button", { name: /i'm reviewing/i }));

    await waitFor(() => {
      const note = screen.getByTestId("margin-note-0");
      expect(note.textContent).toContain("load-bearing");
    });
  });

  it("popover appears after mouseup on annotation body", async () => {
    const client = makeClient();
    renderEditor({ noteId: FAKE_NOTE_ID }, client);
    fireEvent.click(screen.getByRole("button", { name: /i'm reviewing/i }));
    await waitFor(() => screen.getByTestId("annotation-body"));

    // Simulate a text selection by dispatching mouseup — the selection APIs
    // aren't available in jsdom, so we trigger the popover via a direct
    // workaround: override getSelection temporarily.
    const container = screen.getByTestId("annotation-body");

    // Fake window.getSelection to return a non-collapsed range.
    const mockRange = {
      startContainer: container.firstChild ?? container,
      startOffset: 0,
      endContainer: container.firstChild ?? container,
      endOffset: 12,
      toString: () => "Photosynthes",
      getClientRects: () => [{ bottom: 100, left: 50 }],
      collapse: vi.fn(),
    };
    const mockSel = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => mockRange,
      removeAllRanges: vi.fn(),
    };
    const origGetSelection = window.getSelection;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    window.getSelection = () => mockSel as any;

    fireEvent.mouseUp(container);

    window.getSelection = origGetSelection;

    await waitFor(() => expect(screen.getByTestId("gap-popover")).toBeDefined());
  });

  it("saving a gap note calls setAnnotations with the new annotation appended", async () => {
    const setAnnotations = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({ setAnnotations });
    renderEditor({ body: makeBody(), noteId: FAKE_NOTE_ID }, client);
    fireEvent.click(screen.getByRole("button", { name: /i'm reviewing/i }));
    await waitFor(() => screen.getByTestId("annotation-body"));

    const container = screen.getByTestId("annotation-body");
    const mockRange = {
      startContainer: container.firstChild ?? container,
      startOffset: 0,
      endContainer: container.firstChild ?? container,
      endOffset: 12,
      toString: () => "Photosynthes",
      getClientRects: () => [{ bottom: 100, left: 50 }],
      collapse: vi.fn(),
    };
    const mockSel = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => mockRange,
      removeAllRanges: vi.fn(),
    };
    const origGetSelection = window.getSelection;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    window.getSelection = () => mockSel as any;
    fireEvent.mouseUp(container);
    window.getSelection = origGetSelection;

    await waitFor(() => screen.getByTestId("gap-popover"));

    // Type a note.
    fireEvent.change(screen.getByLabelText("Gap note text"), {
      target: { value: "I should explain better" },
    });

    // Save.
    fireEvent.click(screen.getByRole("button", { name: /save gap/i }));

    await waitFor(() =>
      expect(setAnnotations).toHaveBeenCalledWith(
        expect.objectContaining({
          noteId: FAKE_NOTE_ID,
          annotations: expect.arrayContaining([
            expect.objectContaining({
              text: "I should explain better",
              severity: "soft",
            }),
          ]),
        }),
      ),
    );
  });
});
