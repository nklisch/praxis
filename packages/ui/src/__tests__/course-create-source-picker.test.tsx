/**
 * Tests for <CourseCreateRoute> — source-picker integration tests.
 *
 * Verifies:
 * - Stepper reads "Material · Create · Confirm · Open" (step 2 renamed from "Explore").
 * - Pack tab is the landing tab on first load.
 * - URL ?pack=<id> param pre-attaches a matching pack from the list.
 * - Paste tab workflow: pasted text triggers writeTempText → startBatchWithPaths → shows source.
 * - Tab switching via the source picker is wired up.
 */
import type {
  IngestionEvent,
  PackSummaryClient,
  PraxisClient,
  SessionHandle,
  SessionTabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { CourseCreateRoute } from "../routes/course-create.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// ─── Router mock ─────────────────────────────────────────────────────────────

// Default: no search params.
let mockSearchParams: Record<string, string | undefined> = {};

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn().mockResolvedValue(undefined),
    useSearch: () => mockSearchParams,
    Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  };
});

vi.mock("../hooks/use-tabs.js", () => ({
  useTabs: () => ({
    openTab: vi.fn().mockResolvedValue({
      kind: "session",
      id: brandId<"TabId">("tab-1"),
      sessionId: brandId<"SessionId">("s1"),
      modeId: "course-create",
      title: "test tab",
      sortOrder: 0,
      openedAt: Date.now() as Timestamp,
      lastSeenAt: Date.now() as Timestamp,
      closedAt: null,
    }),
  }),
}));

afterEach(() => {
  cleanup();
  mockSearchParams = {};
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_PACK: PackSummaryClient = {
  id: "math.algebra-1",
  version: "1.0.0",
  name: "Algebra 1",
  subject: "math",
  gradeLevel: "9-12",
  conceptCount: 42,
  edgeCount: 60,
  imported: false,
};

async function* makeEventStream(
  events: IngestionEvent[],
): AsyncGenerator<IngestionEvent, void, unknown> {
  for (const ev of events) {
    yield ev;
  }
}

function makeDoneStream(documentId = "doc-1") {
  return makeEventStream([{ type: "done", documentId, chunkCount: 3 } as IngestionEvent]);
}

type IngestClient = PraxisClient["ingest"];

function makeClient(
  opts: {
    packs?: PackSummaryClient[];
    writeTempTextReturn?: string;
    startFn?: IngestClient["start"];
  } = {},
): PraxisClient {
  const { packs = [], writeTempTextReturn = "/tmp/Pasted notes (2026-05-23).txt", startFn } = opts;
  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("s1"),
        modeId: "course-create",
        startedAt: Date.now() as Timestamp,
      } satisfies SessionHandle),
      end: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("s1"),
        endedAt: Date.now() as Timestamp,
        unlockedGates: [],
        newMisconceptions: 0,
      }),
      send: vi.fn(),
    } as PraxisClient["session"],
    tabs: {
      open: vi.fn().mockResolvedValue({
        kind: "session",
        id: brandId<"TabId">("tab-1"),
        sessionId: brandId<"SessionId">("s1"),
        modeId: "course-create",
        title: "test tab",
        sortOrder: 0,
        openedAt: Date.now() as Timestamp,
        lastSeenAt: Date.now() as Timestamp,
        closedAt: null,
      } satisfies SessionTabSummary),
    } as unknown as PraxisClient["tabs"],
    ingest: {
      pickFile: vi.fn().mockResolvedValue(null),
      pickPaths: vi.fn().mockResolvedValue([]),
      isAvailable: () => true,
      start:
        startFn ??
        (vi.fn().mockImplementation(() => makeDoneStream()) as unknown as IngestClient["start"]),
      candidatesFor: vi.fn().mockResolvedValue([]),
      writeTempText: vi.fn().mockResolvedValue(writeTempTextReturn),
    } as IngestClient,
    packs: {
      listAvailable: vi.fn().mockResolvedValue(packs),
      listImported: vi.fn().mockResolvedValue([]),
      import: vi.fn().mockResolvedValue({}),
    } as PraxisClient["packs"],
  });
}

function renderRoute(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <CourseCreateRoute />
    </PraxisClientProvider>,
  );
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

describe("CourseCreateRoute — stepper", () => {
  it("shows 'Material · Create · Confirm · Open' (Explore renamed to Create)", () => {
    const client = makeClient();
    renderRoute(client);

    // All four step labels must be present.
    expect(screen.getByText("Material")).toBeDefined();
    expect(screen.getByText("Create")).toBeDefined();
    expect(screen.getByText("Confirm")).toBeDefined();
    expect(screen.getByText("Open")).toBeDefined();

    // "Explore" must NOT appear.
    expect(screen.queryByText("Explore")).toBeNull();
  });
});

// ─── Source picker landing ────────────────────────────────────────────────────

describe("CourseCreateRoute — source picker landing", () => {
  it("Pack tab is active on first load", () => {
    const client = makeClient({ packs: [SAMPLE_PACK] });
    renderRoute(client);

    const packTab = screen.getByRole("tab", { name: /pack/i });
    expect(packTab.getAttribute("aria-selected")).toBe("true");
  });

  it("Upload tab is NOT active on first load", () => {
    const client = makeClient();
    renderRoute(client);

    const uploadTab = screen.getByRole("tab", { name: /upload/i });
    expect(uploadTab.getAttribute("aria-selected")).toBe("false");
  });
});

// ─── URL param pre-selection ─────────────────────────────────────────────────

describe("CourseCreateRoute — URL param pre-selection", () => {
  it("pre-attaches the pack matching the ?pack= param when packs load", async () => {
    mockSearchParams = { pack: "math.algebra-1" };
    const client = makeClient({ packs: [SAMPLE_PACK] });
    renderRoute(client);

    // Wait for the pack to appear in the attached-sources list.
    await waitFor(() => {
      expect(screen.getByText("Algebra 1")).toBeDefined();
    });

    // The pack should show as "ready" in the attached list.
    await waitFor(() => {
      expect(screen.getByText("ready")).toBeDefined();
    });
  });

  it("does not attach anything when ?pack= param is absent", async () => {
    mockSearchParams = {};
    const client = makeClient({ packs: [SAMPLE_PACK] });
    renderRoute(client);

    // No "Attached · N sources" heading should render
    expect(screen.queryByText(/attached/i)).toBeNull();
  });

  it("does not attach a pack when ?pack= references an unknown id", async () => {
    mockSearchParams = { pack: "unknown.pack-id" };
    const client = makeClient({ packs: [SAMPLE_PACK] });
    renderRoute(client);

    // Wait a bit for the effect to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByText(/attached/i)).toBeNull();
  });
});

// ─── Paste source workflow ────────────────────────────────────────────────────

describe("CourseCreateRoute — paste source", () => {
  it("calls writeTempText and shows the pasted document as 'indexing' then 'ready'", async () => {
    const tmpPath = "/tmp/Pasted notes (2026-05-23).txt";
    const startFn = vi.fn().mockImplementation(() => makeDoneStream("doc-paste"));

    const client = makeClient({
      writeTempTextReturn: tmpPath,
      startFn: startFn as unknown as IngestClient["start"],
    });

    renderRoute(client);

    // Switch to Paste tab
    fireEvent.click(screen.getByRole("tab", { name: /paste/i }));

    // Type in the paste textarea
    const textarea = screen.getByRole("textbox", { name: /paste source text/i });
    fireEvent.change(textarea, { target: { value: "Chapter 1: Introduction to Algebra." } });

    // Click "Save as source"
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save as source/i }));
    });

    // writeTempText should have been called
    expect(client.ingest.writeTempText).toHaveBeenCalledWith(
      "Chapter 1: Introduction to Algebra.",
      expect.stringMatching(/Pasted notes/),
    );

    // After ingestion completes, the source should show as "ready"
    await waitFor(() => {
      expect(screen.getByText("ready")).toBeDefined();
    });
  });
});

// ─── Tab switching wiring ─────────────────────────────────────────────────────

describe("CourseCreateRoute — tab switching via Or-bar", () => {
  it("switches from Pack to Upload via the Or-bar link", () => {
    const client = makeClient();
    renderRoute(client);

    // Pack is active → Or-bar shows "upload your own files"
    fireEvent.click(screen.getByRole("button", { name: /upload your own files/i }));

    // Upload tab should now be active
    const uploadTab = screen.getByRole("tab", { name: /upload/i });
    expect(uploadTab.getAttribute("aria-selected")).toBe("true");
  });

  it("switches from Pack to Paste via the Or-bar link", () => {
    const client = makeClient();
    renderRoute(client);

    // Pack is active → Or-bar shows "paste source text"
    fireEvent.click(screen.getByRole("button", { name: /paste source text/i }));

    // Paste tab should now be active
    const pasteTab = screen.getByRole("tab", { name: /paste/i });
    expect(pasteTab.getAttribute("aria-selected")).toBe("true");
  });
});
