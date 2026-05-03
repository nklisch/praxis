import type { FreeResponseItem } from "@praxis/core/types";
import cardStyles from "../assignment-item-card.module.css";

export interface FreeResponseBodyProps {
  item: FreeResponseItem;
  response: string;
  onChange: (response: string) => void;
  disabled?: boolean;
}

export function FreeResponseBody({
  item: _item,
  response,
  onChange,
  disabled = false,
}: FreeResponseBodyProps) {
  return (
    <textarea
      className={cardStyles.freeResponseInput}
      value={response}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={5}
      placeholder="write your response…"
      aria-label="free response"
    />
  );
}
