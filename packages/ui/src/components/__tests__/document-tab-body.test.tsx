/**
 * Tests for DocumentTabBody — the viewer shell for kind:"document" tabs.
 *
 * Verifies:
 * - Loading state is shown while documents.get is pending.
 * - Error state is shown when documents.get rejects.
 * - "Document not found" when documents.get returns null.
 * - Correct renderer is mounted based on mimeType (smoke-tested via rendered output).
 */
import type { DocumentDetail, DocumentTabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { DocumentTabBody } from "../document-tab-body.js";

afterEach(() => cleanup());

function makeTab(overrides: Partial<DocumentTabSummary> = {}): DocumentTabSummary {
  return {
    kind: "document",
    id: brandId<"TabId">("tab-doc-1"),
    documentId: brandId<"DocumentId">("doc-1"),
    title: "test.md",
    sortOrder: 0,
    openedAt: (Date.now() - 5_000) as Timestamp,
    lastSeenAt: (Date.now() - 1_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<DocumentDetail> = {}): DocumentDetail {
  return {
    documentId: "doc-1",
    filename: "test.md",
    mimeType: "text/markdown",
    ingestorId: "markdown",
    ingestorLabel: "Markdown",
    chunkCount: 2,
    createdAt: new Date().toISOString(),
    hasPageImages: false,
    title: "Test Document",
    pageCount: null,
    text: "# Hello\n\nThis is the document text.",
    ...overrides,
  };
}

function renderTab(tab: DocumentTabSummary, getResult: DocumentDetail | null | Error) {
  const client = makeFakeClient({
    documents: {
      list: vi.fn().mockResolvedValue([]),
      get:
        getResult instanceof Error
          ? vi.fn().mockRejectedValue(getResult)
          : vi.fn().mockResolvedValue(getResult),
      delete: vi.fn().mockResolvedValue(undefined),
      pageImage: vi.fn().mockResolvedValue(null),
    },
  });

  return render(
    <PraxisClientProvider client={client}>
      <DocumentTabBody tab={tab} />
    </PraxisClientProvider>,
  );
}

describe("DocumentTabBody", () => {
  it("shows loading state while documents.get is pending", () => {
    const neverResolves = makeFakeClient({
      documents: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockReturnValue(new Promise(() => {})),
        delete: vi.fn().mockResolvedValue(undefined),
        pageImage: vi.fn().mockResolvedValue(null),
      },
    });

    render(
      <PraxisClientProvider client={neverResolves}>
        <DocumentTabBody tab={makeTab()} />
      </PraxisClientProvider>,
    );

    expect(screen.getByText(/Loading document/i)).toBeDefined();
  });

  it("shows 'Document not found' when documents.get returns null", async () => {
    renderTab(makeTab(), null);

    await waitFor(() => {
      expect(screen.getByText(/Document not found/i)).toBeDefined();
    });
  });

  it("shows an error message when documents.get rejects", async () => {
    renderTab(makeTab(), new Error("Network failure"));

    await waitFor(() => {
      expect(screen.getByText(/Network failure/i)).toBeDefined();
    });
  });

  it("renders the document title in the header", async () => {
    renderTab(makeTab(), makeDetail({ title: "Lecture 1: Introduction" }));

    await waitFor(() => {
      expect(screen.getByText("Lecture 1: Introduction")).toBeDefined();
    });
  });

  it("renders filename in header when title is null", async () => {
    renderTab(makeTab(), makeDetail({ title: null, filename: "lecture-01.md" }));

    await waitFor(() => {
      expect(screen.getByText("lecture-01.md")).toBeDefined();
    });
  });

  it("dispatches to MarkdownRenderer for text/markdown documents", async () => {
    renderTab(
      makeTab(),
      makeDetail({
        mimeType: "text/markdown",
        text: "Some markdown content here.",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Some markdown content here.")).toBeDefined();
    });
  });

  it("dispatches to HtmlRenderer for text/html documents", async () => {
    renderTab(
      makeTab(),
      makeDetail({
        mimeType: "text/html",
        text: "<p>Hello HTML world</p>",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Hello HTML world")).toBeDefined();
    });
  });

  it("dispatches to FallbackRenderer for unsupported MIME types", async () => {
    renderTab(
      makeTab(),
      makeDetail({
        mimeType: "application/octet-stream",
        text: "",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Preview not available/i)).toBeDefined();
    });
  });
});
