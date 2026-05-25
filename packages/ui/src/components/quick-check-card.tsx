import type { AssignmentItem, QuickCheckAnswer } from "@praxis/core/types";
import { useState } from "react";
import { FreeResponseBody } from "./item-bodies/free-response-body.js";
import { MatchingBody } from "./item-bodies/matching-body.js";
import { MultiSelectBody } from "./item-bodies/multi-select-body.js";
import { NumericalBody } from "./item-bodies/numerical-body.js";
import { OrderingBody } from "./item-bodies/ordering-body.js";
import { ReasoningTextarea } from "./item-bodies/reasoning-textarea.js";
import { ShortAnswerBody } from "./item-bodies/short-answer-body.js";
import { SingleChoiceBody } from "./item-bodies/single-choice-body.js";
import { TwoTierBody } from "./item-bodies/two-tier-body.js";
import styles from "./quick-check-card.module.css";
import { ThreadChip } from "./thread-chip.js";

export interface QuickCheckCardProps {
  callId: string;
  item: AssignmentItem;
  onResolve: (callId: string, answer: QuickCheckAnswer) => Promise<void>;
}

/**
 * Inline chat-thread card for a quick check. Rendered as a synthetic message
 * bubble; not a modal. Uses the same per-kind body subcomponents as
 * AssignmentItemCard for rendering consistency.
 *
 * On submit, the card immediately transitions to a <ThreadChip> summary —
 * no greyed-out wait through the tutor's thinking round-trip. The
 * `onResolve` IPC call fires in the background. The chip is click-to-expand
 * back to a read-only card with the correct/incorrect badge.
 *
 * "Clarify in chat" dismisses the card immediately and signals the agent to
 * resume conversational mode (fires `{ kind: "abandoned" }`).
 *
 * Free-form text input is rendered for choice-based items (single-choice,
 * multi-select, two-tier). When the student populates it and submits, the
 * free-form text is sent as a short-answer answer instead of the structured
 * pick (more specific signal).
 *
 * Phase 17: only single-choice, multi-select, short-answer, and matching are
 * produced by quick_check.* tools. The remaining kinds are included for
 * completeness should the tool set expand.
 */
export function QuickCheckCard({ callId, item, onResolve }: QuickCheckCardProps) {
  const [response, setResponse] = useState("");
  const [work, setWork] = useState("");
  const [freeForm, setFreeForm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [dismissedVariant, setDismissedVariant] = useState<"answered" | "dismissed" | null>(null);
  const [dismissedAt, setDismissedAt] = useState<Date | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<QuickCheckAnswer | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [expandedFromChip, setExpandedFromChip] = useState(false);

  const hasReasoning =
    (item.kind === "single-choice" || item.kind === "multi-select" || item.kind === "two-tier") &&
    item.requireReasoning === true;

  // Free-form is shown for choice-based items so students can elaborate or
  // provide an alternative answer when none of the choices fit.
  const showFreeForm =
    item.kind === "single-choice" ||
    item.kind === "multi-select" ||
    item.kind === "two-tier" ||
    item.kind === "structured-question";

  const isResponseEmpty = response === "" || response === "[]" || response === "{}";

  const handleSubmit = () => {
    // Free-form wins: if populated, skip the structured-choice validation check.
    const useFreeForm = freeForm.trim().length > 0;

    if (!useFreeForm) {
      if (isResponseEmpty) {
        setShowValidation(true);
        return;
      }
      if (hasReasoning && work.trim() === "") {
        setShowValidation(true);
        return;
      }
    }

    const when = new Date();
    // Build the answer — free-form overrides structured pick
    const answer: QuickCheckAnswer = useFreeForm
      ? { kind: "short-answer", text: freeForm.trim() }
      : buildAnswer(item, response, work);

    const graded = gradeAnswer(item, answer);
    setLastAnswer(answer);
    setCorrect(graded);
    setSubmitted(true);
    setDismissedVariant("answered");
    setDismissedAt(when);

    // Fire-and-forget — do NOT await; chip renders immediately
    void onResolve(callId, answer);
  };

  const handleClarifyInChat = () => {
    if (submitted) return;
    const when = new Date();
    setSubmitted(true);
    setDismissedVariant("dismissed");
    setDismissedAt(when);
    void onResolve(callId, { kind: "abandoned" });
  };

  // ── ThreadChip render path ───────────────────────────────────────────────────

  if (dismissedVariant !== null && dismissedAt !== null && !expandedFromChip) {
    const stem = stemOf(item);
    const truncatedStem = stem.length > 60 ? `${stem.slice(0, 57)}…` : stem;

    if (dismissedVariant === "dismissed") {
      return (
        <ThreadChip variant="dismissed" verb="you asked to discuss in chat" when={dismissedAt} />
      );
    }

    const answerSummary = lastAnswer !== null ? summariseAnswer(item, lastAnswer) : undefined;
    const verb =
      lastAnswer?.kind === "multi-select"
        ? `you selected ${lastAnswer.selectedIndices.length}`
        : "you answered";

    return (
      <ThreadChip
        variant="answered"
        verb={verb}
        answer={answerSummary ?? truncatedStem}
        when={dismissedAt}
        onExpand={() => setExpandedFromChip(true)}
      />
    );
  }

  // ── Read-only re-expanded card ───────────────────────────────────────────────

  if (expandedFromChip) {
    return (
      <div className={`${styles.card} ${styles.submitted}`}>
        <button
          type="button"
          className={styles.collapsedSummary}
          onClick={() => setExpandedFromChip(false)}
          aria-expanded={true}
        >
          <span className={styles.disclosure} aria-hidden="true">
            ▾
          </span>
          <span className={styles.collapsedStem}>{stemOf(item)}</span>
          {lastAnswer && (
            <span className={styles.collapsedAnswer}>· {summariseAnswer(item, lastAnswer)}</span>
          )}
          {correct === true && (
            <span className={styles.badgeCorrect} role="img" aria-label="correct">
              ✓
            </span>
          )}
          {correct === false && (
            <span className={styles.badgeIncorrect} role="img" aria-label="incorrect">
              ✗
            </span>
          )}
        </button>
        <div className={styles.collapsedDetails}>
          {renderQuickCheckBody({
            item,
            response,
            work,
            onResponseChange: () => {},
            disabled: true,
          })}
          {hasReasoning && work.trim() !== "" && (
            <p className={styles.collapsedReasoning}>{work}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Active card ──────────────────────────────────────────────────────────────

  return (
    <div className={styles.card}>
      <div className={styles.tag}>
        <span className={styles.tagOrnament}>⌖</span>
        <span>tutor asked</span>
      </div>

      {"prompt" in item && <p className={styles.prompt}>{item.prompt as string}</p>}

      {renderQuickCheckBody({
        item,
        response,
        work,
        onResponseChange: setResponse,
        disabled: submitted,
      })}

      {hasReasoning && (
        <ReasoningTextarea
          id={`qc-reasoning-${callId}`}
          value={work}
          onChange={setWork}
          disabled={submitted}
          showValidation={showValidation}
        />
      )}

      {showFreeForm && (
        <div className={styles.freeForm}>
          <label className={styles.freeFormLabel} htmlFor={`qc-free-${callId}`}>
            or, in your own words
          </label>
          <textarea
            id={`qc-free-${callId}`}
            className={styles.freeFormInput}
            value={freeForm}
            onChange={(e) => setFreeForm(e.target.value)}
            disabled={submitted}
            placeholder="…something else? sketch the reasoning."
            rows={2}
          />
        </div>
      )}

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.clarifyBtn}
          onClick={handleClarifyInChat}
          disabled={submitted}
        >
          ↑ clarify in chat
        </button>
        <button
          type="button"
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={submitted}
        >
          {submitted ? "…" : "submit"}
        </button>
      </div>
    </div>
  );
}

// ─── Body dispatcher (subset of item kinds for quick-check surface) ───────────

interface QuickBodyProps {
  item: AssignmentItem;
  response: string;
  work: string;
  onResponseChange: (response: string) => void;
  disabled: boolean;
}

function renderQuickCheckBody({ item, response, onResponseChange, disabled }: QuickBodyProps) {
  switch (item.kind) {
    case "single-choice":
      return (
        <SingleChoiceBody
          item={item}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
        />
      );
    case "multi-select":
      return (
        <MultiSelectBody
          item={item}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
        />
      );
    case "short-answer":
      return (
        <ShortAnswerBody
          item={item}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
        />
      );
    case "matching":
      return (
        <MatchingBody
          item={item}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
        />
      );
    case "ordering":
      return (
        <OrderingBody
          item={item}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
        />
      );
    case "free-response":
      return (
        <FreeResponseBody
          item={item}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
        />
      );
    case "numerical":
      return (
        <NumericalBody
          item={item}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
        />
      );
    case "two-tier":
      return (
        <TwoTierBody
          item={item}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
        />
      );
    case "math":
    case "code":
      return (
        <textarea
          rows={4}
          value={response}
          onChange={(e) => onResponseChange(e.target.value)}
          disabled={disabled}
          placeholder="your answer…"
          aria-label="answer"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "0.4rem 0.6rem",
            background: "var(--color-bg-tertiary, rgba(255,255,255,0.06))",
            border: "1px solid var(--color-border, rgba(255,255,255,0.12))",
            borderRadius: "4px",
            color: "var(--color-text-primary, #e5e5e5)",
            fontSize: "0.875rem",
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
      );

    case "structured-question":
      return null;
  }
}

// ─── Build QuickCheckAnswer from response state ───────────────────────────────

function buildAnswer(item: AssignmentItem, response: string, _work: string): QuickCheckAnswer {
  switch (item.kind) {
    case "single-choice": {
      const idx = parseInt(response, 10);
      return { kind: "single-choice", selectedIndex: Number.isNaN(idx) ? -1 : idx };
    }
    case "multi-select": {
      let indices: number[] = [];
      try {
        const parsed = JSON.parse(response);
        if (Array.isArray(parsed)) indices = parsed as number[];
      } catch {
        // ignore
      }
      return { kind: "multi-select", selectedIndices: indices };
    }
    case "short-answer":
      return { kind: "short-answer", text: response };
    case "matching": {
      let pairs: Array<{ leftId: string; rightId: string }> = [];
      try {
        const parsed = JSON.parse(response);
        if (Array.isArray(parsed)) pairs = parsed;
      } catch {
        // ignore
      }
      return { kind: "matching", pairs };
    }
    default:
      return { kind: "short-answer", text: response };
  }
}

// ─── Client-side grading for the collapsed-state badge ─────────────────────────

/**
 * Grade the submitted answer client-side so the collapsed summary can show a
 * correct/incorrect badge immediately without a server round-trip.
 *
 * Returns true (correct) / false (incorrect) / null (ungraded — no badge,
 * e.g. structured-question with no ground truth, or formative-probe single
 * choice with correctOptionIndex < 0).
 *
 * Mirrors the per-kind grading the server-side handlers do; if grading
 * semantics ever diverge between client and server, the badge will silently
 * disagree until a shared helper is extracted (deferred — see feature notes).
 */
function gradeAnswer(item: AssignmentItem, answer: QuickCheckAnswer): boolean | null {
  switch (item.kind) {
    case "single-choice": {
      if (answer.kind !== "single-choice") return null;
      if (typeof item.correctOptionIndex !== "number" || item.correctOptionIndex < 0) return null;
      return answer.selectedIndex === item.correctOptionIndex;
    }
    case "multi-select": {
      if (answer.kind !== "multi-select") return null;
      const correctIndices = item.correctOptionIndices;
      if (!correctIndices || correctIndices.length === 0) return null;
      return setsEqual(answer.selectedIndices, correctIndices);
    }
    case "short-answer": {
      if (answer.kind !== "short-answer") return null;
      const accepted = item.acceptedAnswers;
      if (!accepted || accepted.length === 0) return null;
      const mode = item.acceptedAnswerMatch ?? "exact";
      return matchShortAnswer(answer.text, accepted, mode);
    }
    case "matching": {
      if (answer.kind !== "matching") return null;
      const correctPairs = item.correctPairs;
      if (!correctPairs || correctPairs.length === 0) return null;
      return pairSetsEqual(answer.pairs, correctPairs);
    }
    default:
      return null;
  }
}

function setsEqual(a: ReadonlyArray<number>, b: ReadonlyArray<number>): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(b);
  return a.every((x) => seen.has(x));
}

function pairSetsEqual(
  a: ReadonlyArray<{ leftId: string; rightId: string }>,
  b: ReadonlyArray<{ leftId: string; rightId: string }>,
): boolean {
  if (a.length !== b.length) return false;
  const key = (p: { leftId: string; rightId: string }) => `${p.leftId}::${p.rightId}`;
  const seen = new Set(b.map(key));
  return a.every((p) => seen.has(key(p)));
}

function matchShortAnswer(
  text: string,
  accepted: ReadonlyArray<string>,
  mode: "exact" | "substring" | "normalized",
): boolean {
  switch (mode) {
    case "exact":
      return accepted.some((a) => a === text);
    case "substring":
      return accepted.some((a) => text.includes(a));
    case "normalized": {
      const norm = (s: string) => s.trim().toLowerCase();
      const t = norm(text);
      return accepted.some((a) => norm(a) === t);
    }
  }
}

// ─── Collapsed-summary helpers ────────────────────────────────────────────────

function stemOf(item: AssignmentItem): string {
  if ("prompt" in item && typeof (item as { prompt?: unknown }).prompt === "string") {
    return (item as { prompt: string }).prompt;
  }
  return "Quick check";
}

function summariseAnswer(item: AssignmentItem, answer: QuickCheckAnswer): string {
  switch (answer.kind) {
    case "single-choice": {
      const idx = answer.selectedIndex;
      if (idx < 0) return "(no answer)";
      if (item.kind === "single-choice") {
        const opt = item.options[idx];
        return opt ?? `option ${idx + 1}`;
      }
      return `option ${idx + 1}`;
    }
    case "multi-select": {
      if (answer.selectedIndices.length === 0) return "(no selection)";
      if (item.kind === "multi-select") {
        return answer.selectedIndices.map((i) => item.options[i] ?? `option ${i + 1}`).join(", ");
      }
      return `${answer.selectedIndices.length} selected`;
    }
    case "short-answer":
      return answer.text.length > 80 ? `${answer.text.slice(0, 77)}…` : answer.text;
    case "matching":
      return `${answer.pairs.length} pair${answer.pairs.length === 1 ? "" : "s"}`;
    default:
      return "submitted";
  }
}
