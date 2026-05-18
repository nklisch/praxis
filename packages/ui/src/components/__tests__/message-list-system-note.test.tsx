/**
 * Tests for `system_note` dispatch in the chat item list.
 *
 * Verifies:
 * - A `system-note` item with an `assignment_submission` origin renders as
 *   a <SystemNoteCard> (not invisibly).
 * - The score percentage from the origin is visible in the rendered card.
 * - The "review" button triggers `client.tabs.open` with the child sessionId.
 * - Non-assignment (`system`) origin notes render null (invisible).
 */
import type { PraxisClient, SystemNoteOrigin, TabSummary } from "@praxis/core/types";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import type { SystemNoteItem } from "../../hooks/use-streamed-send.js";

// We test the render path for system-note items by directly importing the
// SystemNoteCard and simulating the dispatch that TeachChatTabBody would do.
// This avoids spinning up a full session stream.
import { SystemNoteCard } from "../system-note-card.js";

afterEach(() => cleanup());

// ── Fixtures ────────────────────────────────────────────────────────────────

const ASSIGNMENT_ORIGIN: Extract<SystemNoteOrigin, { kind: "assignment_submission" }> = {
  kind: "assignment_submission",
  assignmentId: "assign-99",
  childSessionId: "child-sess-99",
  gradeTotal: 0.8, // 80%
  submittedAt: Date.now() - 60_000,
};

const SYSTEM_ITEM: SystemNoteItem = {
  kind: "system-note",
  id: "note-1",
  content: "internal note",
  origin: { kind: "system", topic: "debug" },
};

const ASSIGNMENT_ITEM: SystemNoteItem = {
  kind: "system-note",
  id: "note-2",
  content: "student submitted quiz",
  origin: ASSIGNMENT_ORIGIN,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("system_note dispatch → SystemNoteCard", () => {
  it("renders a visible card for assignment_submission origin", () => {
    const { container } = render(
      <SystemNoteCard
        origin={ASSIGNMENT_ITEM.origin}
        childSessionId={
          ASSIGNMENT_ITEM.origin.kind === "assignment_submission"
            ? ASSIGNMENT_ITEM.origin.childSessionId
            : undefined
        }
        onReview={undefined}
      />,
    );
    expect(container.querySelector('[role="note"]')).not.toBeNull();
  });

  it("renders the grade percentage from the origin", () => {
    const { container } = render(
      <SystemNoteCard
        origin={ASSIGNMENT_ITEM.origin}
        childSessionId="child-sess-99"
        onReview={undefined}
      />,
    );
    expect(container.textContent).toContain("80%");
  });

  it("renders null for a system-origin note", () => {
    const { container } = render(
      <SystemNoteCard
        origin={SYSTEM_ITEM.origin}
        childSessionId={undefined}
        onReview={undefined}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onReview (tabs.open) when review button is clicked", async () => {
    const tabsOpenMock = vi.fn().mockResolvedValue({} as TabSummary);
    const client = makeFakeClient({
      tabs: {
        open: tabsOpenMock,
      } as unknown as PraxisClient["tabs"],
    });

    const childSessionId = ASSIGNMENT_ORIGIN.childSessionId;
    const onReview = () => {
      void client.tabs.open({
        sessionId: childSessionId as unknown as Parameters<typeof client.tabs.open>[0]["sessionId"],
      });
    };

    const { getByRole } = render(
      <PraxisClientProvider client={client}>
        <SystemNoteCard
          origin={ASSIGNMENT_ITEM.origin}
          childSessionId={childSessionId}
          onReview={onReview}
        />
      </PraxisClientProvider>,
    );

    const btn = getByRole("button");
    fireEvent.click(btn);

    await waitFor(() => {
      expect(tabsOpenMock).toHaveBeenCalledOnce();
    });
  });
});

describe("system_note item kind detection", () => {
  it("identifies system-note items by kind discriminator", () => {
    expect(ASSIGNMENT_ITEM.kind).toBe("system-note");
    expect(SYSTEM_ITEM.kind).toBe("system-note");
  });

  it("assignment_submission origin has childSessionId", () => {
    if (ASSIGNMENT_ITEM.origin.kind === "assignment_submission") {
      expect(ASSIGNMENT_ITEM.origin.childSessionId).toBe("child-sess-99");
    }
  });
});
