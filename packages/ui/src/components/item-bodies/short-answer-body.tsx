import type { ShortAnswerItem } from "@praxis/core/types";
import styles from "./item-body-shared.module.css";

export interface ShortAnswerBodyProps {
  item: ShortAnswerItem;
  response: string;
  onChange: (response: string) => void;
  disabled?: boolean;
}

export function ShortAnswerBody({
  item: _item,
  response,
  onChange,
  disabled = false,
}: ShortAnswerBodyProps) {
  return (
    <input
      type="text"
      className={styles.textInput}
      value={response}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="type your answer…"
      aria-label="short answer"
    />
  );
}
