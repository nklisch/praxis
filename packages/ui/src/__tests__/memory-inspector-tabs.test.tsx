import type {
  ConceptId,
  ConceptMastery,
  ConfiguratorActionRow,
  Misconception,
  MisconceptionId,
  PraxisClient,
  StudentModel,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryInspectorTabs } from "../components/memory-inspector-tabs.js";
import { PraxisClientProvider } from "../context/client-context.js";

afterEach(() => cleanup());

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

function makeMisconception(id: string): Misconception {
  return {
    id: brandId<"MisconceptionId">(id),
    studentId: brandId<"StudentId">("s1"),
    conceptId: brandId<"ConceptId">("concept-1"),
    description: "Student confuses X with Y",
    errorForm: "X = Y",
    remediation: { strategyId: brandId<"StrategyId">("teach"), rationale: "Clarify difference" },
    evidence: [],
    status: "active",
    firstObservedAt: Date.now() as Timestamp,
    lastObservedAt: Date.now() as Timestamp,
  };
}

function makeClient(overrides?: {
  studentModel?: StudentModel;
  misconceptions?: Misconception[];
  auditActions?: ConfiguratorActionRow[];
}): PraxisClient {
  return {
    session: {} as PraxisClient["session"],
    artifacts: {} as PraxisClient["artifacts"],
    author: {
      resetConcept: vi.fn().mockResolvedValue(undefined),
      clearMisconception: vi.fn().mockResolvedValue(undefined),
      listConfiguratorActions: vi.fn().mockResolvedValue(overrides?.auditActions ?? []),
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
    } as PraxisClient["author"],
    memory: {
      studentModel: vi.fn().mockResolvedValue(overrides?.studentModel ?? makeStudentModel()),
      misconceptions: vi.fn().mockResolvedValue(overrides?.misconceptions ?? []),
      procedural: vi.fn(),
      affective: vi.fn(),
      episodic: vi.fn(),
      export: vi.fn(),
      delete: vi.fn(),
    } as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {} as PraxisClient["packs"],
  };
}

function renderTabs(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <MemoryInspectorTabs />
    </PraxisClientProvider>,
  );
}

describe("MemoryInspectorTabs", () => {
  it("shows empty state when no mastery data", async () => {
    const client = makeClient({ studentModel: makeStudentModel([]) });
    renderTabs(client);

    await waitFor(() => {
      expect(screen.getByText(/No mastery data yet/)).toBeDefined();
    });
  });

  it("shows mastery table when data exists", async () => {
    const client = makeClient({
      studentModel: makeStudentModel([["algebra-basics", { pKnown: 0.85 }]]),
    });
    renderTabs(client);

    await waitFor(() => {
      expect(screen.getByText("algebra-basics")).toBeDefined();
      expect(screen.getByText("85%")).toBeDefined();
    });
  });

  it("shows Reset button per concept row", async () => {
    const client = makeClient({
      studentModel: makeStudentModel([["concept-x", {}]]),
    });
    renderTabs(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reset/i })).toBeDefined();
    });
  });

  it("shows ConfirmReasonModal when Reset is clicked", async () => {
    const client = makeClient({
      studentModel: makeStudentModel([["concept-x", {}]]),
    });
    renderTabs(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reset/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
  });

  it("switches to Misconceptions tab and shows list", async () => {
    const client = makeClient({
      misconceptions: [makeMisconception("misc-1")],
    });
    renderTabs(client);

    fireEvent.click(screen.getByRole("button", { name: /misconceptions/i }));

    await waitFor(() => {
      expect(screen.getByText("Student confuses X with Y")).toBeDefined();
    });
  });

  it("switches to Audit tab and shows empty state", async () => {
    const client = makeClient({ auditActions: [] });
    renderTabs(client);

    fireEvent.click(screen.getByRole("button", { name: /audit log/i }));

    await waitFor(() => {
      expect(screen.getByText(/No configurator actions yet/)).toBeDefined();
    });
  });
});
