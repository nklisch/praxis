/**
 * Tests for DocumentTabBody — the viewer shell for kind:"document" tabs.
 *
 * Verifies:
 * - Loading state is shown while documents.get is pending.
 * - Error state is shown when documents.get rejects.
 * - "Document not found" when documents.get returns null.
 * - Correct renderer is mounted based on mimeType (smoke-tested via rendered output).
 * - Visual contract: doc-head chrome renders kicker, h1 title, optional filename meta.
 * - Visual contract: reading column wrapper is present for text content.
 * - Citation marks (†) are applied to cited ranges in text documents.
 * - Stale citations (out-of-bounds offsets) are silently skipped.
 * - PDF documents skip text-node citation walking.
 */
import type {
  DocumentCitationRecord,
  DocumentDetail,
  DocumentTabSummary,
  Timestamp,
} from "@praxis/core/types";
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

function renderTab(
  tab: DocumentTabSummary,
  getResult: DocumentDetail | null | Error,
  citations: DocumentCitationRecord[] = [],
) {
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
    citations: {
      listByDocument: vi.fn().mockResolvedValue(citations),
      record: vi.fn().mockResolvedValue(undefined),
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

  it("renders the document title in the header h1", async () => {
    renderTab(makeTab(), makeDetail({ title: "Lecture 1: Introduction" }));

    await waitFor(() => {
      // Title appears in the h1 element.
      const h1 = document.querySelector("h1");
      expect(h1).not.toBeNull();
      expect(h1?.textContent).toContain("Lecture 1: Introduction");
    });
  });

  it("renders filename in header h1 when title is null", async () => {
    renderTab(makeTab(), makeDetail({ title: null, filename: "lecture-01.md" }));

    await waitFor(() => {
      const h1 = document.querySelector("h1");
      expect(h1).not.toBeNull();
      expect(h1?.textContent).toContain("lecture-01.md");
    });
  });

  it("renders the doc-head kicker with the document MIME type", async () => {
    renderTab(makeTab(), makeDetail({ mimeType: "text/markdown", title: "A Document" }));

    await waitFor(() => {
      // Kicker shows the MIME type as a metadata label.
      expect(screen.getByText("text/markdown")).toBeDefined();
    });
  });

  it("renders the filename as docMeta when title differs from filename", async () => {
    renderTab(
      makeTab(),
      makeDetail({ title: "Introduction to Calculus", filename: "calc-intro.md" }),
    );

    await waitFor(() => {
      // Both the title (in h1) and the filename (in docMeta) appear.
      expect(screen.getByText("Introduction to Calculus")).toBeDefined();
      expect(screen.getByText("calc-intro.md")).toBeDefined();
    });
  });

  it("does not render docMeta when title equals filename", async () => {
    renderTab(makeTab(), makeDetail({ title: "test.md", filename: "test.md" }));

    await waitFor(() => {
      // Title in h1 only — no duplicate docMeta line.
      expect(document.querySelectorAll('[class*="docMeta"]')).toHaveLength(0);
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

describe("DocumentTabBody citation marks", () => {
  it("renders a † dagger mark when a citation covers the document text", async () => {
    const text = "Hello world, this is the document text.";
    // Citation covers "world" (offsets 6–11).
    const citation: DocumentCitationRecord = {
      id: "cit-1",
      documentId: brandId<"DocumentId">("doc-1"),
      citingSessionId: brandId<"SessionId">("sess-1"),
      citingTurnId: null,
      startOffset: 6,
      endOffset: 11,
      citedText: "world",
      createdAt: Date.now(),
    };

    renderTab(makeTab(), makeDetail({ mimeType: "text/plain", text }), [citation]);

    await waitFor(() => {
      // A <mark> element should be injected for the cited range.
      expect(document.querySelector("mark")).not.toBeNull();
      // The mark wraps the cited word.
      expect(document.querySelector("mark")?.textContent).toContain("world");
    });
  });

  it("does not render marks when there are no citations", async () => {
    const text = "Hello world, no citations here.";
    renderTab(makeTab(), makeDetail({ mimeType: "text/plain", text }), []);

    // Wait for the document to load fully.
    await waitFor(() => {
      expect(screen.queryAllByText(/Hello world/)).not.toHaveLength(0);
    });

    expect(document.querySelector("mark")).toBeNull();
  });

  it("skips stale citations with out-of-bounds offsets (no mark rendered)", async () => {
    const text = "Short text."; // length 11
    const staleCitation: DocumentCitationRecord = {
      id: "cit-stale",
      documentId: brandId<"DocumentId">("doc-1"),
      citingSessionId: brandId<"SessionId">("sess-1"),
      citingTurnId: null,
      startOffset: 100, // well beyond the document length
      endOffset: 200,
      citedText: null,
      createdAt: Date.now(),
    };

    renderTab(makeTab(), makeDetail({ mimeType: "text/plain", text }), [staleCitation]);

    await waitFor(() => {
      expect(screen.queryAllByText(/Short text/)).not.toHaveLength(0);
    });

    // No mark should be injected for the stale citation.
    expect(document.querySelector("mark")).toBeNull();
  });

  it("does not walk text nodes for PDF documents", async () => {
    const citation: DocumentCitationRecord = {
      id: "cit-pdf",
      documentId: brandId<"DocumentId">("doc-1"),
      citingSessionId: brandId<"SessionId">("sess-1"),
      citingTurnId: null,
      startOffset: 0,
      endOffset: 10,
      citedText: null,
      createdAt: Date.now(),
    };

    renderTab(makeTab(), makeDetail({ mimeType: "application/pdf", text: null }), [citation]);

    // PDF renderer shows page images; no mark should be injected.
    await waitFor(() => {
      expect(screen.queryByText("Loading document")).toBeNull();
    });

    expect(document.querySelector("mark")).toBeNull();
  });
});
