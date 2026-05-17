/**
 * Tests for the LibraryDocumentPicker modal component.
 *
 * Verifies:
 * - Renders the modal with LIBRARY kicker and correct aria-label.
 * - Lists all library documents from client.documents.list().
 * - Marks already-attached docs with "attached" badge (no Attach button).
 * - Shows "Attach" button for unattached docs.
 * - Clicking "Attach" calls client.documentScopes.attach() with correct args.
 * - After attach, the row shows "attached" badge (optimistic update).
 * - Empty state renders when library is empty.
 * - Close button calls onClose.
 * - ESC calls onClose.
 * - Course scope and session scope both work (polymorphic scope prop).
 */
import type {
  CourseId,
  DocumentId,
  DocumentScope,
  DocumentScopeAttachment,
  PraxisClient,
  SessionId,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryDocumentPicker } from "../components/library-document-picker.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

const COURSE_ID = brandId<"CourseId">("course-1") as CourseId;
const SESSION_ID = brandId<"SessionId">("session-1") as SessionId;
const COURSE_SCOPE: DocumentScope = { kind: "course", id: COURSE_ID };
const SESSION_SCOPE: DocumentScope = { kind: "session", id: SESSION_ID };
const DOC_A = "doc-a" as DocumentId;
const DOC_B = "doc-b" as DocumentId;

function makeDocSummary(
  documentId: string,
  filename: string,
  chunkCount = 5,
): import("@praxis/core/types").DocumentSummary {
  return {
    documentId,
    filename,
    mimeType: "application/pdf",
    ingestorId: "js-pdf",
    ingestorLabel: "JS PDF",
    chunkCount,
    createdAt: new Date().toISOString(),
    hasPageImages: false,
  };
}

function makeScopeAttachment(documentId: string, filename: string): DocumentScopeAttachment {
  return {
    documentId: documentId as DocumentId,
    filename,
    mimeType: "application/pdf",
    chunkCount: 5,
    hasPageImages: false,
    source: "manual",
    attachedAt: new Date(),
  };
}

function makeClient(opts?: {
  library?: ReturnType<typeof makeDocSummary>[];
  attached?: DocumentScopeAttachment[];
  attachFn?: PraxisClient["documentScopes"]["attach"];
}): PraxisClient {
  return makeFakeClient({
    documents: {
      list: vi.fn().mockResolvedValue(opts?.library ?? []),
      delete: vi.fn().mockResolvedValue(undefined),
      pageImage: vi.fn().mockResolvedValue(null),
    } as PraxisClient["documents"],
    documentScopes: {
      listForScope: vi.fn().mockResolvedValue(opts?.attached ?? []),
      attach:
        opts?.attachFn ??
        (vi.fn().mockResolvedValue({ attached: true }) as PraxisClient["documentScopes"]["attach"]),
      detach: vi.fn().mockResolvedValue({ detached: true }),
    } as PraxisClient["documentScopes"],
  });
}

function renderPicker(
  client: PraxisClient,
  onClose = vi.fn(),
  onAttached?: (id: DocumentId) => void,
  scope: DocumentScope = COURSE_SCOPE,
) {
  return render(
    <PraxisClientProvider client={client}>
      <LibraryDocumentPicker scope={scope} onClose={onClose} onAttached={onAttached} />
    </PraxisClientProvider>,
  );
}

describe("LibraryDocumentPicker", () => {
  it("renders the modal with LIBRARY kicker", () => {
    renderPicker(makeClient());
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("LIBRARY")).toBeDefined();
  });

  it("renders library documents after load", async () => {
    const client = makeClient({
      library: [makeDocSummary(DOC_A, "algebra.pdf"), makeDocSummary(DOC_B, "calculus.pdf")],
    });
    renderPicker(client);

    await waitFor(() => {
      expect(screen.getByText("algebra.pdf")).toBeDefined();
      expect(screen.getByText("calculus.pdf")).toBeDefined();
    });
  });

  it("marks an already-attached doc with 'attached' badge and no Attach button", async () => {
    const client = makeClient({
      library: [makeDocSummary(DOC_A, "algebra.pdf"), makeDocSummary(DOC_B, "calculus.pdf")],
      attached: [makeScopeAttachment(DOC_A, "algebra.pdf")],
    });
    renderPicker(client);

    await waitFor(() => {
      expect(screen.getByText("algebra.pdf")).toBeDefined();
    });

    // algebra.pdf is attached → badge, no Attach button
    expect(screen.getByText("attached")).toBeDefined();
    // calculus.pdf is unattached → Attach button
    const attachBtns = screen.getAllByRole("button", { name: /^Attach$/i });
    expect(attachBtns).toHaveLength(1);
  });

  it("clicking Attach calls documentScopes.attach with correct args", async () => {
    const attachFn = vi.fn().mockResolvedValue({ attached: true });
    const client = makeClient({
      library: [makeDocSummary(DOC_B, "calculus.pdf")],
      attachFn: attachFn as PraxisClient["documentScopes"]["attach"],
    });
    renderPicker(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

    await waitFor(() => {
      expect(attachFn).toHaveBeenCalledWith({
        scope: COURSE_SCOPE,
        documentId: DOC_B,
        source: "manual",
      });
    });
  });

  it("after attach the row shows 'attached' badge (optimistic update)", async () => {
    const client = makeClient({
      library: [makeDocSummary(DOC_B, "calculus.pdf")],
    });
    renderPicker(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

    await waitFor(() => {
      expect(screen.getByText("attached")).toBeDefined();
    });
  });

  it("calls onAttached with the documentId after a successful attach", async () => {
    const onAttached = vi.fn();
    const client = makeClient({
      library: [makeDocSummary(DOC_B, "calculus.pdf")],
    });
    renderPicker(client, vi.fn(), onAttached);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

    await waitFor(() => {
      expect(onAttached).toHaveBeenCalledWith(DOC_B);
    });
  });

  it("shows empty state when library is empty", async () => {
    const client = makeClient({ library: [] });
    renderPicker(client);

    await waitFor(() => {
      expect(screen.getByText(/No documents in your library yet/)).toBeDefined();
    });
  });

  it("Close button calls onClose", () => {
    const onClose = vi.fn();
    renderPicker(makeClient(), onClose);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    renderPicker(makeClient(), onClose);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("loads both library docs and attached docs in parallel", async () => {
    const listFn = vi.fn().mockResolvedValue([]);
    const listForScopeFn = vi.fn().mockResolvedValue([]);
    const client = makeFakeClient({
      documents: {
        list: listFn,
        delete: vi.fn(),
        pageImage: vi.fn().mockResolvedValue(null),
      } as PraxisClient["documents"],
      documentScopes: {
        listForScope: listForScopeFn,
        attach: vi.fn().mockResolvedValue({ attached: true }),
        detach: vi.fn().mockResolvedValue({ detached: true }),
      } as PraxisClient["documentScopes"],
    });
    renderPicker(client);

    await waitFor(() => {
      expect(listFn).toHaveBeenCalledOnce();
      expect(listForScopeFn).toHaveBeenCalledWith(COURSE_SCOPE);
    });
  });

  describe("session scope", () => {
    it("calls listForScope with session scope on load", async () => {
      const listForScopeFn = vi.fn().mockResolvedValue([]);
      const client = makeFakeClient({
        documents: {
          list: vi.fn().mockResolvedValue([makeDocSummary(DOC_A, "algebra.pdf")]),
          delete: vi.fn(),
          pageImage: vi.fn().mockResolvedValue(null),
        } as PraxisClient["documents"],
        documentScopes: {
          listForScope: listForScopeFn,
          attach: vi.fn().mockResolvedValue({ attached: true }),
          detach: vi.fn().mockResolvedValue({ detached: true }),
        } as PraxisClient["documentScopes"],
      });
      renderPicker(client, vi.fn(), undefined, SESSION_SCOPE);

      await waitFor(() => {
        expect(listForScopeFn).toHaveBeenCalledWith(SESSION_SCOPE);
      });
    });

    it("calls documentScopes.attach with session scope when Attach clicked", async () => {
      const attachFn = vi.fn().mockResolvedValue({ attached: true });
      const client = makeClient({
        library: [makeDocSummary(DOC_B, "calculus.pdf")],
        attachFn: attachFn as PraxisClient["documentScopes"]["attach"],
      });
      renderPicker(client, vi.fn(), undefined, SESSION_SCOPE);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

      await waitFor(() => {
        expect(attachFn).toHaveBeenCalledWith({
          scope: SESSION_SCOPE,
          documentId: DOC_B,
          source: "manual",
        });
      });
    });
  });
});
