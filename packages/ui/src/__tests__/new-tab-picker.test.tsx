/**
 * Tests for the NewTabPicker modal component.
 *
 * Verifies:
 * - Renders mode radio group
 * - Renders course dropdown (visible for teach mode, teach is default)
 * - Submitting calls session.start then tabs.open; onOpened fires on success
 * - Errors render inline; modal stays open
 * - Cancel button closes the picker (calls onClose)
 * - ESC calls onClose
 * - Backdrop click calls onClose
 */
import type {
  EngineEvent,
  PraxisClient,
  SessionHandle,
  TabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewTabPicker } from "../components/new-tab-picker.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

const SESSION_HANDLE: SessionHandle = {
  sessionId: brandId<"SessionId">("session-1"),
  modeId: "teach",
  startedAt: Date.now() as Timestamp,
};

const TAB_RESULT: TabSummary = {
  id: brandId<"TabId">("new-tab-1"),
  sessionId: brandId<"SessionId">("session-1"),
  modeId: "teach",
  title: "teach · new chat",
  sortOrder: 0,
  openedAt: Date.now() as Timestamp,
  lastSeenAt: Date.now() as Timestamp,
  closedAt: null,
};

function makeClient(overrides?: {
  start?: PraxisClient["session"]["start"];
  tabsOpen?: PraxisClient["tabs"]["open"];
}): PraxisClient {
  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start:
        overrides?.start ??
        (vi.fn().mockResolvedValue(SESSION_HANDLE) as PraxisClient["session"]["start"]),
      end: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("session-1"),
        endedAt: Date.now() as Timestamp,
        unlockedGates: [],
        newMisconceptions: 0,
      }),
      send: vi.fn(
        async function* (): AsyncIterable<EngineEvent> {},
      ) as unknown as PraxisClient["session"]["send"],
      list: vi.fn().mockResolvedValue([]),
    },
    tabs: {
      listOpen: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      open: overrides?.tabsOpen ?? vi.fn().mockResolvedValue(TAB_RESULT),
      reopen: vi.fn().mockResolvedValue(TAB_RESULT),
      close: vi.fn().mockResolvedValue(undefined),
      touch: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(TAB_RESULT),
    },
    artifacts: {
      courses: vi.fn().mockResolvedValue([
        {
          courseId: brandId<"CourseId">("course-1"),
          title: "Algebra 1",
          subject: "math",
          gradeLevel: "grade-8",
          lessonCount: 5,
          conceptCount: 20,
          studiedConcepts: 3,
          createdAt: Date.now() as Timestamp,
        },
      ]),
      course: vi.fn(),
      lessons: vi.fn(),
      gates: vi.fn(),
      progress: vi.fn(),
      flashcards: vi.fn(),
      notes: vi.fn(),
      gateView: vi.fn().mockResolvedValue([]),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
      concepts: vi.fn().mockResolvedValue([]),
    } as PraxisClient["artifacts"],
  });
}

function renderPicker({
  client,
  onClose = vi.fn(),
  onOpened = vi.fn(),
  openTab,
}: {
  client: PraxisClient;
  onClose?: () => void;
  onOpened?: (tabId: import("@praxis/core/types").TabId) => void;
  openTab?: (input: {
    sessionId: import("@praxis/core/types").SessionId;
    courseTitle?: string;
  }) => Promise<import("@praxis/core/types").TabSummary>;
}) {
  // Default openTab delegates to client.tabs.open so existing tests that
  // assert on the IPC channel still pass without per-test setup.
  // biome-ignore lint/suspicious/noExplicitAny: branded id passthrough in test glue
  const defaultOpenTab = openTab ?? ((input: any) => client.tabs.open(input));
  return render(
    <PraxisClientProvider client={client}>
      <NewTabPicker onClose={onClose} openTab={defaultOpenTab} onOpened={onOpened} />
    </PraxisClientProvider>,
  );
}

describe("NewTabPicker", () => {
  it("renders as a dialog with the NEW SESSION kicker", () => {
    const client = makeClient();
    renderPicker({ client });

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("NEW SESSION")).toBeDefined();
  });

  it("renders mode radio buttons for all modes", () => {
    const client = makeClient();
    renderPicker({ client });

    const modes = ["teach", "bootstrap", "quiz", "homework", "exam", "configure"];
    for (const mode of modes) {
      expect(screen.getByRole("radio", { name: mode })).toBeDefined();
    }
  });

  it("teach is selected by default", () => {
    const client = makeClient();
    renderPicker({ client });

    const teachRadio = screen.getByRole("radio", { name: "teach" }) as HTMLInputElement;
    expect(teachRadio.checked).toBe(true);
  });

  it("renders course dropdown when teach mode is selected", async () => {
    const client = makeClient();
    renderPicker({ client });

    // Course dropdown should be visible (teach is default and accepts courses)
    expect(screen.getByRole("combobox", { name: /course/i })).toBeDefined();

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Algebra 1" })).toBeDefined();
    });
  });

  it("hides course dropdown when configure mode is selected", () => {
    const client = makeClient();
    renderPicker({ client });

    fireEvent.click(screen.getByRole("radio", { name: "configure" }));

    expect(screen.queryByRole("combobox", { name: /course/i })).toBeNull();
  });

  it("submitting calls session.start then tabs.open; onOpened fires with the new tab id", async () => {
    const onOpened = vi.fn();
    const client = makeClient();
    renderPicker({ client, onOpened });

    fireEvent.click(screen.getByRole("button", { name: /^open$/i }));

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "teach" });
      expect(client.tabs.open).toHaveBeenCalled();
      expect(onOpened).toHaveBeenCalledWith(TAB_RESULT.id);
    });
  });

  it("shows inline error when session.start fails; modal stays open", async () => {
    const client = makeClient({
      start: vi
        .fn()
        .mockRejectedValue(new Error("Engine error")) as PraxisClient["session"]["start"],
    });
    renderPicker({ client });

    fireEvent.click(screen.getByRole("button", { name: /^open$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByText(/Engine error/)).toBeDefined();
    });

    // Modal should still be visible
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("Cancel button calls onClose", () => {
    const onClose = vi.fn();
    const client = makeClient();
    renderPicker({ client, onClose });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("clicking the backdrop calls onClose", () => {
    const onClose = vi.fn();
    const client = makeClient();
    renderPicker({ client, onClose });

    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    const client = makeClient();
    renderPicker({ client, onClose });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("clicking inside the modal card does not close", () => {
    const onClose = vi.fn();
    const client = makeClient();
    renderPicker({ client, onClose });

    // The title inside the modal
    fireEvent.click(screen.getByText("open a session"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
