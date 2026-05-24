/**
 * Tests for ProgressRoute — /progress Course-by-Course Review surface.
 *
 * Covers: loading state, error state, empty state (no courses), multi-course
 * render, sub-component empty/full states, and CoverageBar integration.
 */

import type { CourseProgressRollup } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { ProgressRoute } from "../routes/progress.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// Mock TanStack Router — ProgressRoute calls useNavigate for the empty-state CTA.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRollup(overrides: Partial<CourseProgressRollup> = {}): CourseProgressRollup {
  return {
    courseId: brandId<"CourseId">("course-1"),
    courseTitle: "Algebra I",
    masteryPercent: 0.62,
    currentLesson: {
      id: brandId<"LessonId">("lesson-1"),
      title: "Quadratics — Factoring",
      index: 11,
      total: 18,
    },
    activeGate: {
      id: brandId<"GateId">("gate-1"),
      title: "Linear Factoring",
      lockReason: "needs one more quiz pass",
      progress: 0.8,
    },
    stuckConcepts: [
      { conceptId: brandId<"ConceptId">("c-1"), name: "completing the square", mastery: 0.28 },
      {
        conceptId: brandId<"ConceptId">("c-2"),
        name: "discriminant interpretation",
        mastery: 0.34,
      },
    ],
    recentEvents: [
      {
        kind: "grade",
        at: (Date.now() - 2 * 86_400_000) as number & { __brand: "Timestamp" },
        label: "polynomials",
        detail: "7 / 10",
      },
      {
        kind: "gate",
        at: (Date.now() - 6 * 86_400_000) as number & { __brand: "Timestamp" },
        label: "linear factoring",
        detail: "gate cleared",
      },
      {
        kind: "session",
        at: (Date.now() - 8 * 86_400_000) as number & { __brand: "Timestamp" },
        label: "quadratics intro",
        detail: "42 min",
      },
    ],
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderWithClient(
  rollupFactory: () => Promise<CourseProgressRollup[]>,
  overrides: { progress?: { rollup: () => Promise<CourseProgressRollup[]> } } = {},
) {
  const client = makeFakeClient({
    progress: { rollup: rollupFactory, ...overrides.progress },
  });
  return render(
    <PraxisClientProvider client={client}>
      <ProgressRoute />
    </PraxisClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ProgressRoute", () => {
  it("shows loading state before data arrives", () => {
    const { container } = renderWithClient(
      () => new Promise<CourseProgressRollup[]>(() => {}), // never resolves
    );
    expect(container.textContent).toMatch(/loading/i);
  });

  it("shows error message on failure", async () => {
    renderWithClient(() => Promise.reject(new Error("network error")));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByRole("alert").textContent).toMatch(/network error/i);
    });
  });

  it("shows empty state with CTA when no courses", async () => {
    renderWithClient(() => Promise.resolve([]));
    await waitFor(() => {
      expect(screen.getByText(/start a course to see progress/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /start a course/i })).toBeDefined();
    });
  });

  it("renders a chapter for each course in the rollup", async () => {
    const rollups = [
      makeRollup({ courseId: brandId<"CourseId">("c-1"), courseTitle: "Algebra I" }),
      makeRollup({ courseId: brandId<"CourseId">("c-2"), courseTitle: "Calculus" }),
    ];
    renderWithClient(() => Promise.resolve(rollups));
    await waitFor(() => {
      expect(screen.getByText("Algebra I")).toBeDefined();
      expect(screen.getByText("Calculus")).toBeDefined();
    });
  });

  it("renders roman numeral indexes for chapters", async () => {
    const rollups = [
      makeRollup({ courseId: brandId<"CourseId">("c-1"), courseTitle: "Algebra I" }),
      makeRollup({ courseId: brandId<"CourseId">("c-2"), courseTitle: "Calculus" }),
    ];
    renderWithClient(() => Promise.resolve(rollups));
    await waitFor(() => {
      expect(screen.getByText("i.")).toBeDefined();
      expect(screen.getByText("ii.")).toBeDefined();
    });
  });

  it("renders mastery percent in chapter header", async () => {
    renderWithClient(() => Promise.resolve([makeRollup({ masteryPercent: 0.62 })]));
    await waitFor(() => {
      expect(screen.getByText("62%")).toBeDefined();
    });
  });

  it("renders CoverageBar progressbar for each course", async () => {
    renderWithClient(() => Promise.resolve([makeRollup()]));
    await waitFor(() => {
      const bars = screen.getAllByRole("progressbar");
      expect(bars.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("YouAreHere sub-component", () => {
    it("renders lesson title and position when lesson is set", async () => {
      renderWithClient(() =>
        Promise.resolve([
          makeRollup({
            currentLesson: {
              id: brandId<"LessonId">("l-1"),
              title: "Quadratics — Factoring",
              index: 11,
              total: 18,
            },
          }),
        ]),
      );
      await waitFor(() => {
        expect(screen.getByText(/lesson 11 of 18/i)).toBeDefined();
        expect(screen.getByText("Quadratics — Factoring")).toBeDefined();
      });
    });

    it("renders gate info when gate is set", async () => {
      renderWithClient(() =>
        Promise.resolve([
          makeRollup({
            activeGate: {
              id: brandId<"GateId">("g-1"),
              title: "Linear Factoring",
              lockReason: "needs one more quiz pass",
              progress: 0.8,
            },
          }),
        ]),
      );
      await waitFor(() => {
        expect(screen.getByText("Linear Factoring")).toBeDefined();
        expect(screen.getByText(/needs one more quiz pass/i)).toBeDefined();
      });
    });

    it("shows placeholder when both lesson and gate are null", async () => {
      renderWithClient(() =>
        Promise.resolve([makeRollup({ currentLesson: null, activeGate: null })]),
      );
      await waitFor(() => {
        expect(screen.getByText(/no active lesson/i)).toBeDefined();
      });
    });
  });

  describe("StuckOn sub-component", () => {
    it("renders concept names and mastery values", async () => {
      renderWithClient(() =>
        Promise.resolve([
          makeRollup({
            stuckConcepts: [
              {
                conceptId: brandId<"ConceptId">("c-1"),
                name: "completing the square",
                mastery: 0.28,
              },
            ],
          }),
        ]),
      );
      await waitFor(() => {
        expect(screen.getByText("completing the square")).toBeDefined();
        expect(screen.getByText("0.28")).toBeDefined();
      });
    });

    it("shows empty placeholder when no stuck concepts", async () => {
      renderWithClient(() => Promise.resolve([makeRollup({ stuckConcepts: [] })]));
      await waitFor(() => {
        expect(screen.getByText(/no stuck concepts/i)).toBeDefined();
      });
    });
  });

  describe("Recently sub-component", () => {
    it("renders grade events with label and detail", async () => {
      renderWithClient(() =>
        Promise.resolve([
          makeRollup({
            recentEvents: [
              {
                kind: "grade",
                at: (Date.now() - 86_400_000) as number & { __brand: "Timestamp" },
                label: "polynomials",
                detail: "7 / 10",
              },
            ],
          }),
        ]),
      );
      await waitFor(() => {
        expect(screen.getByText(/Quiz polynomials · 7 \/ 10/i)).toBeDefined();
      });
    });

    it("renders gate events with gate-passed label", async () => {
      renderWithClient(() =>
        Promise.resolve([
          makeRollup({
            recentEvents: [
              {
                kind: "gate",
                at: (Date.now() - 3 * 86_400_000) as number & { __brand: "Timestamp" },
                label: "linear factoring",
                detail: "gate cleared",
              },
            ],
          }),
        ]),
      );
      await waitFor(() => {
        expect(screen.getByText(/gate passed: linear factoring/i)).toBeDefined();
      });
    });

    it("renders session events with session label", async () => {
      renderWithClient(() =>
        Promise.resolve([
          makeRollup({
            recentEvents: [
              {
                kind: "session",
                at: (Date.now() - 7 * 86_400_000) as number & { __brand: "Timestamp" },
                label: "quadratics intro",
                detail: "42 min",
              },
            ],
          }),
        ]),
      );
      await waitFor(() => {
        expect(screen.getByText(/session: quadratics intro/i)).toBeDefined();
      });
    });

    it("shows empty placeholder when no recent events", async () => {
      renderWithClient(() => Promise.resolve([makeRollup({ recentEvents: [] })]));
      await waitFor(() => {
        expect(screen.getByText(/no recent activity/i)).toBeDefined();
      });
    });

    it("renders a relative timestamp for each event", async () => {
      // Verify that the timestamp spans render; use a matcher for any recognisable
      // relative-time token (today / yesterday / N days ago / N weeks ago).
      renderWithClient(() =>
        Promise.resolve([
          makeRollup({
            recentEvents: [
              {
                kind: "session",
                at: (Date.now() - 5 * 86_400_000) as number & { __brand: "Timestamp" },
                label: "session A",
                detail: "20 min",
              },
            ],
          }),
        ]),
      );
      await waitFor(() => {
        // Match any relative-time label: "today", "yesterday", "N days ago", "N weeks ago"
        expect(screen.getByText(/^(today|yesterday|\d+ days ago|\d+ weeks? ago)$/i)).toBeDefined();
      });
    });
  });

  describe("has-courses-no-data state", () => {
    it("renders chapter with 0% mastery and empty placeholders", async () => {
      renderWithClient(() =>
        Promise.resolve([
          makeRollup({
            masteryPercent: 0,
            currentLesson: null,
            activeGate: null,
            stuckConcepts: [],
            recentEvents: [],
          }),
        ]),
      );
      await waitFor(() => {
        expect(screen.getByText("0%")).toBeDefined();
        expect(screen.getByText(/no active lesson/i)).toBeDefined();
        expect(screen.getByText(/no stuck concepts/i)).toBeDefined();
        expect(screen.getByText(/no recent activity/i)).toBeDefined();
      });
    });
  });
});
