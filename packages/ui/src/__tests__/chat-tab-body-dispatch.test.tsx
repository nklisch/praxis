/**
 * Tests for the ChatTabBody mode dispatcher (Phase 16).
 *
 * Verifies that each modeId routes to the correct modality body. The tab body
 * isolation invariant (all instances mount simultaneously, inactive ones use
 * display:none) is owned by the parent ChatRoute and is tested in chat-route.
 * Here we just assert the right body renders for each modeId.
 */
import type {
  Assignment,
  AssignmentId,
  PraxisClient,
  SessionTabSummary,
  TabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatTabBody, TeachChatTabBody } from "../components/chat-tab-body.js";
import { AuthProvider } from "../context/auth-context.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ tabId: undefined }),
    useSearch: () => ({}),
  };
});

vi.mock("tldraw", () => ({ Tldraw: () => <div data-testid="tldraw-canvas" /> }));
vi.mock("tldraw/tldraw.css", () => ({}));

function makeTab(overrides: Partial<TabSummary> = {}): TabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "teach",
    title: "teach · new chat",
    sortOrder: 0,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 5_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function makeClient(): PraxisClient {
  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("session-1"),
        modeId: "teach",
        startedAt: Date.now() as Timestamp,
      }),
      end: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("session-1"),
        endedAt: Date.now() as Timestamp,
        unlockedGates: [],
        newMisconceptions: 0,
      }),
      send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
      list: vi.fn().mockResolvedValue([]),
      spawnFromAssignment: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("child-1"),
        modeId: "quiz",
        startedAt: Date.now() as Timestamp,
      }),
    },
    memory: {
      episodic: vi.fn(async function* () {}),
      studentModel: vi.fn(),
      misconceptions: vi.fn(),
      procedural: vi.fn(),
      affective: vi.fn(),
      export: vi.fn(),
      delete: vi.fn(),
    } as unknown as PraxisClient["memory"],
    assignments: {
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      getResponses: vi.fn().mockResolvedValue([]),
      recordResponse: vi.fn().mockResolvedValue(undefined),
      submit: vi.fn().mockResolvedValue(null),
    },
  });
}

function renderTab(tab: TabSummary, client: PraxisClient = makeClient()) {
  return render(
    <PraxisClientProvider client={client}>
      <AuthProvider>
        <ChatTabBody tab={tab} />
      </AuthProvider>
    </PraxisClientProvider>,
  );
}

describe("ChatTabBody mode dispatcher", () => {
  it("renders quiz kicker for modeId 'quiz'", () => {
    const tab = makeTab({ modeId: "quiz" });
    renderTab(tab);
    // QuizTabBody renders a kicker with "quiz" label
    const kickerElements = document.querySelectorAll("[class*='kickerMode']");
    const texts = Array.from(kickerElements).map((el) => el.textContent);
    expect(texts.some((t) => t === "quiz")).toBe(true);
  });

  it("renders homework kicker for modeId 'homework'", () => {
    const tab = makeTab({ modeId: "homework" });
    renderTab(tab);
    const kickerElements = document.querySelectorAll("[class*='kickerMode']");
    const texts = Array.from(kickerElements).map((el) => el.textContent);
    expect(texts.some((t) => t === "homework")).toBe(true);
  });

  it("renders exam kicker for modeId 'exam'", () => {
    const tab = makeTab({ modeId: "exam" });
    renderTab(tab);
    const kickerElements = document.querySelectorAll("[class*='kickerMode']");
    const texts = Array.from(kickerElements).map((el) => el.textContent);
    expect(texts.some((t) => t === "exam")).toBe(true);
  });

  it("renders the chat composer for teach mode (default path)", () => {
    const tab = makeTab({ modeId: "teach" });
    renderTab(tab);
    // TeachChatTabBody renders a textarea (the composer)
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("renders the chat composer for unknown modeId (default fallback)", () => {
    const tab = makeTab({ modeId: "unknown-future-mode" });
    renderTab(tab);
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("does not render the chat composer in exam mode", () => {
    const tab = makeTab({ modeId: "exam" });
    renderTab(tab);
    // ExamTabBody has no chat composer (no textarea)
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("composer textarea is enabled (not disabled) for teach mode — streaming no longer locks input", () => {
    // After the composer-queue feature, isStreaming no longer sets disabled on the
    // composer — only examLockdown does. Verify the textarea is not disabled at
    // rest (non-exam, no lockdown).
    const tab = makeTab({ modeId: "teach" });
    renderTab(tab);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
  });
});

describe("TeachChatTabBody exam lockdown", () => {
  // Regression: the composer-queue feature must not bypass examLockdown.
  // When examLockdown is true the Composer renders a disabled textarea, and
  // handleSubmit short-circuits before calling onSend — so pressing Enter
  // never reaches client.session.send and no queue entry is created.
  it("composer textarea IS disabled when examLockdown is true (regression — queue must not bypass exam lock)", async () => {
    const sendMock = vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"];

    // Fake assignment without submittedAt — keeps lockdown active.
    const fakeAssignment: Assignment = {
      id: brandId<"AssignmentId">("asgn-1"),
      courseId: brandId<"CourseId">("course-1"),
      kind: "exam",
      title: "Midterm",
      items: [],
      conceptIds: [],
      assignedAt: Date.now() as Timestamp,
      // No submittedAt — exam is still in progress → lockdown = true
    };

    const client = makeFakeClient({
      session: {
        active: vi.fn().mockResolvedValue(null),
        send: sendMock,
        list: vi.fn().mockResolvedValue([]),
      } as unknown as PraxisClient["session"],
      memory: {
        episodic: vi.fn(async function* () {}),
      } as unknown as PraxisClient["memory"],
      assignments: {
        get: vi.fn().mockResolvedValue(fakeAssignment),
        getResponses: vi.fn().mockResolvedValue([]),
      } as unknown as PraxisClient["assignments"],
      quickCheck: {
        events: vi.fn(async function* () {}),
      } as unknown as PraxisClient["quickCheck"],
    });

    // A session tab with modeId "exam" and an assignmentId set.
    // TeachChatTabBody is rendered directly (bypassing ChatTabBody's dispatcher
    // that would route modeId "exam" to ExamTabBody) so we can test the
    // examLockdown path inside TeachChatTabBody itself.
    const examTab: SessionTabSummary = {
      kind: "session",
      id: brandId<"TabId">("tab-exam"),
      sessionId: brandId<"SessionId">("session-exam"),
      modeId: "exam",
      title: "exam · midterm",
      sortOrder: 0,
      openedAt: (Date.now() - 10_000) as Timestamp,
      lastSeenAt: (Date.now() - 5_000) as Timestamp,
      closedAt: null,
      assignmentId: "asgn-1",
    };

    render(
      <PraxisClientProvider client={client}>
        <AuthProvider>
          <TeachChatTabBody tab={examTab} />
        </AuthProvider>
      </PraxisClientProvider>,
    );

    // Wait for ExamLockdownGate to resolve: useAssignment fetches the
    // assignment, finds no submittedAt, and sets examLockdown=true.
    await waitFor(() => {
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(textarea.disabled).toBe(true);
    });

    // Verify the no-op: pressing Enter while disabled must NOT call session.send.
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
