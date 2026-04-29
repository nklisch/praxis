import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./page-image-panel.module.css";

export interface PageImagePanelProps {
  documentId: string;
  page: number;
  onClose: () => void;
}

/**
 * Side panel showing the rendered page image for a vision-tier citation.
 * Fetches the page image from the main process via IPC (base64 → blob URL).
 */
export function PageImagePanel({ documentId, page, onClose }: PageImagePanelProps) {
  const client = usePraxisClient();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let url: string | null = null;

    setLoading(true);
    setError(null);
    setBlobUrl(null);

    client.documents
      .pageImage({ documentId, page })
      .then((buf) => {
        if (revoked) return;
        if (!buf) {
          setError("Page image not found.");
          return;
        }
        // buf is already a Buffer (decoded in DocumentsClient)
        // buf is a Node Buffer (from IPC decode). Copy bytes into a guaranteed
        // plain ArrayBuffer so Blob constructor accepts it without type errors.
        const ab = new ArrayBuffer(buf.byteLength);
        new Uint8Array(ab).set(buf);
        const blob = new Blob([ab], { type: "image/png" });
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch((err) => {
        if (!revoked) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!revoked) setLoading(false);
      });

    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [client, documentId, page]);

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>Page {page}</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className={styles.body}>
          {loading && <p className={styles.status}>Loading page image…</p>}
          {error && <p className={styles.error}>{error}</p>}
          {blobUrl && <img src={blobUrl} alt={`Page ${page}`} className={styles.image} />}
        </div>
      </div>
    </div>
  );
}
