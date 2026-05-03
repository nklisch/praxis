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
 * Phase 17: only single-choice, multi-select, short-answer, and matching are
 * produced by quick_check.* tools. The remaining kinds are included for
 * completeness should the tool set expand.
 */
export function QuickCheckCard({ callId, item, onResolve }: QuickCheckCardProps) {
  const [response, setResponse] = useState("");
  const [work, setWork] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const hasReasoning =
    (item.kind === "single-choice" || item.kind === "multi-select" || item.kind === "two-tier") &&
    item.requireReasoning === true;

  const isResponseEmpty = response === "" || response === "[]" || response === "{}";

  const handleSubmit = async () => {
    if (isResponseEmpty) {
      setShowValidation(true);
      return;
    }
    if (hasReasoning && work.trim() === "") {
      setShowValidation(true);
      return;
    }

    setSubmitting(true);
    try {
      const answer = buildAnswer(item, response, work);
      await onResolve(callId, answer);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`${styles.card} ${submitted ? styles.submitted : ""}`}>
      <div className={styles.tag}>
        <span className={styles.tagOrnament}>⌖</span>
        <span>tutor asked</span>
      </div>

      <p className={styles.prompt}>{item.prompt}</p>

      {renderQuickCheckBody({
        item,
        response,
        work,
        onResponseChange: setResponse,
        disabled: submitted || submitting,
      })}

      {hasReasoning && (
        <ReasoningTextarea
          id={`qc-reasoning-${callId}`}
          value={work}
          onChange={setWork}
          disabled={submitted || submitting}
          showValidation={showValidation}
        />
      )}

      <div className={styles.footer}>
        {submitted ? (
          <span className={styles.submittedLabel}>· submitted</span>
        ) : (
          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "…" : "submit"}
          </button>
        )}
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
      // numerical has no corresponding quick_check tool in v1 but included for completeness
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
      // math/code items are not produced by quick_check.* tools; render a text fallback
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
            background: "var(--color-surface-3, rgba(255,255,255,0.06))",
            border: "1px solid var(--color-border, rgba(255,255,255,0.12))",
            borderRadius: "4px",
            color: "var(--color-text, #e5e5e5)",
            fontSize: "0.875rem",
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
      );
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
    // All other kinds map to short-answer as a best-effort fallback
    default:
      return { kind: "short-answer", text: response };
  }
}
