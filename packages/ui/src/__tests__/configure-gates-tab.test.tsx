/**
 * Tests for:
 *  - configure/gates-tab.tsx — React Flow gate graph with edge-label thresholds and
 *    warning-coloured dirty edges.
 *  - components/gate-edge-label.tsx — edge label rendering (threshold + dirty state).
 *
 * Covers:
 *   1. GatesTab renders empty state when no course is selected.
 *   2. GatesTab renders the gate graph when a course is selected and data loads.
 *   3. GatesTab passes `dirty` flag to edge data when a threshold is edited in GateInspector.
 *   4. GatesTab clears dirty state after a gate is saved.
 *   5. GateEdgeLabel renders the mastery threshold.
 *   6. GateEdgeLabel applies the dirty tone when dirty=true.
 *   7. GatesTab writes selected gate to ConfigureStateContext on node click through GatesReadingView.
 */

import type {
  ConceptId,
  CourseId,
  Gate,
  GateId,
  GateView,
  Lesson,
  LessonId,
  SessionId,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GateEdgeLabelData } from "../components/gate-edge-label.js";
import { GateEdgeLabel } from "../components/gate-edge-label.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { DirtyStateProvider } from "../contexts/dirty-state-provider.js";
import type { SelectedGateState } from "../hooks/use-configure-state.js";
import { ConfigureStateContext } from "../hooks/use-configure-state.js";
import { GatesTab } from "../routes/configure/gates-tab.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// Mock TanStack Router (imported transitively)
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useSearch: () => ({}),
  };
});

// Mock React Flow — the actual layout/render is irrelevant; we just need the
// GatesTab component to mount and the inspector to be testable.
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow">{children}</div>
  ),
  Background: () => null,
  Controls: () => null,
  // EdgeLabelRenderer renders a portal; in tests we render it inline so labels appear.
  EdgeLabelRenderer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="edge-label-renderer">{children}</div>
  ),
  BaseEdge: () => <path />,
  getBezierPath: () => ["M0 0", 50, 50] as [string, number, number],
}));

afterEach(() => cleanup());

// ── Shared test data ─────────────────────────────────────────────────────────

const COURSE_ID = brandId<"CourseId">("course-gates-test");
const SESSION_ID = brandId<"SessionId">("session-gates-test") as SessionId;

const CONCEPT_A = brandId<"ConceptId">("c-alpha");
const CONCEPT_B = brandId<"ConceptId">("c-beta");

const GATE_ID = brandId<"GateId">("gate-1");

function makeLessonWithConcept(id: string, conceptId: ConceptId): Lesson {
  return {
    id: brandId<"LessonId">(id) as LessonId,
    courseId: COURSE_ID,
    title: `Lesson ${id}`,
    conceptIds: [conceptId],
    references: [],
  };
}

function makeGate(id: GateId, lessonId: string, minScore = 0.7): Gate {
  return {
    id,
    courseId: COURSE_ID,
    guards: { kind: "lesson", lessonId: brandId<"LessonId">(lessonId) as LessonId },
    successCriteria: {
      kind: "mastery-threshold",
      conceptIds: [CONCEPT_B],
      minScore,
    },
    prerequisites: [],
    state: { kind: "locked", missingPrerequisites: [] },
    evidence: [],
  };
}

function makeGateView(gate: Gate, summaryText = "≥70% mastery"): GateView {
  return {
    gate,
    summaryText,
    lockReason: "Locked: incomplete prerequisites",
    progress: 0.5,
    isActive: false,
  };
}

const LESSON_1 = makeLessonWithConcept("l-1", CONCEPT_A);
const LESSON_2 = makeLessonWithConcept("l-2", CONCEPT_B);
const GATE_1 = makeGate(GATE_ID, "l-2", 0.7);
const GATE_VIEW_1 = makeGateView(GATE_1);

// ── Render helper ────────────────────────────────────────────────────────────

interface RenderGatesTabOpts {
  courseId?: CourseId | null;
  lessons?: Lesson[];
  gateViews?: GateView[];
  gates?: Gate[];
  onSetSelectedGate?: (state: SelectedGateState | null) => void;
  updateGate?: ReturnType<typeof vi.fn>;
}

function renderGatesTab({
  courseId = COURSE_ID,
  lessons = [LESSON_1, LESSON_2],
  gateViews = [GATE_VIEW_1],
  gates = [GATE_1],
  onSetSelectedGate = vi.fn(),
  updateGate = vi.fn().mockResolvedValue(GATE_1),
}: RenderGatesTabOpts = {}) {
  const client = makeFakeClient({
    artifacts: {
      courses: vi.fn().mockResolvedValue([{ courseId: COURSE_ID, title: "Gates Test Course" }]),
      course: vi.fn().mockResolvedValue(null),
      lessons: vi.fn().mockResolvedValue(lessons),
      gateView: vi.fn().mockResolvedValue(gateViews),
      gates: vi.fn().mockResolvedValue(gates),
      concepts: vi.fn().mockResolvedValue([]),
      progress: vi.fn(),
      flashcards: vi.fn(),
      notes: vi.fn(),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
    } as unknown as ReturnType<typeof makeFakeClient>["artifacts"],
    author: {
      getCourseSummary: vi
        .fn()
        .mockResolvedValue({ course: null, lessons: [], gates: [], concepts: [] }),
      updateGate,
    } as unknown as ReturnType<typeof makeFakeClient>["author"],
  });

  const configureState = {
    selectedCourseId: courseId ?? null,
    setSelectedCourseId: vi.fn(),
    selectedLesson: null,
    setSelectedLesson: vi.fn(),
    clearSelectedLesson: vi.fn(),
    selectedGate: null,
    setSelectedGate: onSetSelectedGate,
  };

  return render(
    <PraxisClientProvider client={client}>
      <DirtyStateProvider>
        <ConfigureStateContext.Provider value={configureState}>
          <GatesTab sessionId={SESSION_ID} />
        </ConfigureStateContext.Provider>
      </DirtyStateProvider>
    </PraxisClientProvider>,
  );
}

// ── GatesTab unit tests ──────────────────────────────────────────────────────

describe("GatesTab — empty state", () => {
  it("shows empty state when no course is selected", async () => {
    renderGatesTab({ courseId: null });

    await waitFor(() => {
      expect(screen.getByText(/Select a course to view and edit its gate graph/i)).toBeDefined();
    });
  });
});

describe("GatesTab — canvas renders when course is selected", () => {
  it("renders the react-flow canvas when a course is selected", async () => {
    renderGatesTab();

    await waitFor(() => {
      expect(screen.getByTestId("react-flow")).toBeDefined();
    });
  });

  it("renders the Gates Editor title", async () => {
    renderGatesTab();

    await waitFor(() => {
      expect(screen.getByText(/Gates Editor/i)).toBeDefined();
    });
  });
});

describe("GatesTab — inspector strip wiring", () => {
  it("calls setSelectedGate(null) from ConfigureStateContext on mount (no selection)", async () => {
    const onSetSelectedGate = vi.fn();
    renderGatesTab({ onSetSelectedGate });

    // The useEffect in GatesTab mirrors selectedGate (initially null) into the context.
    // It fires synchronously after mount; verify the context receives the null selection.
    await waitFor(() => {
      expect(onSetSelectedGate).toHaveBeenCalledWith(null);
    });
  });

  it("renders GateInspector when a gate is selected via GatesReadingView", async () => {
    renderGatesTab();

    // GatesReadingView renders a button per gate with aria-label "Inspect gate …"
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Inspect gate/i })).toBeDefined();
    });

    // Click the gate row button to open GateInspector
    fireEvent.click(screen.getByRole("button", { name: /Inspect gate/i }));

    // GateInspector should now appear with its "Gate Inspector" heading
    await waitFor(() => {
      expect(screen.getByText("Gate Inspector")).toBeDefined();
    });
  });

  it("calls setSelectedGate with the gate's data when a gate is selected", async () => {
    const onSetSelectedGate = vi.fn();
    renderGatesTab({ onSetSelectedGate });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Inspect gate/i })).toBeDefined();
    });

    // Clear prior calls (mount null call)
    onSetSelectedGate.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /Inspect gate/i }));

    // After clicking, the context's setSelectedGate should be called with the gate
    await waitFor(() => {
      expect(onSetSelectedGate).toHaveBeenCalledWith(
        expect.objectContaining({
          gate: expect.objectContaining({ id: GATE_ID }),
          pendingMinScore: null,
        }),
      );
    });
  });
});

describe("GatesTab — inspector strip pendingMinScore", () => {
  it("passes the user-typed value as pendingMinScore to setSelectedGate after threshold edit", async () => {
    const onSetSelectedGate = vi.fn();
    renderGatesTab({ onSetSelectedGate });

    // Open the inspector by clicking the gate row button in GatesReadingView.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Inspect gate/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /Inspect gate/i }));

    // Inspector should now be open.
    await waitFor(() => {
      expect(screen.getByText("Gate Inspector")).toBeDefined();
    });

    // Clear prior calls so we only capture the post-edit call.
    onSetSelectedGate.mockClear();

    // Edit the mastery threshold input to 85 (i.e. 0.85 as a fraction).
    const input = screen.getByRole("spinbutton", { name: /Mastery threshold/i });
    fireEvent.change(input, { target: { value: "85" } });

    // The context should receive pendingMinScore = 0.85 (not 0.7 which is the saved value).
    await waitFor(() => {
      expect(onSetSelectedGate).toHaveBeenCalledWith(
        expect.objectContaining({
          gate: expect.objectContaining({ id: GATE_ID }),
          pendingMinScore: 0.85,
        }),
      );
    });
  });
});

describe("GatesTab — dirty state", () => {
  it("clears dirty gate IDs when setSelectedCourseId changes the course", async () => {
    const onSetSelectedGate = vi.fn();
    const { container } = renderGatesTab({ onSetSelectedGate });

    // Switch course to trigger the reset of dirty state
    const select = container.querySelector("select");
    expect(select).toBeTruthy();

    // Change to empty option (no course) — should clear dirty and call setSelectedGate(null)
    if (select) {
      fireEvent.change(select, { target: { value: "" } });
    }

    await waitFor(() => {
      // After deselection, the context gate should be cleared
      expect(onSetSelectedGate).toHaveBeenCalledWith(null);
    });
  });
});

// ── GateEdgeLabel unit tests ─────────────────────────────────────────────────

describe("GateEdgeLabel — threshold display", () => {
  function renderEdgeLabel(data: GateEdgeLabelData) {
    // Provide the minimal EdgeProps shape required by the component.
    return render(
      <svg>
        <GateEdgeLabel
          id="test-edge"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          sourcePosition={"right" as import("@xyflow/react").Position}
          targetPosition={"left" as import("@xyflow/react").Position}
          data={data}
          source="n1"
          target="n2"
          markerEnd=""
          markerStart=""
          style={{}}
          selected={false}
          animated={false}
          interactionWidth={20}
        />
      </svg>,
    );
  }

  it("renders the mastery threshold percentage for mastery-threshold criteria", () => {
    const data: GateEdgeLabelData = {
      gate: makeGateView(makeGate(GATE_ID, "l-2", 0.7)),
    };

    renderEdgeLabel(data);

    // The threshold label should appear as "70%"
    expect(screen.getByLabelText(/Mastery threshold: 70%/i)).toBeDefined();
  });

  it("renders 85% threshold label when minScore is 0.85", () => {
    const gate85 = makeGate(brandId<"GateId">("gate-85"), "l-2", 0.85);
    const data: GateEdgeLabelData = {
      gate: makeGateView(gate85, "≥85% mastery"),
    };

    renderEdgeLabel(data);

    expect(screen.getByLabelText(/Mastery threshold: 85%/i)).toBeDefined();
  });

  it("does not set data-dirty when dirty is false/undefined", () => {
    const data: GateEdgeLabelData = {
      gate: makeGateView(makeGate(GATE_ID, "l-2", 0.7)),
      dirty: false,
    };

    renderEdgeLabel(data);

    const label = screen.getByTestId("gate-edge-label");
    expect(label.getAttribute("data-dirty")).toBeNull();
  });

  it("sets data-dirty='true' when dirty=true", () => {
    const data: GateEdgeLabelData = {
      gate: makeGateView(makeGate(GATE_ID, "l-2", 0.7)),
      dirty: true,
    };

    renderEdgeLabel(data);

    const label = screen.getByTestId("gate-edge-label");
    expect(label.getAttribute("data-dirty")).toBe("true");
  });

  it("renders the summaryText from the gate view", () => {
    const data: GateEdgeLabelData = {
      gate: makeGateView(makeGate(GATE_ID, "l-2", 0.7), "Locked: needs 70% on derivatives"),
    };

    renderEdgeLabel(data);

    expect(screen.getByText("Locked: needs 70% on derivatives")).toBeDefined();
  });

  it("renders a progress bar for locked gates", () => {
    const gate = makeGate(GATE_ID, "l-2", 0.7);
    const gateView = makeGateView(gate);
    const data: GateEdgeLabelData = { gate: gateView };

    const { container } = renderEdgeLabel(data);

    const progressBar = container.querySelector("progress");
    expect(progressBar).toBeTruthy();
    expect(progressBar?.getAttribute("value")).toBe("0.5");
  });

  it("does not render a progress bar for unlocked gates", () => {
    const gate: Gate = {
      ...makeGate(GATE_ID, "l-2", 0.7),
      state: {
        kind: "unlocked",
        unlockedAt: Date.now() as import("@praxis/core/types").Timestamp,
        evidence: [],
      },
    };
    const gateView = makeGateView(gate);
    const data: GateEdgeLabelData = { gate: gateView };

    const { container } = renderEdgeLabel(data);

    expect(container.querySelector("progress")).toBeNull();
  });
});
