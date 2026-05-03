import type { TwoTierItem } from "@praxis/core/types";
import { SingleChoiceBody } from "./single-choice-body.js";
import styles from "./two-tier-body.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TwoTierResponse {
  tier1Index: string; // "" for unselected, else stringified number
  tier2Index: string; // "" for unselected, else stringified number
}

export interface TwoTierBodyProps {
  item: TwoTierItem;
  /**
   * JSON-encoded TwoTierResponse, e.g. '{"tier1Index":"0","tier2Index":"1"}'.
   * "" for empty.
   */
  response: string;
  onChange: (response: string) => void;
  disabled?: boolean;
  feedback?: {
    correctOptionIndex: number;
    correctReasonIndex: number;
  };
}

function parseResponse(response: string): TwoTierResponse {
  if (!response || response === "") return { tier1Index: "", tier2Index: "" };
  try {
    const parsed = JSON.parse(response);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as TwoTierResponse;
    }
  } catch {
    // ignore
  }
  return { tier1Index: "", tier2Index: "" };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TwoTierBody({
  item,
  response,
  onChange,
  disabled = false,
  feedback,
}: TwoTierBodyProps) {
  const parsed = parseResponse(response);
  const tier1Selected = parsed.tier1Index !== "";
  const tier2Visible = tier1Selected;

  const handleTier1Change = (tier1Index: string) => {
    // Reset tier2 when tier1 changes so student re-commits
    onChange(JSON.stringify({ tier1Index, tier2Index: "" }));
  };

  const handleTier2Change = (tier2Index: string) => {
    onChange(JSON.stringify({ ...parsed, tier2Index }));
  };

  // Construct synthetic single-choice items for reuse of SingleChoiceBody
  const tier1Item = {
    kind: "single-choice" as const,
    id: `${item.id}-t1`,
    prompt: item.prompt,
    options: item.options,
    correctOptionIndex: item.correctOptionIndex,
  };

  const tier2Item = {
    kind: "single-choice" as const,
    id: `${item.id}-t2`,
    prompt: item.reasonPrompt,
    options: item.reasonOptions,
    correctOptionIndex: item.correctReasonIndex,
  };

  return (
    <div className={styles.wrapper}>
      {/* Tier 1 */}
      <div className={styles.tierSection}>
        <span className={styles.tierLabel}>· your answer</span>
        <SingleChoiceBody
          item={tier1Item}
          response={parsed.tier1Index}
          onChange={handleTier1Change}
          disabled={disabled}
          feedback={feedback ? { correctIndex: feedback.correctOptionIndex } : undefined}
        />
      </div>

      {/* Tier 2 — hidden until tier 1 selected */}
      <div
        className={tier2Visible ? styles.tier2Visible : styles.tier2Hidden}
        aria-hidden={!tier2Visible}
      >
        <div className={styles.tierSection}>
          <span className={styles.tierLabel}>· your reasoning</span>
          <p className={styles.tierPrompt}>{item.reasonPrompt}</p>
          <SingleChoiceBody
            item={tier2Item}
            response={parsed.tier2Index}
            onChange={handleTier2Change}
            disabled={disabled}
            feedback={feedback ? { correctIndex: feedback.correctReasonIndex } : undefined}
          />
        </div>
      </div>
    </div>
  );
}
