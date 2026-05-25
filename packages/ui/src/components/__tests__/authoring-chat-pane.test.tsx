/**
 * Tests for <AuthoringChatPane> and its thin wrapper <ConfigureChatPane>.
 *
 * Verifies:
 * - Renders the mode-specific header label for "configure".
 * - Renders the mode-specific header label for "course-create".
 * - Shows "Starting session…" status when sessionId is null.
 * - Shows "Ready" status when sessionId is present and not streaming.
 * - Shows the mode-specific empty-state hint when no messages are present.
 * - Composer is disabled when sessionId is null.
 * - <ConfigureChatPane> wrapper renders as "configure" mode.
 * - Correlates multiple same-kind tool calls in a turn to actionIds in time order.
 * - Does not attach an actionId when there are more tool_call entries than actions of that kind.
 */
import type {
  ConfiguratorActionRow,
  ConfiguratorId,
  EpisodicEvent,
  EventId,
  PraxisClient,
  SessionId,
  StudentId,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { AuthoringChatPane } from "../authoring-chat-pane.js";
import { ConfigureChatPane } from "../configure-chat-pane.js";

afterEach(() => cleanup());

const SESSION_ID = brandId<"SessionId">("sess-authoring-1") as SessionId;
const STUDENT_ID = brandId<"StudentId">("student-test-1") as StudentId;
const CONFIGURATOR_ID = brandId<"ConfiguratorId">("cfg-test-1") as ConfiguratorId;

function makeClient(): PraxisClient {
  return makeFakeClient({
    memory: {
      episodic: vi.fn(async function* () {}),
    } as unknown as PraxisClient["memory"],
    author: {
      listConfiguratorActions: vi.fn().mockResolvedValue([]),
      restoreAction: vi
        .fn()
        .mockResolvedValue({ ok: true, restoredEntity: "lesson", entityKey: "lesson-x" }),
    } as unknown as PraxisClient["author"],
  });
}

/**
 * Build a minimal EpisodicEvent wrapping a tool_call engine event.
 */
function makeToolCallEp(
  callId: string,
  toolName: string,
  turnIndex: number,
  ts: number,
): EpisodicEvent {
  return {
    id: brandId<"EventId">(`ev-call-${callId}`) as EventId,
    sessionId: SESSION_ID,
    studentId: STUDENT_ID,
    ts: ts as Timestamp,
    source: { engineId: "claude-code", modeId: "configure", turnIndex },
    event: { type: "tool_call", toolName, callId, args: {} },
  };
}

/**
 * Build a minimal EpisodicEvent wrapping a tool_result engine event (ok).
 */
function makeToolResultEp(callId: string, turnIndex: number, ts: number): EpisodicEvent {
  return {
    id: brandId<"EventId">(`ev-result-${callId}`) as EventId,
    sessionId: SESSION_ID,
    studentId: STUDENT_ID,
    ts: ts as Timestamp,
    source: { engineId: "claude-code", modeId: "configure", turnIndex },
    event: {
      type: "tool_result",
      callId,
      result: { ok: true, value: { summary: "done" }, tier: "deterministic" as const },
    },
  };
}

/**
 * Build a ConfiguratorActionRow for testing.
 */
function makeActionRow(
  id: string,
  kind: ConfiguratorAction["kind"],
  ts: number,
): ConfiguratorActionRow {
  return {
    id,
    configuratorId: CONFIGURATOR_ID,
    ts: ts as Timestamp,
    action: buildAction(kind),
  };
}

type ConfiguratorAction =
  | { kind: "lesson.create"; courseId: string; lessonId: string }
  | { kind: "lesson.edit"; lessonId: string; patch: unknown }
  | { kind: "gate.create"; gateId: string; courseId: string };

function buildAction(kind: ConfiguratorAction["kind"]): ConfiguratorActionRow["action"] {
  if (kind === "lesson.create") {
    return {
      kind: "lesson.create",
      courseId: brandId<"CourseId">("course-1") as import("@praxis/core/types").CourseId,
      lessonId: brandId<"LessonId">("lesson-1") as import("@praxis/core/types").LessonId,
    };
  }
  if (kind === "gate.create") {
    return {
      kind: "gate.create",
      gateId: brandId<"GateId">("gate-1") as import("@praxis/core/types").GateId,
      courseId: brandId<"CourseId">("course-1") as import("@praxis/core/types").CourseId,
    };
  }
  return {
    kind: "lesson.edit",
    lessonId: brandId<"LessonId">("lesson-1") as import("@praxis/core/types").LessonId,
    patch: {},
  };
}

function Wrapper({ client, children }: { client: PraxisClient; children: React.ReactNode }) {
  return <PraxisClientProvider client={client}>{children}</PraxisClientProvider>;
}

describe("AuthoringChatPane", () => {
  it("renders 'Configure assistant' header for configure mode", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={SESSION_ID} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Configure assistant");
  });

  it("renders 'Course-design assistant' header for course-create mode", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="course-create" sessionId={SESSION_ID} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Course-design assistant");
  });

  it("shows 'Starting session…' when sessionId is null", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={null} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Starting session…");
  });

  it("shows 'Ready' when sessionId is present and not streaming", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={SESSION_ID} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Ready");
  });

  it("shows configure empty-state hint for configure mode", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={SESSION_ID} />
      </Wrapper>,
    );
    expect(container.textContent).toContain(
      "Ask me to edit courses, lessons, gates, or customize prompts.",
    );
  });

  it("shows course-create empty-state hint for course-create mode", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="course-create" sessionId={SESSION_ID} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Steer the draft");
  });

  it("composer textarea is never disabled (even when sessionId is null)", () => {
    // The composer no longer accepts a `disabled` prop — it is always interactive.
    // When sessionId is null the user can type; the send action is a no-op until
    // a session is established.
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={null} />
      </Wrapper>,
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea?.disabled).toBe(false);
  });

  it("composer textarea is not disabled when sessionId is present and not streaming", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={SESSION_ID} />
      </Wrapper>,
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea?.disabled).toBe(false);
  });
});

describe("ConfigureChatPane", () => {
  it("renders as configure mode (shows 'Configure assistant')", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <ConfigureChatPane sessionId={SESSION_ID} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Configure assistant");
  });

  it("composer textarea is never disabled (disabled prop removed)", () => {
    // ConfigureChatPane no longer accepts a `disabled` prop — the composer is
    // always interactive per the composer-async-behavior design.
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <ConfigureChatPane sessionId={SESSION_ID} />
      </Wrapper>,
    );
    const textarea = container.querySelector("textarea");
    expect(textarea?.disabled).toBe(false);
  });

  it("renders 'Starting session…' when sessionId is null", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <ConfigureChatPane sessionId={null} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Starting session…");
  });
});

describe("AuthoringChatPane — revert correlation (same-kind tool calls)", () => {
  /**
   * Pins the behavioral invariant documented in the implementation notes:
   * "n-th settled entry of a kind maps to n-th action row of that kind,
   * sorted by ts asc".
   *
   * Setup: two lesson.create tool_call/tool_result pairs in episodic order,
   * matched against two ConfiguratorActionRow entries with distinct ids and
   * ascending ts. The first ToolCallEntry must correlate to a-1 (lower ts)
   * and the second to a-2 (higher ts).
   *
   * Assertion method: click each revert button and confirm in the modal;
   * verify restoreAction is called with the expected actionId at each position.
   */
  it("correlates multiple same-kind tool calls in a turn to actionIds in time order", async () => {
    // Two actions with ascending ts — correlation should be in this ts order.
    const actions: ConfiguratorActionRow[] = [
      makeActionRow("a-1", "lesson.create", 1000),
      makeActionRow("a-2", "lesson.create", 1100),
    ];

    // Episodic history: two lesson.create tool calls (call-1, call-2) in turn 0.
    const episodicEvents: EpisodicEvent[] = [
      makeToolCallEp("call-1", "lesson.create", 0, 1000),
      makeToolResultEp("call-1", 0, 1001),
      makeToolCallEp("call-2", "lesson.create", 0, 1100),
      makeToolResultEp("call-2", 0, 1101),
    ];

    const restoreAction = vi.fn().mockResolvedValue({
      ok: true,
      restoredEntity: "lesson",
      entityKey: "lesson-x",
    });

    const client = makeFakeClient({
      memory: {
        episodic: vi.fn(async function* () {
          yield* episodicEvents;
        }),
      } as unknown as PraxisClient["memory"],
      author: {
        listConfiguratorActions: vi.fn().mockResolvedValue(actions),
        restoreAction,
      } as unknown as PraxisClient["author"],
    });

    render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={SESSION_ID} />
      </Wrapper>,
    );

    // Wait for both revert buttons to appear (history loads async).
    const [revertBtn1, revertBtn2] = await screen.findAllByRole("button", {
      name: /revert lesson\.create/i,
    });
    expect(revertBtn1).toBeDefined();
    expect(revertBtn2).toBeDefined();

    // Click the first entry's revert button and confirm → should call restoreAction with a-1.
    fireEvent.click(revertBtn1 as HTMLElement);
    const [confirmBtn1] = await screen.findAllByRole("button", { name: /^revert$/i });
    fireEvent.click(confirmBtn1 as HTMLElement);
    await waitFor(() => expect(restoreAction).toHaveBeenCalledWith({ actionId: "a-1" }));

    // Reset the mock call count, then click the second entry's revert button.
    restoreAction.mockClear();
    // Re-query — the first entry may now show "restored"; the second still has its revert button.
    const [remainingRevertBtn] = await screen.findAllByRole("button", {
      name: /revert lesson\.create/i,
    });
    fireEvent.click(remainingRevertBtn as HTMLElement);
    const [confirmBtn2] = await screen.findAllByRole("button", { name: /^revert$/i });
    fireEvent.click(confirmBtn2 as HTMLElement);
    await waitFor(() => expect(restoreAction).toHaveBeenCalledWith({ actionId: "a-2" }));
  });

  /**
   * When there are more tool_call entries for a kind than action rows of that
   * kind, the excess entries beyond the last correlated action must not show a
   * revert button. The n-th+1 entry has no matching row in the zip.
   */
  it("does not attach an actionId when there are more tool_call entries than actions of that kind", async () => {
    // Only two actions but three tool_call entries of the same kind.
    const actions: ConfiguratorActionRow[] = [
      makeActionRow("a-1", "lesson.create", 1000),
      makeActionRow("a-2", "lesson.create", 1100),
    ];

    const episodicEvents: EpisodicEvent[] = [
      makeToolCallEp("call-1", "lesson.create", 0, 1000),
      makeToolResultEp("call-1", 0, 1001),
      makeToolCallEp("call-2", "lesson.create", 0, 1100),
      makeToolResultEp("call-2", 0, 1101),
      makeToolCallEp("call-3", "lesson.create", 0, 1200),
      makeToolResultEp("call-3", 0, 1201),
    ];

    const client = makeFakeClient({
      memory: {
        episodic: vi.fn(async function* () {
          yield* episodicEvents;
        }),
      } as unknown as PraxisClient["memory"],
      author: {
        listConfiguratorActions: vi.fn().mockResolvedValue(actions),
        restoreAction: vi.fn(),
      } as unknown as PraxisClient["author"],
    });

    render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={SESSION_ID} />
      </Wrapper>,
    );

    // Wait for the two correlated revert buttons (a-1 and a-2) to appear.
    await screen.findAllByRole("button", { name: /revert lesson\.create/i });

    // The third entry has no matching action → only 2 revert buttons total.
    const revertButtons = screen.getAllByRole("button", { name: /revert lesson\.create/i });
    expect(revertButtons).toHaveLength(2);
  });
});
