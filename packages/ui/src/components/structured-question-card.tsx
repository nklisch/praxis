import type { QuickCheckAnswer, StructuredQuestionItem } from "@praxis/core/types";
import { type JSX, useState } from "react";
import styles from "./structured-question-card.module.css";
import { ThreadChip } from "./thread-chip.js";

export interface StructuredQuestionCardProps {
  callId: string;
  item: StructuredQuestionItem;
  onResolve: (callId: string, answer: QuickCheckAnswer) => Promise<void>;
}

/**
 * Inline chat-thread card for a structured question posed by the tutor model
 * via the `ask_student_question` tool. Renders one fieldset per question with
 * a header chip, prompt text, and a list of option buttons.
 *
 * Single-select questions require exactly one selection before Submit enables.
 * Multi-select questions allow zero or more selections (no Submit gating).
 *
 * Free-form text input is always visible below choices and takes precedence
 * over structured selections when submitted (more specific signal).
 *
 * "Clarify in chat" dismisses the card and signals the agent to resume
 * conversational mode (fires `{ kind: "abandoned" }` answer).
 *
 * On submit, the card transitions immediately to a <ThreadChip> summary —
 * no greyed-out wait through the tutor's thinking round-trip. The
 * `onResolve` IPC call fires in the background.
 */
export function StructuredQuestionCard({
  callId,
  item,
  onResolve,
}: StructuredQuestionCardProps): JSX.Element {
  const [selections, setSelections] = useState<Array<Set<number>>>(() =>
    item.questions.map(() => new Set<number>()),
  );
  const [freeFormValues, setFreeFormValues] = useState<string[]>(() =>
    item.questions.map(() => ""),
  );
  const [dismissed, setDismissed] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<Date | null>(null);
  const [dismissedVariant, setDismissedVariant] = useState<"answered" | "dismissed">("answered");
  const [expandedFromChip, setExpandedFromChip] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toggle = (qIdx: number, optIdx: number): void => {
    if (submitted || dismissed) return;
    setSelections((prev) => {
      const next = prev.map((s, i) => (i === qIdx ? new Set(s) : s));
      const set = next[qIdx];
      if (set === undefined) return prev;
      const multi = item.questions[qIdx]?.multiSelect;
      if (multi) {
        if (set.has(optIdx)) set.delete(optIdx);
        else set.add(optIdx);
      } else {
        set.clear();
        set.add(optIdx);
      }
      return next;
    });
  };

  const setFreeForm = (qIdx: number, value: string): void => {
    setFreeFormValues((prev) => prev.map((v, i) => (i === qIdx ? value : v)));
  };

  /** Build the answer payload. Free-form wins when populated. */
  const buildAnswer = (): QuickCheckAnswer => {
    const answers = selections.map((set, qIdx) => {
      const freeForm = freeFormValues[qIdx]?.trim() ?? "";
      return {
        questionIndex: qIdx,
        // When free-form is populated, send an empty selectedIndices (the tool
        // description indicates free-form text is preferred over structured pick).
        // The tutor reads free-form text from the outer card context; for now we
        // send the structured selections as-is so the answer always has shape.
        selectedIndices: freeForm.length > 0 ? [] : [...set].sort((a, b) => a - b),
      };
    });
    return { kind: "structured-question", answers };
  };

  const submit = (): void => {
    if (submitted || dismissed) return;
    const when = new Date();
    setSubmitted(true);
    setDismissed(true);
    setDismissedAt(when);
    setDismissedVariant("answered");
    // Fire-and-forget — do NOT await; the chip renders immediately
    void onResolve(callId, buildAnswer());
  };

  const clarifyInChat = (): void => {
    if (submitted || dismissed) return;
    const when = new Date();
    setDismissed(true);
    setDismissedAt(when);
    setDismissedVariant("dismissed");
    void onResolve(callId, { kind: "abandoned" });
  };

  // Submit is only gated on single-select questions: each must have exactly one
  // selection. Multi-select questions allow zero selections — no gating.
  // Free-form overrides: if ANY question has free-form text, submit is enabled.
  const hasFreeForm = freeFormValues.some((v) => v.trim().length > 0);
  const canSubmit =
    hasFreeForm || item.questions.every((q, i) => q.multiSelect || selections[i]?.size === 1);

  // ── Chip summary text helpers ────────────────────────────────────────────────

  /** Build the verb + answer summary for the ThreadChip. */
  const buildChipSummary = (): { verb: string; answer: string | undefined } => {
    if (dismissedVariant === "dismissed") {
      return { verb: "you asked to discuss in chat", answer: undefined };
    }

    // Try to summarise across all questions
    const totalQuestions = item.questions.length;

    if (totalQuestions === 1) {
      const q = item.questions[0];
      const freeForm = freeFormValues[0]?.trim() ?? "";
      if (freeForm.length > 0) {
        const truncated = freeForm.length > 60 ? `${freeForm.slice(0, 57)}…` : freeForm;
        return { verb: "you answered", answer: truncated };
      }
      const sel = [...(selections[0] ?? new Set())].sort((a, b) => a - b);
      if (sel.length === 0) return { verb: "you answered", answer: "(no selection)" };
      if (q?.multiSelect) {
        const verb = `you selected ${sel.length}`;
        const labels = sel.map((i) => q.options[i]?.label ?? `option ${i + 1}`).join(" + ");
        const answer = labels.length > 60 ? `${labels.slice(0, 57)}…` : labels;
        return { verb, answer };
      }
      const firstIdx = sel[0] ?? 0;
      const label = q?.options[firstIdx]?.label ?? `option ${firstIdx + 1}`;
      return { verb: "you answered", answer: label };
    }

    // Multiple questions: count answered
    const answeredCount = item.questions.filter(
      (_, i) => (freeFormValues[i]?.trim().length ?? 0) > 0 || (selections[i]?.size ?? 0) > 0,
    ).length;
    return { verb: `you answered ${answeredCount} of ${totalQuestions}`, answer: undefined };
  };

  // ── Chip render path ─────────────────────────────────────────────────────────

  if (dismissed && !expandedFromChip && dismissedAt !== null) {
    const { verb, answer } = buildChipSummary();
    return (
      <ThreadChip
        variant={dismissedVariant}
        verb={verb}
        answer={answer}
        when={dismissedAt}
        onExpand={dismissedVariant === "answered" ? () => setExpandedFromChip(true) : undefined}
      />
    );
  }

  // ── Full card (or read-only re-expanded card) ────────────────────────────────

  const isReadOnly = expandedFromChip;

  return (
    <section className={styles.card}>
      <div className={styles.tag}>
        <span className={styles.tagOrnament}>⌖</span>
        <span>tutor asked</span>
      </div>
      {item.questions.map((q, qIdx) => (
        <fieldset
          // biome-ignore lint/suspicious/noArrayIndexKey: questions are positional, no stable id
          key={qIdx}
          className={styles.question}
          disabled={submitted || isReadOnly}
        >
          <legend className={styles.headerChip}>{q.header}</legend>
          <p className={styles.prompt}>{q.prompt}</p>
          <ul className={styles.options}>
            {q.options.map((opt, optIdx) => {
              const selected = selections[qIdx]?.has(optIdx);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: options are positional, no stable id
                <li key={optIdx}>
                  <button
                    type="button"
                    className={selected ? styles.optionSelected : styles.option}
                    onClick={() => toggle(qIdx, optIdx)}
                    aria-pressed={selected}
                  >
                    <span className={styles.optionLabel}>{opt.label}</span>
                    {opt.description !== undefined && (
                      <span className={styles.optionDesc}>{opt.description}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Free-form text field — always visible below choices */}
          {!isReadOnly && (
            <div className={styles.freeForm}>
              <label className={styles.freeFormLabel} htmlFor={`sqc-free-${callId}-${qIdx}`}>
                or, in your own words
              </label>
              <textarea
                id={`sqc-free-${callId}-${qIdx}`}
                className={styles.freeFormInput}
                value={freeFormValues[qIdx] ?? ""}
                onChange={(e) => setFreeForm(qIdx, e.target.value)}
                disabled={submitted}
                placeholder="…something else? sketch the reasoning."
                rows={2}
              />
            </div>
          )}

          {isReadOnly && (freeFormValues[qIdx]?.trim().length ?? 0) > 0 && (
            <p className={styles.freeFormReadOnly}>{freeFormValues[qIdx]}</p>
          )}
        </fieldset>
      ))}

      {!isReadOnly && (
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.clarifyBtn}
            onClick={clarifyInChat}
            disabled={submitted}
          >
            ↑ clarify in chat
          </button>
          <button
            type="button"
            className={styles.submit}
            onClick={submit}
            disabled={!canSubmit || submitted}
          >
            Submit ↵
          </button>
        </div>
      )}

      {isReadOnly && (
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => setExpandedFromChip(false)}
          >
            ↑ collapse
          </button>
        </div>
      )}
    </section>
  );
}
