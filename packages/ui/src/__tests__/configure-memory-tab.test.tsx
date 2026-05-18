/**
 * Tests for <MemoryTab> — projection tabs + per-projection canvas views.
 *
 * Verifies:
 * - Five projection tabs render in the strip.
 * - Semantic tab: concept mastery table with recompute action.
 * - Misconceptions tab: cards with clear action + ConfirmReasonModal.
 * - Procedural tab: strategy preferences list.
 * - Affective tab: baseline stats + empty state.
 * - Episodic tab: empty state when no events.
 * - Projection tab switching works.
 */
import type {
  AffectiveModel,
  AffectSample,
  ConceptId,
  ConceptMastery,
  Misconception,
  ProceduralModel,
  StudentModel,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { DirtyStateProvider } from "../contexts/dirty-state-provider.js";
import { MemoryTab } from "../routes/configure/memory-tab.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// ── Factories ─────────────────────────────────────────────────────────────────

function makeStudentModel(entries: Array<[string, Partial<ConceptMastery>]> = []): StudentModel {
  const mastery = new Map<ConceptId, ConceptMastery>();
  for (const [id, partial] of entries) {
    mastery.set(brandId<"ConceptId">(id), {
      conceptId: brandId<"ConceptId">(id),
      pKnown: 0.75,
      uncertainty: 0.2,
      effectivePKnown: 0.75,
      evidence: [],
      ...partial,
    });
  }
  return {
    studentId: brandId<"StudentId">("s1"),
    conceptMastery: mastery,
    lastUpdated: Date.now() as Timestamp,
  };
}

function makeMisconception(id: string, status: Misconception["status"] = "active"): Misconception {
  return {
    id: brandId<"MisconceptionId">(id),
    studentId: brandId<"StudentId">("s1"),
    conceptId: brandId<"ConceptId">("chain-rule"),
    description: "Student confuses derivative with slope",
    errorForm: "the squiggly thing is just measuring how steep",
    remediation: {
      strategyId: brandId<"StrategyId">("teach"),
      rationale: "Clarify geometric vs. dynamic interpretation",
    },
    evidence: [],
    status,
    firstObservedAt: (Date.now() - 1000 * 60 * 60 * 24) as Timestamp,
    lastObservedAt: Date.now() as Timestamp,
  };
}

function makeProceduralModel(): ProceduralModel {
  const strategies = new Map();
  strategies.set(brandId<"StrategyId">("worked-examples"), {
    strategyId: brandId<"StrategyId">("worked-examples"),
    preference: 0.6,
    evidenceCount: 12,
  });
  strategies.set(brandId<"StrategyId">("socratic"), {
    strategyId: brandId<"StrategyId">("socratic"),
    preference: -0.2,
    evidenceCount: 5,
  });
  return {
    studentId: brandId<"StudentId">("s1"),
    strategies,
  };
}

function makeAffectiveModel(): AffectiveModel {
  const sample: AffectSample = {
    ts: Date.now() as Timestamp,
    source: "model-inferred",
    engagement: 0.72,
    frustration: 0.15,
    confidence: 0.61,
  };
  return {
    studentId: brandId<"StudentId">("s1"),
    recent: [sample],
    baseline: { engagement: 0.68, frustration: 0.18, confidence: 0.58 },
  };
}

async function* emptyEpisodicStream(): AsyncGenerator<never, void, unknown> {
  // yields nothing — empty episodic log
}

function makeClient(opts?: {
  studentModel?: StudentModel;
  misconceptions?: Misconception[];
  procedural?: ProceduralModel;
  affective?: AffectiveModel;
  resetConceptSpy?: ReturnType<typeof vi.fn>;
  clearMisconceptionSpy?: ReturnType<typeof vi.fn>;
}) {
  return makeFakeClient({
    memory: {
      studentModel: vi.fn().mockResolvedValue(opts?.studentModel ?? makeStudentModel()),
      misconceptions: vi.fn().mockResolvedValue(opts?.misconceptions ?? []),
      procedural: vi.fn().mockResolvedValue(opts?.procedural ?? makeProceduralModel()),
      affective: vi.fn().mockResolvedValue(opts?.affective ?? makeAffectiveModel()),
      episodic: vi.fn().mockReturnValue(emptyEpisodicStream()),
      export: vi.fn(),
      delete: vi.fn(),
    },
    author: {
      resetConcept: opts?.resetConceptSpy ?? vi.fn().mockResolvedValue(undefined),
      clearMisconception: opts?.clearMisconceptionSpy ?? vi.fn().mockResolvedValue(undefined),
      listConfiguratorActions: vi.fn().mockResolvedValue([]),
      createCourse: vi.fn(),
      editGate: vi.fn(),
      bootstrap: vi.fn(),
      customizePrompt: vi.fn(),
      updateCourse: vi.fn(),
      createLesson: vi.fn(),
      updateLesson: vi.fn(),
      deleteLesson: vi.fn(),
      createGate: vi.fn(),
      updateGate: vi.fn(),
      deleteGate: vi.fn(),
      overrideGate: vi.fn(),
      getCourseSummary: vi.fn(),
      clearFragmentOverride: vi.fn(),
      setStyleSliders: vi.fn(),
      exportMemory: vi.fn(),
      deleteAllMemory: vi.fn(),
    },
  });
}

function renderTab(client = makeClient()) {
  return render(
    <PraxisClientProvider client={client}>
      <DirtyStateProvider>
        <MemoryTab />
      </DirtyStateProvider>
    </PraxisClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MemoryTab — projection tab strip", () => {
  it("renders all five projection tabs", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /semantic/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /misconceptions/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /procedural/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /affective/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /episodic/i })).toBeDefined();
    });
  });

  it("defaults to Semantic projection", async () => {
    const client = makeClient({
      studentModel: makeStudentModel([["chain-rule", { pKnown: 0.31 }]]),
    });
    renderTab(client);
    await waitFor(() => {
      expect(screen.getByText("chain-rule")).toBeDefined();
    });
  });

  it("switches to Misconceptions projection", async () => {
    const client = makeClient({
      misconceptions: [makeMisconception("misc-1")],
    });
    renderTab(client);

    fireEvent.click(screen.getByRole("button", { name: /misconceptions/i }));

    await waitFor(() => {
      // Text appears in both the card head span and the description paragraph
      const matches = screen.getAllByText(/Student confuses derivative with slope/);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it("switches to Procedural projection", async () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: /procedural/i }));

    await waitFor(() => {
      expect(screen.getByText(/worked-examples/)).toBeDefined();
    });
  });

  it("switches to Affective projection", async () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: /affective/i }));

    await waitFor(() => {
      expect(screen.getByText(/Baseline/)).toBeDefined();
    });
  });

  it("switches to Episodic projection and shows empty state", async () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: /episodic/i }));

    await waitFor(() => {
      expect(screen.getByText(/No episodic events recorded yet/)).toBeDefined();
    });
  });
});

describe("MemoryTab — Semantic (concept mastery) pane", () => {
  it("shows empty state when no mastery data", async () => {
    const client = makeClient({ studentModel: makeStudentModel([]) });
    renderTab(client);

    await waitFor(() => {
      expect(screen.getByText(/No mastery data yet/)).toBeDefined();
    });
  });

  it("renders mastery table with concept rows", async () => {
    const client = makeClient({
      studentModel: makeStudentModel([
        ["chain-rule", { pKnown: 0.31 }],
        ["limits", { pKnown: 0.78 }],
      ]),
    });
    renderTab(client);

    await waitFor(() => {
      expect(screen.getByText("chain-rule")).toBeDefined();
      expect(screen.getByText("limits")).toBeDefined();
    });
  });

  it("shows recompute button per concept row", async () => {
    const client = makeClient({
      studentModel: makeStudentModel([["chain-rule", {}]]),
    });
    renderTab(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /recompute/i })).toBeDefined();
    });
  });

  it("opens ConfirmReasonModal when recompute is clicked", async () => {
    const client = makeClient({
      studentModel: makeStudentModel([["chain-rule", {}]]),
    });
    renderTab(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /recompute/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /recompute/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
  });

  it("calls client.author.resetConcept with reason after confirm", async () => {
    const resetConceptSpy = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({
      studentModel: makeStudentModel([["chain-rule", {}]]),
      resetConceptSpy,
    });
    renderTab(client);

    // Wait for the inline recompute link to appear (uses title attr)
    await waitFor(() => {
      expect(screen.getByTitle(/Re-run BKT update/i)).toBeDefined();
    });

    fireEvent.click(screen.getByTitle(/Re-run BKT update/i));

    // Wait for modal dialog to appear
    const dialog = await screen.findByRole("dialog");

    const reasonInput = screen.getByRole("textbox");
    fireEvent.change(reasonInput, { target: { value: "BKT session just completed" } });

    // Find the submit button inside the dialog specifically
    const submitBtns = Array.from(dialog.querySelectorAll('button[type="submit"]'));
    expect(submitBtns.length).toBe(1);
    fireEvent.click(submitBtns[0]);

    await waitFor(() => {
      expect(resetConceptSpy).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "BKT session just completed" }),
      );
    });
  });
});

describe("MemoryTab — Misconceptions pane", () => {
  it("shows empty state when no misconceptions", async () => {
    const client = makeClient({ misconceptions: [] });
    renderTab(client);

    fireEvent.click(screen.getByRole("button", { name: /misconceptions/i }));

    await waitFor(() => {
      expect(screen.getByText(/No misconceptions recorded/)).toBeDefined();
    });
  });

  it("renders misconception cards for active items", async () => {
    const client = makeClient({
      misconceptions: [makeMisconception("misc-1")],
    });
    renderTab(client);

    fireEvent.click(screen.getByRole("button", { name: /misconceptions/i }));

    await waitFor(() => {
      // Description appears in both card head and the body paragraph
      const matches = screen.getAllByText(/Student confuses derivative with slope/);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it("shows clear button for active misconceptions", async () => {
    const client = makeClient({
      misconceptions: [makeMisconception("misc-1", "active")],
    });
    renderTab(client);

    fireEvent.click(screen.getByRole("button", { name: /misconceptions/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear/i })).toBeDefined();
    });
  });

  it("opens ConfirmReasonModal when clear is clicked", async () => {
    const client = makeClient({
      misconceptions: [makeMisconception("misc-1", "active")],
    });
    renderTab(client);

    fireEvent.click(screen.getByRole("button", { name: /misconceptions/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
  });

  it("calls client.author.clearMisconception with reason after confirm", async () => {
    const clearMisconceptionSpy = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({
      misconceptions: [makeMisconception("misc-1", "active")],
      clearMisconceptionSpy,
    });
    renderTab(client);

    fireEvent.click(screen.getByRole("button", { name: /misconceptions/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    const reasonInput = screen.getByRole("textbox");
    fireEvent.change(reasonInput, { target: { value: "Stale — covered in session 18" } });

    // Find the confirm button in the modal (the dialog's confirm button)
    const buttons = screen.getAllByRole("button", { name: /clear/i });
    // The last one is the confirm button inside the modal
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(clearMisconceptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "Stale — covered in session 18" }),
      );
    });
  });

  it("does not show clear button for already-cleared misconceptions", async () => {
    const client = makeClient({
      misconceptions: [makeMisconception("misc-cleared", "manually-cleared")],
    });
    renderTab(client);

    fireEvent.click(screen.getByRole("button", { name: /misconceptions/i }));

    await waitFor(() => {
      // Confirm card rendered (description appears in both head span + body)
      const matches = screen.getAllByText(/Student confuses derivative/);
      expect(matches.length).toBeGreaterThan(0);
    });

    // No "clear" action buttons for cleared misconceptions
    const clearBtns = screen.queryAllByRole("button", { name: /^clear/i });
    expect(clearBtns.length).toBe(0);
  });
});

describe("MemoryTab — canvas head", () => {
  it("renders the kicker and canvas title", async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/memory inspector/)).toBeDefined();
      expect(screen.getByText(/knows about the student/)).toBeDefined();
    });
  });
});
