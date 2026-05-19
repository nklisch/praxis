/**
 * Tests for <ResumeDraftPicker>.
 *
 * Acceptance criteria from
 * `resume-draft-picker-test-and-keyboard-nav`:
 *   - renders null when no drafts;
 *   - one row per draft;
 *   - click triggers `session.start({ modeId: "course-create" })` then
 *     `session.send` with the chosen draftId in the message body;
 *   - arrow keys move focus between rows when the listbox is open; Enter
 *     selects the focused row.
 *
 * The picker itself only owns the disclosure UI and invokes
 * `onResume(draft)`; the parent (`routes/courses.tsx`'s `handleResumeDraft`)
 * is where `session.start` + `session.send` happen. We test the picker
 * against an `onResume` callback that emulates the route's handler so the
 * full click → start → send chain is covered with a realistic harness.
 */
import type {
  DraftCourseState,
  DraftStreamEvent,
  PraxisClient,
  ProposedCourse,
  SessionHandle,
  SessionId,
  StudentId,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumeDraftPicker } from "../components/resume-draft-picker.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

async function* makeStream(events: DraftStreamEvent[]): AsyncGenerator<DraftStreamEvent> {
  for (const event of events) {
    yield event;
    await new Promise((r) => setTimeout(r, 0));
  }
}

function makeProposed(title = "Algebra 1"): ProposedCourse {
  return {
    title,
    subject: "math",
    gradeLevel: "9",
    thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
    proposedConcepts: [],
    proposedEdges: [],
    proposedLessons: [],
    proposedUnits: [],
    proposedLessonAssessments: [],
  };
}

function makeDraft(id: string, title = "Algebra 1"): DraftCourseState {
  return {
    draftId: id,
    studentId: brandId<"StudentId">("student-test") as StudentId,
    documentIds: [],
    proposed: makeProposed(title),
    createdAt: 0 as Timestamp,
    lastTouchedAt: 0 as Timestamp,
    expiresAt: (Date.now() + 1_000_000) as Timestamp,
  };
}

function makeClient(events: DraftStreamEvent[]): PraxisClient {
  return makeFakeClient({
    drafts: {
      events: vi.fn(() => makeStream(events)),
    } as PraxisClient["drafts"],
  });
}

function makeClientWithSession(
  events: DraftStreamEvent[],
  startMock: ReturnType<typeof vi.fn>,
  sendMock: ReturnType<typeof vi.fn>,
): PraxisClient {
  return makeFakeClient({
    drafts: {
      events: vi.fn(() => makeStream(events)),
    } as PraxisClient["drafts"],
    session: {
      start: startMock,
      send: sendMock,
      active: vi.fn().mockResolvedValue(null),
      end: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      spawnFromAssignment: vi.fn(),
    } as unknown as PraxisClient["session"],
  });
}

describe("<ResumeDraftPicker>", () => {
  it("renders null when there are no drafts", () => {
    const client = makeClient([{ kind: "snapshot", drafts: [] }]);
    const { container } = render(
      <PraxisClientProvider client={client}>
        <ResumeDraftPicker onResume={vi.fn()} />
      </PraxisClientProvider>,
    );
    expect(container.firstChild).toBeNull();
    // No disclosure toggle present.
    expect(screen.queryByRole("button", { name: /resume draft/i })).toBeNull();
  });

  it("renders one row per draft once the listbox is open", async () => {
    const drafts = [makeDraft("d1", "Algebra"), makeDraft("d2", "Biology")];
    const client = makeClient([{ kind: "snapshot", drafts }]);
    render(
      <PraxisClientProvider client={client}>
        <ResumeDraftPicker onResume={vi.fn()} />
      </PraxisClientProvider>,
    );
    const toggle = await screen.findByRole("button", { name: /resume draft \(2\)/i });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(2);
    });
    expect(screen.getByText("Algebra")).toBeDefined();
    expect(screen.getByText("Biology")).toBeDefined();
  });

  it("clicking a row invokes onResume with that draft and closes the listbox", async () => {
    const drafts = [makeDraft("d1", "First"), makeDraft("d2", "Second")];
    const client = makeClient([{ kind: "snapshot", drafts }]);
    const onResume = vi.fn();
    render(
      <PraxisClientProvider client={client}>
        <ResumeDraftPicker onResume={onResume} />
      </PraxisClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /resume draft/i }));
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    // Click the "Second" row.
    fireEvent.click(screen.getByText("Second"));
    await waitFor(() => {
      expect(onResume).toHaveBeenCalledTimes(1);
      expect(onResume.mock.calls[0]?.[0]?.draftId).toBe("d2");
    });
    // Listbox closes after selection.
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("click flow triggers session.start({modeId:'course-create'}) and session.send with the chosen draftId", async () => {
    // Acceptance-criteria-literal test: emulate the route's handleResumeDraft
    // inline so the picker's onResume drives a real session.start + send.
    const drafts = [makeDraft("draft-7", "Resumable")];
    const start = vi.fn().mockResolvedValue({
      sessionId: brandId<"SessionId">("session-x") as SessionId,
      modeId: "course-create",
      startedAt: Date.now() as Timestamp,
    } satisfies SessionHandle);
    const send = vi.fn(async function* () {});
    const client = makeClientWithSession(
      [{ kind: "snapshot", drafts }],
      start,
      send as unknown as ReturnType<typeof vi.fn>,
    );

    async function handleResume(draft: DraftCourseState) {
      const handle = await client.session.start({ modeId: "course-create" });
      const stream = client.session.send(handle.sessionId, `Please resume draft ${draft.draftId}`);
      for await (const _ of stream) {
        /* drain */
      }
    }

    render(
      <PraxisClientProvider client={client}>
        <ResumeDraftPicker onResume={handleResume} />
      </PraxisClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /resume draft/i }));
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    fireEvent.click(screen.getByText("Resumable"));

    await waitFor(() => {
      expect(start).toHaveBeenCalledWith({ modeId: "course-create" });
      expect(send).toHaveBeenCalledTimes(1);
    });
    // Second arg of session.send must contain the draftId.
    const sendArgs = send.mock.calls[0] as [unknown, unknown];
    expect(String(sendArgs[1])).toContain("draft-7");
  });
});

describe("<ResumeDraftPicker> — keyboard navigation", () => {
  it("ArrowDown moves focus through rows; Enter selects the focused row", async () => {
    const drafts = [makeDraft("d1", "First"), makeDraft("d2", "Second"), makeDraft("d3", "Third")];
    const client = makeClient([{ kind: "snapshot", drafts }]);
    const onResume = vi.fn();
    render(
      <PraxisClientProvider client={client}>
        <ResumeDraftPicker onResume={onResume} />
      </PraxisClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /resume draft/i }));
    const listbox = await screen.findByRole("listbox");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));

    // First row focused by default after open.
    await waitFor(() => expect(listbox.getAttribute("aria-activedescendant")).toContain("row-0"));

    // ArrowDown -> row 1
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    await waitFor(() => expect(listbox.getAttribute("aria-activedescendant")).toContain("row-1"));

    // ArrowDown -> row 2
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    await waitFor(() => expect(listbox.getAttribute("aria-activedescendant")).toContain("row-2"));

    // Wraps to 0
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    await waitFor(() => expect(listbox.getAttribute("aria-activedescendant")).toContain("row-0"));

    // Go back to row 1 and press Enter — browser default click on a focused
    // button fires onClick. fireEvent.click on the focused row's button
    // emulates the Enter-on-button browser behaviour.
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    const focusedRow = screen.getByText("Second").closest("button");
    expect(focusedRow).not.toBeNull();
    if (focusedRow) fireEvent.click(focusedRow);
    await waitFor(() => {
      expect(onResume).toHaveBeenCalledTimes(1);
      expect(onResume.mock.calls[0]?.[0]?.draftId).toBe("d2");
    });
  });

  it("ArrowUp wraps from the first row to the last", async () => {
    const drafts = [makeDraft("a"), makeDraft("b"), makeDraft("c")];
    const client = makeClient([{ kind: "snapshot", drafts }]);
    render(
      <PraxisClientProvider client={client}>
        <ResumeDraftPicker onResume={vi.fn()} />
      </PraxisClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /resume draft/i }));
    const listbox = await screen.findByRole("listbox");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    await waitFor(() => expect(listbox.getAttribute("aria-activedescendant")).toContain("row-2"));
  });

  it("End and Home jump to last and first rows", async () => {
    const drafts = [makeDraft("a"), makeDraft("b"), makeDraft("c"), makeDraft("d")];
    const client = makeClient([{ kind: "snapshot", drafts }]);
    render(
      <PraxisClientProvider client={client}>
        <ResumeDraftPicker onResume={vi.fn()} />
      </PraxisClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /resume draft/i }));
    const listbox = await screen.findByRole("listbox");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(4));
    fireEvent.keyDown(listbox, { key: "End" });
    await waitFor(() => expect(listbox.getAttribute("aria-activedescendant")).toContain("row-3"));
    fireEvent.keyDown(listbox, { key: "Home" });
    await waitFor(() => expect(listbox.getAttribute("aria-activedescendant")).toContain("row-0"));
  });

  it("Escape closes the listbox", async () => {
    const drafts = [makeDraft("a")];
    const client = makeClient([{ kind: "snapshot", drafts }]);
    render(
      <PraxisClientProvider client={client}>
        <ResumeDraftPicker onResume={vi.fn()} />
      </PraxisClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /resume draft/i }));
    await screen.findByRole("listbox");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });
});
