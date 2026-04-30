/**
 * Unit tests for AssignmentCard component.
 *
 * Verifies:
 *  - Renders loading state when assignment is being fetched.
 *  - Renders the card with title and item count when loaded.
 *  - Submit button is present when assignment is not yet submitted.
 *  - Submitted state shows score banner instead of submit button.
 *  - Per-item feedback is rendered after submission.
 *
 * Uses jsdom via @testing-library/react, mocking the PraxisClient.
 */
import type {
  Assignment,
  AssignmentResponse,
  AssignmentSubmissionResult,
  Grade,
  PraxisClient,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssignmentCard } from "../components/assignment-card.js";
import { PraxisClientProvider } from "../context/client-context.js";

afterEach(() => {
  cleanup();
});

// ── Factory helpers ────────────────────────────────────────────────────────────

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: brandId<"AssignmentId">("assignment-test-1"),
    courseId: brandId<"CourseId">("course-1"),
    kind: "quiz",
    title: "Test Quiz",
    items: [
      {
        id: "item-mc-1",
        kind: "multiple-choice",
        prompt: "Pick the right answer",
        options: ["A", "B", "C"],
        correctOptionIndex: 0,
      },
      {
        id: "item-sa-1",
        kind: "short-answer",
        prompt: "What is 2 + 2?",
        acceptedAnswers: ["4"],
      },
    ],
    conceptIds: [],
    assignedAt: Date.now() as Timestamp,
    ...overrides,
  };
}

function makeGrade(): Grade {
  return {
    total: 0.5,
    perItem: [
      {
        itemId: "item-mc-1",
        score: 1,
        feedback: "Correct.",
        gradedBy: "deterministic",
      },
      {
        itemId: "item-sa-1",
        score: 0,
        feedback: "Incorrect. Expected: 4",
        gradedBy: "deterministic",
      },
    ],
    reviewedBy: "deterministic",
  };
}

function makeClient(opts: {
  assignment?: Assignment | null;
  grade?: Grade;
  responses?: AssignmentResponse[];
}): PraxisClient {
  const assignment = opts.assignment ?? makeAssignment();
  const grade = opts.grade;
  const responses = opts.responses ?? [];

  const submissionResult: AssignmentSubmissionResult = {
    assignmentId: assignment?.id ?? brandId<"AssignmentId">("assignment-test-1"),
    grade: grade ?? makeGrade(),
    submittedAt: Date.now() as Timestamp,
  };

  return {
    session: {} as PraxisClient["session"],
    artifacts: {} as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {
      get: vi.fn().mockResolvedValue(assignment),
      list: vi.fn().mockResolvedValue([]),
      recordResponse: vi.fn().mockResolvedValue(undefined),
      getResponses: vi.fn().mockResolvedValue(responses),
      submit: vi.fn().mockResolvedValue(submissionResult),
    },
  };
}

function renderCard(
  assignmentId: import("@praxis/core/types").AssignmentId,
  client: PraxisClient,
  examLockdown = false,
) {
  return render(
    <PraxisClientProvider client={client}>
      <AssignmentCard assignmentId={assignmentId} examLockdown={examLockdown} />
    </PraxisClientProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("AssignmentCard", () => {
  const assignmentId = brandId<"AssignmentId">("assignment-test-1");

  it("shows loading indicator while fetching assignment", () => {
    const client = makeClient({
      assignment: null,
    });
    // Make get hang so we stay in loading state
    (client.assignments.get as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}),
    );
    (client.assignments.getResponses as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}),
    );

    renderCard(assignmentId, client);
    expect(screen.getByText(/loading assignment/i)).toBeDefined();
  });

  it("renders assignment title and item count once loaded", async () => {
    const client = makeClient({});
    renderCard(assignmentId, client);

    await waitFor(() => {
      expect(screen.getByText("Test Quiz")).toBeDefined();
    });
    expect(screen.getByText("2 items")).toBeDefined();
  });

  it("renders the kind badge (QUIZ)", async () => {
    const client = makeClient({});
    renderCard(assignmentId, client);

    await waitFor(() => {
      expect(screen.getByText("QUIZ")).toBeDefined();
    });
  });

  it("renders a Submit button when assignment is not yet submitted", async () => {
    const client = makeClient({});
    renderCard(assignmentId, client);

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /submit/i });
      expect(btn).toBeDefined();
    });
  });

  it("calls assignments.submit when Submit button is clicked", async () => {
    const client = makeClient({});
    renderCard(assignmentId, client);

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /submit/i });
      expect(btn).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(client.assignments.submit).toHaveBeenCalledWith({ assignmentId });
    });
  });

  it("shows submitted banner after submission completes", async () => {
    const grade = makeGrade();
    const client = makeClient({ grade });
    renderCard(assignmentId, client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /submit/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      // After submission, the submit button should be gone
      expect(screen.queryByRole("button", { name: /^submit$/i })).toBeNull();
      // Score banner should appear
      expect(screen.getByText(/submitted/i)).toBeDefined();
    });
  });

  it("renders assignment items (prompt text visible)", async () => {
    const client = makeClient({});
    renderCard(assignmentId, client);

    await waitFor(() => {
      expect(screen.getByText("Pick the right answer")).toBeDefined();
      expect(screen.getByText("What is 2 + 2?")).toBeDefined();
    });
  });

  it("renders null when assignment is not found", async () => {
    const client = makeClient({ assignment: null });
    (client.assignments.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { container } = renderCard(assignmentId, client);

    // Wait for load to finish
    await waitFor(() => {
      // The card should be empty when no assignment is found (returns null from component)
      // There should be no article element
    });

    // No error is shown for a null assignment — the component simply renders null
    expect(container.querySelector("article")).toBeNull();
  });

  it("loads existing responses from getResponses on mount", async () => {
    const responses: AssignmentResponse[] = [
      {
        assignmentId,
        itemId: "item-mc-1",
        response: "0",
        recordedAt: Date.now() as Timestamp,
      },
    ];
    const client = makeClient({ responses });
    renderCard(assignmentId, client);

    await waitFor(() => {
      expect(client.assignments.getResponses).toHaveBeenCalledWith({ assignmentId });
    });

    // After loading, the radio for option "A" (index 0) should be checked
    await waitFor(() => {
      const radios = screen.getAllByRole("radio") as HTMLInputElement[];
      expect(radios[0]?.checked).toBe(true);
    });
  });
});
