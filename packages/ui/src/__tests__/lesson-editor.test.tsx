import type { Lesson, LessonId, PraxisClient, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonEditor } from "../components/lesson-editor.js";
import { PraxisClientProvider } from "../context/client-context.js";

afterEach(() => cleanup());

function makeLesson(overrides?: Partial<Lesson>): Lesson {
  return {
    id: brandId<"LessonId">("lesson-1"),
    courseId: brandId<"CourseId">("course-1"),
    title: "Test Lesson",
    conceptIds: [brandId<"ConceptId">("concept-1")],
    references: [],
    suggestedStrategy: brandId<"StrategyId">("teach"),
    estimatedMinutes: 30,
    ...overrides,
  };
}

function makeClient(authorOverrides?: Partial<PraxisClient["author"]>): PraxisClient {
  return {
    session: {} as PraxisClient["session"],
    artifacts: {} as PraxisClient["artifacts"],
    author: {
      updateLesson: vi.fn().mockResolvedValue(makeLesson({ title: "Updated" })),
      deleteLesson: vi.fn().mockResolvedValue(undefined),
      createCourse: vi.fn(),
      editGate: vi.fn(),
      bootstrap: vi.fn(),
      customizePrompt: vi.fn(),
      updateCourse: vi.fn(),
      createLesson: vi.fn(),
      createGate: vi.fn(),
      updateGate: vi.fn(),
      deleteGate: vi.fn(),
      overrideGate: vi.fn(),
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
  };
}

function renderEditor(
  client: PraxisClient,
  lesson: Lesson,
  onSaved = vi.fn(),
  onDeleted = vi.fn(),
) {
  return render(
    <PraxisClientProvider client={client}>
      <LessonEditor
        lesson={lesson}
        availableConcepts={[]}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </PraxisClientProvider>,
  );
}

describe("LessonEditor", () => {
  it("renders the lesson title", () => {
    const client = makeClient();
    renderEditor(client, makeLesson());
    expect(screen.getByDisplayValue("Test Lesson")).toBeDefined();
  });

  it("calls updateLesson on save", async () => {
    const onSaved = vi.fn();
    const client = makeClient();
    renderEditor(client, makeLesson(), onSaved);

    // Modify title
    const titleInput = screen.getByDisplayValue("Test Lesson");
    fireEvent.change(titleInput, { target: { value: "Changed Title" } });

    // Click save
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(client.author.updateLesson).toHaveBeenCalledWith(
        expect.objectContaining({
          lessonId: "lesson-1",
          patch: expect.objectContaining({ title: "Changed Title" }),
        }),
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("shows ConfirmReasonModal when Delete lesson is clicked", async () => {
    const client = makeClient();
    renderEditor(client, makeLesson());

    fireEvent.click(screen.getByRole("button", { name: /delete lesson/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
      // Modal heading (h2) reads "Delete lesson"
      const headings = screen.getAllByText(/Delete lesson/);
      expect(headings.length).toBeGreaterThan(0);
    });
  });

  it("calls deleteLesson after confirming deletion", async () => {
    const onDeleted = vi.fn();
    const client = makeClient();
    renderEditor(client, makeLesson(), vi.fn(), onDeleted);

    fireEvent.click(screen.getByRole("button", { name: /delete lesson/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    // Click Confirm in the modal — the last "delete"-matching button is the confirm button
    const deleteBtns = screen.getAllByRole("button", { name: /delete/i });
    const confirmBtn = deleteBtns[deleteBtns.length - 1];
    if (confirmBtn) fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(client.author.deleteLesson).toHaveBeenCalledWith(
        expect.objectContaining({ lessonId: "lesson-1" }),
      );
      expect(onDeleted).toHaveBeenCalledWith("lesson-1");
    });
  });
});
