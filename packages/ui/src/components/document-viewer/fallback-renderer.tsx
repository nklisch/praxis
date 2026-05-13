/**
 * FallbackRenderer — graceful "preview not available" message for formats
 * that the viewer does not support natively.
 *
 * Shown for binary files (images, audio, archives, etc.) whose MIME type
 * does not match any of the specialised renderers.
 */
import type { JSX } from "react";
import styles from "./fallback-renderer.module.css";
import type { RendererProps } from "./format-router.js";

export function FallbackRenderer({ doc }: RendererProps): JSX.Element {
  return (
    <div className={styles.container}>
      <p className={styles.message}>Preview not available for this file type.</p>
      <p className={styles.detail}>
        <span className={styles.filename}>{doc.filename}</span>
        {" · "}
        <span className={styles.mimeType}>{doc.mimeType}</span>
      </p>
      <p className={styles.hint}>
        The document was ingested and its text is searchable, but a visual preview is not supported
        for this format.
      </p>
    </div>
  );
}
