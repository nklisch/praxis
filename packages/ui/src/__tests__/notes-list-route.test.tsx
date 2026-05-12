import type { Note, PraxisClient } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { NotesListTab } from "../routes/workspace/notes-list.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// TanStack Router hooks used inside NotesListTab
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

afterEach(() => cleanup());

function makeNote(format: Note["format"], bodyObj: object, overrides: Partial<Note> = {}): Note {
  return {
    id: brandId<"NoteId">("note-1"),
    studentId: brandId("student-1"),
    context: {},
    format,
    body: JSON.stringify(bodyObj),
    links: [],
    createdAt: Date.now() as Note["createdAt"],
    updatedAt: Date.now() as Note["updatedAt"],
    ...overrides,
  };
}

function makeClient(notes: Note[]): PraxisClient {
  return makeFakeClient({
    notes: {
      list: vi.fn().mockResolvedValue(notes),
      create: vi.fn().mockResolvedValue(notes[0]),
      delete: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
    } as PraxisClient["notes"],
  });
}

function renderTab(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <NotesListTab />
    </PraxisClientProvider>,
  );
}

describe("NotesListTab — MarkdownContent rendering", () => {
  it("renders bold markdown (**bold**) as a <strong> element in the preview", async () => {
    const note = makeNote("free", { kind: "free", text: "This is **bold** text." });
    const { container } = renderTab(makeClient([note]));

    await waitFor(() => {
      const strong = container.querySelector("strong");
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe("bold");
    });
  });

  it("renders a bullet list (- item) as a <ul> with <li> children inside the preview", async () => {
    const note = makeNote("free", { kind: "free", text: "- apple\n- banana\n- cherry" });
    renderTab(makeClient([note]));

    // waitFor until the list items appear in the DOM. Use getByText on known
    // content so we're not fighting CSS class obfuscation or layout nesting.
    await waitFor(() => {
      expect(screen.getByText("apple")).toBeDefined();
      expect(screen.getByText("banana")).toBeDefined();
      expect(screen.getByText("cherry")).toBeDefined();
    });
  });

  it("renders inline code (`code`) as a <code> element", async () => {
    const note = makeNote("free", { kind: "free", text: "Use `const` here." });
    const { container } = renderTab(makeClient([note]));

    await waitFor(() => {
      const code = container.querySelector("code");
      expect(code).not.toBeNull();
      expect(code?.textContent).toBe("const");
    });
  });

  it("renders plain-text (no markdown) as a paragraph with the raw text", async () => {
    const note = makeNote("free", { kind: "free", text: "Just plain prose here." });
    const { container } = renderTab(makeClient([note]));

    await waitFor(() => {
      const p = container.querySelector("p");
      expect(p).not.toBeNull();
      expect(p?.textContent).toContain("Just plain prose here.");
    });
  });

  it("shows (empty) placeholder when the note has no body", async () => {
    const note: Note = {
      id: brandId<"NoteId">("note-empty"),
      studentId: brandId("student-1"),
      context: {},
      format: "free",
      body: undefined,
      links: [],
      createdAt: Date.now() as Note["createdAt"],
      updatedAt: Date.now() as Note["updatedAt"],
    };
    renderTab(makeClient([note]));

    await waitFor(() => {
      expect(screen.getByText("(empty)")).toBeDefined();
    });
  });

  it("renders the feynman explanation text through MarkdownContent", async () => {
    const note = makeNote("feynman", {
      kind: "feynman",
      explanation: "Energy equals **mass** times c squared.",
      followUps: [],
    });
    const { container } = renderTab(makeClient([note]));

    await waitFor(() => {
      const strong = container.querySelector("strong");
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe("mass");
    });
  });
});
