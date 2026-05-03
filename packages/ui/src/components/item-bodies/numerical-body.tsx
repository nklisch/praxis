import type { NumericalItem } from "@praxis/core/types";
import styles from "./item-body-shared.module.css";
import numericalStyles from "./numerical-body.module.css";

export interface NumericalBodyProps {
  item: NumericalItem;
  /**
   * JSON-encoded object: `{ value: string; units?: string }`.
   * `value` is the raw text the student typed (validated on submit).
   */
  response: string;
  onChange: (response: string) => void;
  disabled?: boolean;
}

interface NumericalResponse {
  value: string;
  units?: string;
}

function parseResponse(response: string): NumericalResponse {
  if (!response || response === "") return { value: "" };
  try {
    const parsed = JSON.parse(response);
    if (typeof parsed === "object" && parsed !== null && "value" in parsed) {
      return parsed as NumericalResponse;
    }
  } catch {
    // malformed — treat as bare value string for backwards compat
    return { value: response };
  }
  return { value: "" };
}

export function NumericalBody({ item, response, onChange, disabled = false }: NumericalBodyProps) {
  const parsed = parseResponse(response);

  const update = (patch: Partial<NumericalResponse>) => {
    onChange(JSON.stringify({ ...parsed, ...patch }));
  };

  return (
    <div className={numericalStyles.numericalRow}>
      <div className={numericalStyles.inputGroup}>
        <label htmlFor={`num-val-${item.id}`} className={numericalStyles.inputLabel}>
          value
        </label>
        <input
          id={`num-val-${item.id}`}
          type="number"
          className={styles.numericInput}
          value={parsed.value}
          onChange={(e) => update({ value: e.target.value })}
          disabled={disabled}
          placeholder="0"
          aria-label="numerical value"
        />
      </div>

      {item.expectedUnits !== undefined && (
        <div className={numericalStyles.inputGroup}>
          <label htmlFor={`num-units-${item.id}`} className={numericalStyles.inputLabel}>
            units
          </label>
          <input
            id={`num-units-${item.id}`}
            type="text"
            className={styles.textInput}
            value={parsed.units ?? ""}
            onChange={(e) => update({ units: e.target.value })}
            disabled={disabled}
            placeholder={item.expectedUnits}
            aria-label="units"
          />
        </div>
      )}

      {item.significantFigures !== undefined && (
        <p className={numericalStyles.hint}>
          · {item.significantFigures} significant figure
          {item.significantFigures !== 1 ? "s" : ""}
        </p>
      )}

      {item.tolerance !== undefined && item.tolerance > 0 && (
        <p className={numericalStyles.hint}>· tolerance ±{item.tolerance}</p>
      )}
    </div>
  );
}
