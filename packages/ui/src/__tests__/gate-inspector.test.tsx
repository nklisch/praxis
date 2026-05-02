import type { Gate, GateId, PraxisClient, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GateInspector } from "../components/gate-inspector.js";
import { PraxisClientProvider } from "../context/client-context.js";

afterEach(() => cleanup());

function makeGate(overrides?: Partial<Gate>): Gate {
  return {
    id: brandId<"GateId">("gate-1"),
    courseId: brandId<"CourseId">("course-1"),
    guards: { kind: "lesson", lessonId: brandId<"LessonId">("lesson-1") },
    prerequisites: [],
    successCriteria: {
      kind: "mastery-threshold",
      conceptIds: [brandId<"ConceptId">("concept-1")],
      minScore: 0.8,
    },
    state: { kind: "locked", missingPrerequisites: [] },
    evidence: [],
    ...overrides,
  };
}

function makeClient(authorOverrides?: Partial<PraxisClient["author"]>): PraxisClient {
  return {
    session: {} as PraxisClient["session"],
    artifacts: {} as PraxisClient["artifacts"],
    author: {
      updateGate: vi.fn().mockResolvedValue(makeGate()),
      deleteGate: vi.fn().mockResolvedValue(undefined),
      overrideGate: vi.fn().mockResolvedValue(
        makeGate({
          state: {
            kind: "overridden",
            by: "default" as import("@praxis/core/types").ConfiguratorId,
            reason: "test",
            at: Date.now() as Timestamp,
          },
        }),
      ),
      createCourse: vi.fn(),
      editGate: vi.fn(),
      bootstrap: vi.fn(),
      customizePrompt: vi.fn(),
      updateCourse: vi.fn(),
      createLesson: vi.fn(),
      updateLesson: vi.fn(),
      deleteLesson: vi.fn(),
      createGate: vi.fn(),
      getCourseSummary: vi.fn(),
      clearFragmentOverride: vi.fn(),
      setStyleSliders: vi.fn(),
      resetConcept: vi.fn(),
      clearMisconception: vi.fn(),
      exportMemory: vi.fn(),
      deleteAllMemory: vi.fn(),
      listConfiguratorActions: vi.fn(),
      ...authorOverrides,
    } as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {} as PraxisClient["packs"],
    notes: {} as PraxisClient["notes"],
    flashcards: {} as PraxisClient["flashcards"],
    claudeAuth: {} as PraxisClient["claudeAuth"],
    shell: {} as PraxisClient["shell"],
  };
}

function renderInspector(
  client: PraxisClient,
  gate: Gate,
  onSaved = vi.fn(),
  onDeleted = vi.fn(),
  onClose = vi.fn(),
) {
  return render(
    <PraxisClientProvider client={client}>
      <GateInspector gate={gate} onSaved={onSaved} onDeleted={onDeleted} onClose={onClose} />
    </PraxisClientProvider>,
  );
}

describe("GateInspector", () => {
  it("renders gate state and criteria", () => {
    const client = makeClient();
    renderInspector(client, makeGate());

    expect(screen.getByText(/Locked/)).toBeDefined();
    expect(screen.getAllByText(/Mastery/).length).toBeGreaterThan(0);
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    const client = makeClient();
    renderInspector(client, makeGate(), vi.fn(), vi.fn(), onClose);

    fireEvent.click(screen.getByRole("button", { name: /close inspector/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows ConfirmReasonModal when Override button is clicked", async () => {
    const client = makeClient();
    renderInspector(client, makeGate());

    fireEvent.click(screen.getByRole("button", { name: /override gate/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
      // Both the button and modal heading contain "Override gate"
      expect(screen.getAllByText(/Override gate/).length).toBeGreaterThan(0);
    });
  });

  it("calls overrideGate with reason after confirming override", async () => {
    const onSaved = vi.fn();
    const client = makeClient();
    renderInspector(client, makeGate(), onSaved);

    fireEvent.click(screen.getByRole("button", { name: /override gate/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    const textarea = screen.getByPlaceholderText(/Enter a reason/i);
    fireEvent.change(textarea, { target: { value: "Student completed offline" } });

    fireEvent.click(screen.getByRole("button", { name: /^override$/i }));

    await waitFor(() => {
      expect(client.author.overrideGate).toHaveBeenCalledWith({
        gateId: "gate-1",
        reason: "Student completed offline",
      });
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("shows ConfirmReasonModal when Delete button is clicked", async () => {
    const client = makeClient();
    renderInspector(client, makeGate());

    fireEvent.click(screen.getByRole("button", { name: /delete gate/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
  });
});
