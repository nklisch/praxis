import type { JSX } from "react";
import styles from "./error-message.module.css";

export interface ErrorMessageProps {
  /** Error string, or an Error from a catch block. */
  error: string | Error;
}

/** Editorial error rendering — framed without panic. */
export function ErrorMessage({ error }: ErrorMessageProps): JSX.Element {
  const message = error instanceof Error ? error.message : error;
  return (
    <p role="alert" className={styles.error}>
      {message}
    </p>
  );
}
