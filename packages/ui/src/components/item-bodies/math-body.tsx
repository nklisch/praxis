import type { MathItem } from "@praxis/core/types";
import type { ForwardedRef } from "react";
import cardStyles from "../assignment-item-card.module.css";
import type { SketchCanvasHandle } from "../sketch-canvas.js";
import { SketchCanvas } from "../sketch-canvas.js";

export interface MathBodyProps {
  item: MathItem;
  response: string;
  work?: string | undefined;
  onChange: (response: string) => void;
  onWorkChange?: ((work: string) => void) | undefined;
  disabled?: boolean | undefined;
  sketchHandleRef?: ForwardedRef<SketchCanvasHandle> | undefined;
}

export function MathBody({
  item,
  response,
  work,
  onChange,
  onWorkChange,
  disabled = false,
  sketchHandleRef,
}: MathBodyProps) {
  const hasWorkRubric = item.workRubric !== undefined;

  return (
    <>
      {hasWorkRubric && (
        <div className={cardStyles.workSection}>
          <label htmlFor={`work-${item.id}`} className={cardStyles.workLabel}>
            show your work (optional, earns partial credit):
          </label>
          <textarea
            id={`work-${item.id}`}
            className={cardStyles.workInput}
            value={work ?? ""}
            onChange={(e) => onWorkChange?.(e.target.value)}
            disabled={disabled}
            rows={5}
          />
        </div>
      )}

      {sketchHandleRef !== undefined && (
        <div className={cardStyles.workSection}>
          <span className={cardStyles.workLabel}>or sketch your work:</span>
          <SketchCanvas variant="inline" handleRef={sketchHandleRef} />
        </div>
      )}

      <div className={cardStyles.mathAnswer}>
        {hasWorkRubric && (
          <label htmlFor={`math-answer-${item.id}`} className={cardStyles.answerLabel}>
            final answer:
          </label>
        )}
        <input
          id={hasWorkRubric ? `math-answer-${item.id}` : undefined}
          type="text"
          className={cardStyles.mathInput}
          value={response}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="enter your answer (e.g., x = 3)"
          aria-label="math answer"
        />
      </div>
    </>
  );
}
