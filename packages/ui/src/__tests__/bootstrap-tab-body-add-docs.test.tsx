/**
 * Interaction tests for the "Add documents" affordance on BootstrapTabBody.
 *
 * Verifies:
 * - An "Add documents" button is rendered in the outline header.
 * - Clicking it opens the LibraryDocumentPicker with the session scope.
 * - Clicking Attach inside the picker calls client.documentScopes.attach
 *   with { scope: { kind: 'session', id: sessionId }, ... }.
 * - The picker closes when its onClose is called.
 */
import type { SessionId, SessionTabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// Mock TanStack Router so useNavigate works in test context.
const mockNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({}),
  };
});

// Mock heavy sub-components to keep test fast and focused.
vi.mock("../components/authoring-chat-pane.js", () => ({
  AuthoringChatPane: () => <div data-testid="authoring-chat-pane" />,
}));
vi.mock("../components/draft-card.js", () => ({
  DraftCard: () => <div data-testid="draft-card" />,
}));
vi.mock("../hooks/use-drafts.js", () => ({
  useDrafts: () => ({ current: null }),
}));
vi.mock("../hooks/use-bootstrap-budget.js", () => ({
  BOOTSTRAP_BUDGET_MIN: 5,
  BOOTSTRAP_BUDGET_MAX: 200,
  useBootstrapBudget: () => ({ maxSteps: 100, saving: false, setMaxSteps: vi.fn() }),
}));

// Import after mocks (Vitest hoists vi.mock calls).
const { BootstrapTabBody } = await import("../components/bootstrap-tab-body.js");

afterEach(() => cleanup());

const SESSION_ID = brandId<"SessionId">("session-bootstrap-1") as SessionId;

function makeTab(overrides: Partial<SessionTabSummary> = {}): SessionTabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: SESSION_ID,
    modeId: "course-create",
    title: "course-create",
    sortOrder: 0,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 5_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function renderBootstrap(attachFn = vi.fn().mockResolvedValue({ attached: true })) {
  const client = makeFakeClient({
    documents: {
      list: vi.fn().mockResolvedValue([
        {
          documentId: "doc-x",
          filename: "biology.pdf",
          mimeType: "application/pdf",
          ingestorId: "js-pdf",
          ingestorLabel: "JS PDF",
          chunkCount: 3,
          createdAt: new Date().toISOString(),
          hasPageImages: false,
        },
      ]),
      delete: vi.fn(),
      pageImage: vi.fn().mockResolvedValue(null),
      get: vi.fn().mockResolvedValue(null),
    },
    documentScopes: {
      listForScope: vi.fn().mockResolvedValue([]),
      attach: attachFn,
      detach: vi.fn().mockResolvedValue({ detached: true }),
      listOrphaned: vi.fn().mockResolvedValue([]),
      listScopesForDocument: vi.fn().mockResolvedValue([]),
    },
    subAgent: {
      list: vi.fn().mockResolvedValue([]),
      events: vi.fn(async function* () {}),
    },
    // The finalization handler subscribes to drafts.events — return an empty
    // async generator so the useEffect doesn't throw in tests.
    drafts: {
      events: vi.fn(async function* () {}),
    } as unknown as ReturnType<typeof makeFakeClient>["drafts"],
  });

  return {
    client,
    attachFn,
    ...render(
      <PraxisClientProvider client={client}>
        <BootstrapTabBody tab={makeTab()} />
      </PraxisClientProvider>,
    ),
  };
}

describe("BootstrapTabBody — Add documents affordance", () => {
  it("renders an 'Add documents' button in the outline header", () => {
    renderBootstrap();
    expect(screen.getByRole("button", { name: /add documents/i })).toBeDefined();
  });

  it("clicking 'Add documents' opens the LibraryDocumentPicker modal", async () => {
    renderBootstrap();

    fireEvent.click(screen.getByRole("button", { name: /add documents/i }));

    // The picker modal renders a dialog with LIBRARY kicker.
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByText("LIBRARY")).toBeDefined();
    });
  });

  it("attach inside the picker calls documentScopes.attach with session scope", async () => {
    const attachFn = vi.fn().mockResolvedValue({ attached: true });
    renderBootstrap(attachFn);

    // Open picker.
    fireEvent.click(screen.getByRole("button", { name: /add documents/i }));

    // Wait for the library doc row to appear.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
    });

    // Click Attach.
    fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

    await waitFor(() => {
      expect(attachFn).toHaveBeenCalledWith({
        scope: { kind: "session", id: SESSION_ID },
        documentId: "doc-x",
        source: "manual",
      });
    });
  });

  it("picker closes when Close is clicked", async () => {
    renderBootstrap();

    // Open picker.
    fireEvent.click(screen.getByRole("button", { name: /add documents/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    // Close picker.
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
