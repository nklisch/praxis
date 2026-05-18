/**
 * Tests for <RecommendationRow>.
 *
 * Verifies:
 * - Per-kind dispatch (correct kicker, title, CTA label)
 * - reason line renders as secondary text
 * - CTA click fires onAction with the rec
 * - Priority marker number renders
 */
import type { Recommendation, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecommendationRow } from "../components/recommendation-row.js";

afterEach(() => cleanup());

const REASON = "Test reason string.";

// ── Kind fixtures ──────────────────────────────────────────────────────────────

const RESUME_REC: Recommendation = {
  kind: "resume_session",
  sessionId: brandId<"SessionId">("session-1"),
  mode: "teach",
  lastTouchedAt: Date.now() as Timestamp,
  reason: REASON,
  score: 0.9,
};

const REVIEW_REC: Recommendation = {
  kind: "review_cards",
  courseId: brandId<"CourseId">("course-1"),
  dueNow: 7,
  dueIn24h: 3,
  reason: REASON,
  score: 0.8,
};

const PRACTICE_REC: Recommendation = {
  kind: "practice_concept",
  conceptId: brandId<"ConceptId">("concept-1"),
  courseId: brandId<"CourseId">("course-1"),
  mastery: 0.6,
  threshold: 0.85,
  reason: REASON,
  score: 0.7,
};

const DRAFT_REC: Recommendation = {
  kind: "resume_draft",
  draftId: "draft-1" as import("@praxis/core/types").DraftId,
  lastTouchedAt: Date.now() as Timestamp,
  reason: REASON,
  score: 0.5,
};

const QC_REC: Recommendation = {
  kind: "quick_check",
  lessonId: brandId<"LessonId">("lesson-1"),
  reason: REASON,
  score: 0.4,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderRow(rec: Recommendation, priority = 1) {
  const onAction = vi.fn();
  render(<RecommendationRow rec={rec} priority={priority} onAction={onAction} />);
  return { onAction };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("RecommendationRow", () => {
  it("renders the priority number", () => {
    renderRow(RESUME_REC, 3);
    expect(screen.getByText("3")).toBeDefined();
  });

  it("renders the reason text", () => {
    renderRow(RESUME_REC);
    expect(screen.getByText(REASON)).toBeDefined();
  });

  // ── resume_session ───────────────────────────────────────────────────────────

  it("resume_session: shows mode kicker and 'Resume ↵' CTA", () => {
    renderRow(RESUME_REC);
    expect(screen.getByText("teach")).toBeDefined();
    expect(screen.getByRole("button", { name: /Resume/i })).toBeDefined();
  });

  it("resume_session: CTA click fires onAction with the rec", () => {
    const { onAction } = renderRow(RESUME_REC);
    fireEvent.click(screen.getByRole("button", { name: /Resume/i }));
    expect(onAction).toHaveBeenCalledWith(RESUME_REC);
  });

  // ── review_cards ─────────────────────────────────────────────────────────────

  it("review_cards: shows due count in CTA label", () => {
    renderRow(REVIEW_REC);
    expect(screen.getByRole("button", { name: /Review 7 cards/i })).toBeDefined();
  });

  it("review_cards: singular 'card' when dueNow is 1", () => {
    const rec: Recommendation = { ...REVIEW_REC, dueNow: 1 };
    renderRow(rec);
    expect(screen.getByRole("button", { name: /Review 1 card →/i })).toBeDefined();
  });

  it("review_cards: CTA click fires onAction", () => {
    const { onAction } = renderRow(REVIEW_REC);
    fireEvent.click(screen.getByRole("button", { name: /Review 7 cards/i }));
    expect(onAction).toHaveBeenCalledWith(REVIEW_REC);
  });

  // ── practice_concept ─────────────────────────────────────────────────────────

  it("practice_concept: shows 'Practice →' CTA", () => {
    renderRow(PRACTICE_REC);
    expect(screen.getByRole("button", { name: /Practice →/i })).toBeDefined();
  });

  it("practice_concept: CTA click fires onAction", () => {
    const { onAction } = renderRow(PRACTICE_REC);
    fireEvent.click(screen.getByRole("button", { name: /Practice →/i }));
    expect(onAction).toHaveBeenCalledWith(PRACTICE_REC);
  });

  // ── resume_draft ─────────────────────────────────────────────────────────────

  it("resume_draft: shows 'Review draft →' CTA", () => {
    renderRow(DRAFT_REC);
    expect(screen.getByRole("button", { name: /Review draft →/i })).toBeDefined();
  });

  it("resume_draft: CTA click fires onAction", () => {
    const { onAction } = renderRow(DRAFT_REC);
    fireEvent.click(screen.getByRole("button", { name: /Review draft →/i }));
    expect(onAction).toHaveBeenCalledWith(DRAFT_REC);
  });

  // ── quick_check ──────────────────────────────────────────────────────────────

  it("quick_check: shows 'Quick check →' CTA", () => {
    renderRow(QC_REC);
    expect(screen.getByRole("button", { name: /Quick check →/i })).toBeDefined();
  });

  it("quick_check: CTA click fires onAction", () => {
    const { onAction } = renderRow(QC_REC);
    fireEvent.click(screen.getByRole("button", { name: /Quick check →/i }));
    expect(onAction).toHaveBeenCalledWith(QC_REC);
  });
});
