import styles from "./message.module.css";

export type MessageRole = "user" | "assistant";

export interface MessageBubbleProps {
  role: MessageRole;
  content: string;
  streaming?: boolean | undefined;
}

export function MessageBubble({ role, content, streaming = false }: MessageBubbleProps) {
  return (
    <div className={`${styles.bubble} ${styles[role] ?? ""} ${streaming ? styles.streaming : ""}`}>
      <span className={styles.label}>{role === "user" ? "You" : "Tutor"}</span>
      <p className={styles.content}>{content}</p>
    </div>
  );
}
