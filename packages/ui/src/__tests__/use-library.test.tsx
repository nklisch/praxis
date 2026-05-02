/**
 * Tests for the useLibrary hook.
 *
 * Verifies:
 * - Loads all four data sources in parallel on mount
 * - Exposes aggregated LibraryData on success
 * - Reports loading state during fetch
 * - Reports error string when any source fails
 * - refresh() re-runs all four loaders
 */
import type {
  CourseSummary,
  DocumentSummary,
  PackSummaryClient,
  PraxisClient,
  SessionSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useLibrary } from "../hooks/use-library.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeCourse(): CourseSummary {
  return {
    courseId: brandId<"CourseId">("c1"),
    title: "Algebra 1",
    subject: "mathematics",
    gradeLevel: "grade-8",
    lessonCount: 5,
    conceptCount: 20,
    studiedConcepts: 3,
    createdAt: Date.now() as Timestamp,
  };
}

function makePack(): PackSummaryClient {
  return {
    id: "algebra-1",
    version: "1.0.0",
    name: "Algebra 1 (CCSS)",
    subject: "math.algebra-1",
    gradeLevel: "9-12",
    conceptCount: 32,
    edgeCount: 40,
    imported: false,
  };
}

function makeDocument(): DocumentSummary {
  return {
    documentId: "doc-1",
    filename: "textbook.pdf",
    mimeType: "application/pdf",
    ingestorId: "pdf-ingestor",
    ingestorLabel: "PDF",
    chunkCount: 42,
    createdAt: new Date().toISOString(),
    hasPageImages: false,
  };
}

function makeSession(): SessionSummary {
  return {
    sessionId: brandId<"SessionId">("s1"),
    modeId: "teach",
    startedAt: (Date.now() - 60_000) as Timestamp,
    endedAt: null,
    firstUserMessage: "Explain fractions to me",
  };
}

function makeClient(overrides?: {
  courses?: CourseSummary[] | "error";
  packs?: PackSummaryClient[] | "error";
  documents?: DocumentSummary[] | "error";
  sessions?: SessionSummary[] | "error";
}): PraxisClient {
  const courses = overrides?.courses;
  const packs = overrides?.packs;
  const documents = overrides?.documents;
  const sessions = overrides?.sessions;

  return makeFakeClient({
    artifacts: {
      courses:
        courses === "error"
          ? vi.fn().mockRejectedValue(new Error("courses error"))
          : vi.fn().mockResolvedValue(courses ?? []),
      course: vi.fn(),
      lessons: vi.fn(),
      gates: vi.fn(),
      progress: vi.fn(),
      flashcards: vi.fn(),
      notes: vi.fn(),
      conceptMaps: vi.fn(),
      gateView: vi.fn().mockResolvedValue([]),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
      concepts: vi.fn().mockResolvedValue([]),
    } as PraxisClient["artifacts"],
    packs: {
      listAvailable:
        packs === "error"
          ? vi.fn().mockRejectedValue(new Error("packs error"))
          : vi.fn().mockResolvedValue(packs ?? []),
      listImported: vi.fn().mockResolvedValue([]),
      import: vi.fn().mockResolvedValue({
        packId: "p1",
        version: "1",
        conceptGraphId: "cg1",
        importedAt: Date.now(),
      }),
    },
    documents: {
      list:
        documents === "error"
          ? vi.fn().mockRejectedValue(new Error("documents error"))
          : vi.fn().mockResolvedValue(documents ?? []),
      delete: vi.fn().mockResolvedValue(undefined),
      pageImage: vi.fn().mockResolvedValue(null),
    } as unknown as PraxisClient["documents"],
    session: {
      list:
        sessions === "error"
          ? vi.fn().mockRejectedValue(new Error("sessions error"))
          : vi.fn().mockResolvedValue(sessions ?? []),
      start: vi.fn(),
      end: vi.fn(),
      send: vi.fn(),
      active: vi.fn().mockResolvedValue(null),
    },
  });
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("useLibrary", () => {
  it("starts in loading state", () => {
    const client = makeClient();
    const { result } = renderHook(() => useLibrary(), { wrapper: wrapper(client) });
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("calls all four data sources on mount", async () => {
    const client = makeClient();
    renderHook(() => useLibrary(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(client.artifacts.courses).toHaveBeenCalled();
      expect(client.packs.listAvailable).toHaveBeenCalled();
      expect(client.documents.list).toHaveBeenCalled();
      expect(client.session.list).toHaveBeenCalledWith({ limit: 10, includeEnded: true });
    });
  });

  it("exposes data with all four sections after load", async () => {
    const client = makeClient({
      courses: [makeCourse()],
      packs: [makePack()],
      documents: [makeDocument()],
      sessions: [makeSession()],
    });
    const { result } = renderHook(() => useLibrary(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.courses).toHaveLength(1);
    expect(result.current.data?.packs).toHaveLength(1);
    expect(result.current.data?.documents).toHaveLength(1);
    expect(result.current.data?.recentSessions).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("reports an error when any data source fails", async () => {
    const client = makeClient({ courses: "error" });
    const { result } = renderHook(() => useLibrary(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("courses error");
    expect(result.current.data).toBeUndefined();
  });

  it("refresh() re-runs all loaders", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useLibrary(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.refresh();

    expect(client.artifacts.courses).toHaveBeenCalledTimes(2);
    expect(client.packs.listAvailable).toHaveBeenCalledTimes(2);
    expect(client.documents.list).toHaveBeenCalledTimes(2);
    expect(client.session.list).toHaveBeenCalledTimes(2);
  });

  it("returns empty arrays for sections with no data", async () => {
    const client = makeClient({
      courses: [],
      packs: [],
      documents: [],
      sessions: [],
    });
    const { result } = renderHook(() => useLibrary(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.courses).toHaveLength(0);
    expect(result.current.data?.packs).toHaveLength(0);
    expect(result.current.data?.documents).toHaveLength(0);
    expect(result.current.data?.recentSessions).toHaveLength(0);
  });
});
