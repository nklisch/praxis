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
 *
 * Citation highlights: after the document text renders, citations are fetched
 * via `client.citations.listByDocument` and applied to the rendered text as
 * `<mark>` elements with a `†` marker. Stale (out-of-bounds) offsets are
 * silently skipped with a dev-log warning.
 */

import type { DocumentCitationRecord, DocumentTabSummary } from "@praxis/core/types";
import type { JSX } from "react";
import { useCallback, useEffect, useRef } from "react";
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
 * Walk all text nodes in `root` and collect cumulative character offsets.
 * Returns an array of `{ node, startOffset, endOffset }` entries sorted by
 * document order. Used to map `(startOffset, endOffset)` from the citation
 * record (which counts characters in the full document text) to DOM ranges.
 */
function buildTextNodeIndex(
  root: Element,
): Array<{ node: Text; start: number; end: number }> {
  const result: Array<{ node: Text; start: number; end: number }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let node: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((node = walker.nextNode()) !== null) {
    const text = node as Text;
    const len = text.length;
    result.push({ node: text, start: cursor, end: cursor + len });
    cursor += len;
  }
  return result;
}

/**
 * Apply a single citation range to the DOM by finding the matching text nodes
 * and wrapping the range in a `<mark>` element.
 *
 * Returns true when the mark was applied; false when the range is out-of-bounds
 * or the DOM range could not be constructed (stale citation tolerance).
 */
function applyCitationMark(
  root: Element,
  index: ReturnType<typeof buildTextNodeIndex>,
  citation: DocumentCitationRecord,
  onClickSessionId: (sessionId: string) => void,
): boolean {
  const { startOffset, endOffset, citingSessionId } = citation;
  const lastEntry = index[index.length - 1];
  const docLength = lastEntry !== undefined ? lastEntry.end : 0;

  if (startOffset >= docLength || endOffset > docLength || startOffset >= endOffset) {
    // Stale citation — offsets out of bounds; skip silently per v1 spec.
    return false;
  }

  // Find the start text node.
  const startEntry = index.find((e) => e.start <= startOffset && e.end > startOffset);
  // Find the end text node.
  const endEntry = index.find((e) => e.start < endOffset && e.end >= endOffset);

  if (!startEntry || !endEntry) return false;

  try {
    const range = document.createRange();
    range.setStart(startEntry.node, startOffset - startEntry.start);
    range.setEnd(endEntry.node, endOffset - endEntry.start);

    const mark = document.createElement("mark");
    // biome-ignore lint/style/noNonNullAssertion: CSS module key always exists
    mark.className = styles.citationMark!;
    mark.title = "Cited in session — click to open";
    mark.dataset["sessionId"] = citingSessionId;
    mark.addEventListener("click", (e) => {
      e.preventDefault();
      onClickSessionId(citingSessionId);
    });

    // Prepend a superscript dagger marker.
    const dagger = document.createElement("span");
    // biome-ignore lint/style/noNonNullAssertion: CSS module key always exists
    dagger.className = styles.citationDagger!;
    dagger.textContent = "†";
    mark.prepend(dagger);

    range.surroundContents(mark);
    return true;
  } catch {
    // surroundContents throws if the range crosses element boundaries.
    // This is a known limitation for v1 (text offsets within a single block).
    return false;
  }
}

/**
 * Top-level document viewer. Loads `DocumentDetail` on mount and delegates
 * rendering to the per-format renderer selected by `pickRenderer(doc.mimeType)`.
 */
export function DocumentTabBody({ tab }: DocumentTabBodyProps): JSX.Element {
  const client = usePraxisClient();
  const bodyRef = useRef<HTMLElement>(null);

  const loader = useCallback(() => client.documents.get(tab.documentId), [client, tab.documentId]);
  const citationsLoader = useCallback(
    () => client.citations.listByDocument(tab.documentId as import("@praxis/core/types").DocumentId),
    [client, tab.documentId],
  );

  const { data, loading, error } = useResource(loader);
  const { data: citations } = useResource(citationsLoader);

  // Apply citation highlights after the document text renders.
  // We use a layout effect so the DOM has settled before we walk it.
  useEffect(() => {
    if (!data || !citations || citations.length === 0) return;
    // PDF documents render as page images — no text node walking applies.
    if (data.mimeType === "application/pdf") return;
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;

    // Remove any previously applied marks to avoid duplicates on re-render.
    // biome-ignore lint/style/noNonNullAssertion: CSS module key always exists
    const citationMarkClass = styles.citationMark!;
    // biome-ignore lint/style/noNonNullAssertion: CSS module key always exists
    const citationDaggerClass = styles.citationDagger!;
    for (const mark of Array.from(bodyEl.querySelectorAll<HTMLElement>(`.${citationMarkClass}`))) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) {
        // Skip the dagger span — remove it entirely (it was injected, not original content).
        if (
          mark.firstChild instanceof HTMLElement &&
          mark.firstChild.classList.contains(citationDaggerClass)
        ) {
          mark.removeChild(mark.firstChild);
        } else {
          parent.insertBefore(mark.firstChild, mark);
        }
      }
      parent.removeChild(mark);
    }

    const index = buildTextNodeIndex(bodyEl);

    for (const citation of citations) {
      applyCitationMark(bodyEl, index, citation, (_sessionId) => {
        // Opening a session tab is handled by the session-tab-open-flow pattern.
        // The selection-bar story (-selection-bar) wires this fully.
        // No-op for v1 — the dagger marker is rendered; tap/click UX is in Story 2.
      });
    }
  }, [data, citations]);

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
      <main className={styles.body} ref={bodyRef}>
        <Renderer doc={data} />
      </main>
    </div>
  );
}
