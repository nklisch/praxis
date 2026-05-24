/**
 * Tests that AuthoringChatPane surfaces ask_student_question cards via
 * useQuickCheckBridge for both course-create and configure modes.
 *
 * Covers the round-trip:
 *   1. quickCheck.events() emits a "pending" structured-question event
 *   2. StructuredQuestionCard renders with the question prompt
 *   3. Student clicks a choice and submits
 *   4. client.quickCheck.resolve() is called with the correct callId + answer
 */
import type { PraxisClient, QuickCheckEvent, SessionId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthoringModeId } from "../components/authoring-chat-pane.js";
import { AuthoringChatPane } from "../components/authoring-chat-pane.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => {
  cleanup();
});

const sessionId = brandId<"SessionId">("session-cc") as unknown as SessionId;

/** Build an async iterable from an event array that holds the stream open. */
function makeEventIterable(events: QuickCheckEvent[]): AsyncIterable<QuickCheckEvent> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < events.length) {
            // biome-ignore lint/style/noNonNullAssertion: index is bounds-checked above
            const value = events[index++]!;
            await new Promise((r) => setTimeout(r, 0));
            return { value, done: false as const };
          }
          // Hold open forever so the hook doesn't exit.
          await new Promise(() => {});
          return { value: undefined as never, done: true as const };
        },
      };
    },
  };
}

function makeClient(events: QuickCheckEvent[], resolveMock = vi.fn()): PraxisClient {
  return makeFakeClient({
    session: {
      send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
    } as unknown as PraxisClient["session"],
    memory: {
      episodic: vi.fn(async function* () {}),
    } as unknown as PraxisClient["memory"],
    author: {
      listConfiguratorActions: vi.fn().mockResolvedValue([]),
    } as unknown as PraxisClient["author"],
    quickCheck: {
      events: () => makeEventIterable(events),
      resolve: resolveMock.mockResolvedValue(undefined),
    } as unknown as PraxisClient["quickCheck"],
  });
}

function renderPane(
  mode: AuthoringModeId,
  client: PraxisClient,
  sid: SessionId | null = sessionId,
) {
  return render(
    <PraxisClientProvider client={client}>
      <AuthoringChatPane mode={mode} sessionId={sid} />
    </PraxisClientProvider>,
  );
}

describe("AuthoringChatPane — ask_student_question surface (course-create mode)", () => {
  it("renders StructuredQuestionCard when a pending structured-question event arrives", async () => {
    const event: QuickCheckEvent = {
      kind: "pending",
      callId: "call-sq-1",
      sessionId,
      item: {
        kind: "structured-question",
        id: "sq-1",
        questions: [
          {
            header: "Audience",
            prompt: "Who is the target audience for this course?",
            multiSelect: false,
            options: [{ label: "Beginners" }, { label: "Intermediate" }, { label: "Advanced" }],
          },
        ],
      },
    };

    const client = makeClient([event]);
    renderPane("course-create", client);

    await waitFor(() => {
      expect(screen.getByText("Who is the target audience for this course?")).toBeDefined();
    });

    // All three options should be visible
    expect(screen.getByText("Beginners")).toBeDefined();
    expect(screen.getByText("Intermediate")).toBeDefined();
    expect(screen.getByText("Advanced")).toBeDefined();
  });

  it("calls client.quickCheck.resolve with the selected choice on submit", async () => {
    const resolveMock = vi.fn().mockResolvedValue(undefined);

    const event: QuickCheckEvent = {
      kind: "pending",
      callId: "call-sq-2",
      sessionId,
      item: {
        kind: "structured-question",
        id: "sq-2",
        questions: [
          {
            header: "Depth",
            prompt: "How deep should the course go?",
            multiSelect: false,
            options: [{ label: "Survey" }, { label: "Deep dive" }],
          },
        ],
      },
    };

    const client = makeClient([event], resolveMock);
    renderPane("course-create", client);

    // Wait for card to appear
    await waitFor(() => {
      expect(screen.getByText("How deep should the course go?")).toBeDefined();
    });

    // Select the first option ("Survey" = index 0)
    fireEvent.click(screen.getByText("Survey"));

    // Submit button should now be enabled; click it
    const submitBtn = screen.getByRole("button", { name: /submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(resolveMock).toHaveBeenCalledWith({
        callId: "call-sq-2",
        answer: {
          kind: "structured-question",
          answers: [{ questionIndex: 0, selectedIndices: [0] }],
        },
      });
    });
  });
});

describe("AuthoringChatPane — ask_student_question surface (configure mode)", () => {
  it("renders StructuredQuestionCard in configure mode when a pending event arrives", async () => {
    const event: QuickCheckEvent = {
      kind: "pending",
      callId: "call-sq-cfg",
      sessionId,
      item: {
        kind: "structured-question",
        id: "sq-cfg",
        questions: [
          {
            header: "Scope",
            prompt: "Which courses should be affected?",
            multiSelect: true,
            options: [{ label: "All courses" }, { label: "Only active courses" }],
          },
        ],
      },
    };

    const client = makeClient([event]);
    renderPane("configure", client);

    await waitFor(() => {
      expect(screen.getByText("Which courses should be affected?")).toBeDefined();
    });

    expect(screen.getByText("All courses")).toBeDefined();
    expect(screen.getByText("Only active courses")).toBeDefined();
  });

  it("ignores quick-check events for other sessions", async () => {
    const otherSessionId = brandId<"SessionId">("session-other") as unknown as SessionId;

    const event: QuickCheckEvent = {
      kind: "pending",
      callId: "call-sq-other",
      sessionId: otherSessionId,
      item: {
        kind: "structured-question",
        id: "sq-other",
        questions: [
          {
            header: "Other",
            prompt: "This question belongs to another session",
            multiSelect: false,
            options: [{ label: "Option A" }],
          },
        ],
      },
    };

    const client = makeClient([event]);
    renderPane("configure", client);

    // Wait a tick and verify the card did NOT render.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("This question belongs to another session")).toBeNull();
  });
});
