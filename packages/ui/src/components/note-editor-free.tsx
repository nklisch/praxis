import { useState } from "react";
import styles from "./note-editor-free.module.css";

export interface FreeBody {
  kind: "free";
  text: string;
}

export interface NoteEditorFreeProps {
  body: FreeBody;
  onChange: (body: FreeBody) => void;
}

/**
 * Free-form note editor — single textarea, markdown welcome.
 * No structure enforced; the student writes whatever they want.
 */
export function NoteEditorFree({ body, onChange }: NoteEditorFreeProps) {
  const [text, setText] = useState(body.text);

  const handleChange = (val: string) => {
    setText(val);
    onChange({ kind: "free", text: val });
  };

  return (
    <div className={styles.editor}>
      <textarea
        className={styles.textarea}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Write freely — markdown supported…"
        aria-label="Note content"
        rows={20}
      />
      <p className={styles.hint}>Markdown is welcome. No structure required.</p>
    </div>
  );
}
