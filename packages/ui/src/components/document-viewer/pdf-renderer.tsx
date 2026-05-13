/**
 * PdfRenderer — renders a PDF document as a stack of rasterised page images.
 *
 * Page images are fetched one-by-one from the main process via
 * `client.documents.pageImage({ documentId, page })`. Each page is displayed
 * as a `<img>` backed by a revocable blob URL. Off-screen pages are loaded
 * lazily via IntersectionObserver — only pages within (or near) the viewport
 * fetch their image data.
 *
 * Blob URLs are revoked on component unmount to avoid memory leaks.
 */

import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../../context/client-context.js";
import type { RendererProps } from "./format-router.js";
import styles from "./pdf-renderer.module.css";

// ─── Single page component ────────────────────────────────────────────────────

interface PdfPageProps {
  documentId: string;
  page: number;
  totalPages: number;
}

function PdfPage({ documentId, page, totalPages }: PdfPageProps): JSX.Element {
  const client = usePraxisClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const fetchedRef = useRef(false);

  // Observe visibility — load only when page scrolls into (or near) view.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }, // pre-load one viewport ahead
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch image once the page becomes visible.
  useEffect(() => {
    if (!visible || fetchedRef.current) return;
    fetchedRef.current = true;

    let revoked = false;
    let url: string | null = null;

    setLoading(true);
    setError(null);

    client.documents
      .pageImage({ documentId, page })
      .then((buf) => {
        if (revoked) return;
        if (!buf) {
          setError("Page image not available.");
          return;
        }
        // Copy into a plain ArrayBuffer so Blob accepts it without type issues.
        const ab = new ArrayBuffer(buf.byteLength);
        new Uint8Array(ab).set(buf);
        const blob = new Blob([ab], { type: "image/png" });
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch((err: unknown) => {
        if (!revoked) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!revoked) setLoading(false);
      });

    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [client, documentId, page, visible]);

  return (
    <div ref={containerRef} className={styles.page}>
      <span className={styles.pageLabel}>
        {page} / {totalPages}
      </span>
      {loading && <p className={styles.status}>Loading…</p>}
      {error && <p className={styles.pageError}>{error}</p>}
      {blobUrl && (
        <img src={blobUrl} alt={`Page ${page} of ${totalPages}`} className={styles.pageImage} />
      )}
    </div>
  );
}

// ─── Top-level renderer ───────────────────────────────────────────────────────

export function PdfRenderer({ doc }: RendererProps): JSX.Element {
  const pageCount = doc.pageCount ?? 0;

  if (pageCount === 0) {
    return (
      <div className={styles.noPages}>
        <p>No page images available for this document.</p>
        <p className={styles.hint}>Re-ingest the file to generate page images.</p>
      </div>
    );
  }

  // Build an array of page numbers [1 .. pageCount].
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className={styles.container}>
      {pages.map((page) => (
        <PdfPage key={page} documentId={doc.documentId} page={page} totalPages={pageCount} />
      ))}
    </div>
  );
}
