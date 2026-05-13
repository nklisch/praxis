/**
 * DocumentTabBody — the viewer shell for `kind: "document"` tabs.
 *
 * Fetches full document detail (including pageCount and text) via
 * `client.documents.get(documentId)`, then dispatches to the appropriate
 * per-format renderer through `pickRenderer`. Loading and error states
 * use the standard editorial primitives.
 *
 * Per the tab-body-isolation pattern, this component is always mounted for
 * open document tabs; display:none hides inactive ones at the parent level
 * (see chat.tsx). This component does not manage its own visibility.
 */

import type { DocumentTabSummary } from "@praxis/core/types";
import type { JSX } from "react";
import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "../hooks/use-resource.js";
import styles from "./document-tab-body.module.css";
import { pickRenderer } from "./document-viewer/format-router.js";
import { ErrorMessage } from "./error-message.js";
import { LoadingState } from "./loading-state.js";

export interface DocumentTabBodyProps {
  tab: DocumentTabSummary;
}

/**
 * Top-level document viewer. Loads `DocumentDetail` on mount and delegates
 * rendering to the per-format renderer selected by `pickRenderer(doc.mimeType)`.
 */
export function DocumentTabBody({ tab }: DocumentTabBodyProps): JSX.Element {
  const client = usePraxisClient();

  const loader = useCallback(() => client.documents.get(tab.documentId), [client, tab.documentId]);

  const { data, loading, error } = useResource(loader);

  if (loading) {
    return (
      <div className={styles.statusWrapper}>
        <LoadingState message="Loading document…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.statusWrapper}>
        <ErrorMessage error={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.statusWrapper}>
        <ErrorMessage error="Document not found." />
      </div>
    );
  }

  const Renderer = pickRenderer(data.mimeType);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{data.title ?? data.filename}</h1>
        {data.title && data.title !== data.filename && (
          <span className={styles.subtitle}>{data.filename}</span>
        )}
      </header>
      <main className={styles.body}>
        <Renderer doc={data} />
      </main>
    </div>
  );
}
