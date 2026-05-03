import type { AssignmentItem } from "@praxis/core/types";
import type { ForwardedRef } from "react";
import styles from "./assignment-item-card.module.css";
import { CodeBody } from "./item-bodies/code-body.js";
import { FreeResponseBody } from "./item-bodies/free-response-body.js";
import { MatchingBody } from "./item-bodies/matching-body.js";
import { MathBody } from "./item-bodies/math-body.js";
import { MultiSelectBody } from "./item-bodies/multi-select-body.js";
import { NumericalBody } from "./item-bodies/numerical-body.js";
import { OrderingBody } from "./item-bodies/ordering-body.js";
import { ReasoningTextarea } from "./item-bodies/reasoning-textarea.js";
import { ShortAnswerBody } from "./item-bodies/short-answer-body.js";
import { SingleChoiceBody } from "./item-bodies/single-choice-body.js";
import { TwoTierBody } from "./item-bodies/two-tier-body.js";
import type { SketchCanvasHandle } from "./sketch-canvas.js";

export interface AssignmentItemCardProps {
  item: AssignmentItem;
  index: number;
  /** Primary answer / response. */
  response: string;
  /** Shown work text — only relevant when item has workRubric or requireReasoning. */
  work?: string;
  onResponseChange: (response: string) => void;
  /** Called when shown work / reasoning text changes. */
  onWorkChange?: (work: string) => void;
  disabled?: boolean;
  /**
   * Phase 15a: forwarded ref to the item's SketchCanvas imperative handle.
   * The parent (AssignmentCard) holds these refs and calls capture() on submit.
   * Only provided for math items; undefined otherwise.
   */
  sketchHandleRef?: ForwardedRef<SketchCanvasHandle>;
  /** When true and item has requireReasoning, show validation hint on empty work field. */
  showValidation?: boolean;
}

/**
 * Per-item input card. Dispatches to a per-kind body subcomponent via a
 * clean switch. The kind-agnostic chrome (header, prompt, partial-credit
 * badge) wraps the body. After the body, renders a <ReasoningTextarea> when
 * `item.requireReasoning === true`.
 */
export function AssignmentItemCard({
  item,
  index,
  response,
  work,
  onResponseChange,
  onWorkChange,
  disabled = false,
  sketchHandleRef,
  showValidation = false,
}: AssignmentItemCardProps) {
  const hasWorkRubric =
    (item.kind === "math" || item.kind === "code" || item.kind === "numerical") &&
    item.workRubric !== undefined;

  const hasReasoning =
    (item.kind === "single-choice" || item.kind === "multi-select" || item.kind === "two-tier") &&
    item.requireReasoning === true;

  return (
    <div className={styles.itemCard}>
      <div className={styles.itemHeader}>
        <span className={styles.itemNumber}>Item {index + 1}</span>
        <span className={styles.itemKind}>{item.kind}</span>
        {hasWorkRubric && (
          <span className={styles.partialCreditBadge}>partial credit available</span>
        )}
      </div>

      <p className={styles.prompt}>{item.prompt}</p>

      {/* Per-kind body — dispatched by kind */}
      {renderBody({
        item,
        response,
        work,
        onResponseChange,
        onWorkChange,
        disabled,
        sketchHandleRef,
      })}

      {/* Reasoning textarea — rendered after the body when requireReasoning is set */}
      {hasReasoning && (
        <ReasoningTextarea
          id={`reasoning-${item.id}`}
          value={work ?? ""}
          onChange={(val) => onWorkChange?.(val)}
          disabled={disabled}
          showValidation={showValidation}
        />
      )}
    </div>
  );
}

// ─── Body dispatcher ──────────────────────────────────────────────────────────

interface BodyProps {
  item: AssignmentItem;
  response: string;
  work?: string;
  onResponseChange: (response: string) => void;
  onWorkChange?: (work: string) => void;
  disabled: boolean;
  sketchHandleRef?: ForwardedRef<SketchCanvasHandle>;
}

function renderBody({
  item,
  response,
  work,
  onResponseChange,
  onWorkChange,
  disabled,
  sketchHandleRef,
}: BodyProps) {
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

    case "free-response":
      return (
        <FreeResponseBody
          item={item}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
        />
      );

    case "math":
      return (
        <MathBody
          item={item}
          response={response}
          work={work}
          onChange={onResponseChange}
          onWorkChange={onWorkChange}
          disabled={disabled}
          sketchHandleRef={sketchHandleRef}
        />
      );

    case "code":
      return (
        <CodeBody
          item={item}
          response={response}
          work={work}
          onChange={onResponseChange}
          onWorkChange={onWorkChange}
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

    case "two-tier":
      return (
        <TwoTierBody
          item={item}
          response={response}
          onChange={onResponseChange}
          disabled={disabled}
        />
      );
  }
}
