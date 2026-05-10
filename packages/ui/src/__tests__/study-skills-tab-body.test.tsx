/**
 * StudySkillsTabBody — Phase 18 render tests.
 *
 * Asserts that the chip renders with the right text, the embedded
 * chat composer is present (TeachChatTabBody is embedded), and that
 * the ChatTabBody dispatcher routes modeId 'study-skills' to this
 * component.
 */
import type { PraxisClient, TabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatTabBody } from "../components/chat-tab-body.js";
import { StudySkillsTabBody } from "../components/study-skills-tab-body.js";
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
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "study-skills",
    title: "study skills · coaching",
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
        modeId: "study-skills",
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
        modeId: "study-skills",
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

function renderWithProviders(ui: React.ReactElement, client: PraxisClient = makeClient()) {
  return render(
    <PraxisClientProvider client={client}>
      <AuthProvider>{ui}</AuthProvider>
    </PraxisClientProvider>,
  );
}

describe("StudySkillsTabBody", () => {
  it("renders the 'study skills' chip", () => {
    const tab = makeTab();
    renderWithProviders(<StudySkillsTabBody tab={tab} />);
    expect(screen.getByText("study skills")).toBeDefined();
  });

  it("renders the chat composer (TeachChatTabBody is embedded)", () => {
    const tab = makeTab();
    renderWithProviders(<StudySkillsTabBody tab={tab} />);
    expect(screen.getByRole("textbox")).toBeDefined();
  });
});

describe("ChatTabBody dispatcher routes study-skills", () => {
  it("renders 'study skills' chip for modeId 'study-skills'", () => {
    const tab = makeTab({ modeId: "study-skills" });
    renderWithProviders(<ChatTabBody tab={tab} />);
    expect(screen.getByText("study skills")).toBeDefined();
  });

  it("renders the chat composer when modeId is 'study-skills'", () => {
    const tab = makeTab({ modeId: "study-skills" });
    renderWithProviders(<ChatTabBody tab={tab} />);
    expect(screen.getByRole("textbox")).toBeDefined();
  });
});
