import styles from "./citation-chip.module.css";

export interface CitationChipProps {
  index: number;
  onClick?: (index: number) => void;
}

/** Inline [N] citation chip. Clicking scrolls to or highlights the source card. */
export function CitationChip({ index, onClick }: CitationChipProps) {
  return (
    <button
      type="button"
      className={styles.chip}
      onClick={() => onClick?.(index)}
      title={`Source [${index}]`}
    >
      [{index}]
    </button>
  );
}
