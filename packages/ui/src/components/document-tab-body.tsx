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
 * Layout: clean reading column (max-width 64ch, editorial typography) per the
 * locked mode-document.html mock. The three-column shell (TOC · doc · right
 * panel) is composed at the side-panels layer (-side-panels-restyle story).
 *
 * Citation highlights: after the document text renders, citations are fetched
 * via `client.citations.listByDocument` and applied to the rendered text as
 * `<mark>` elements with a `†` marker. Stale (out-of-bounds) offsets are
 * silently skipped with a dev-log warning.
 *
 * Selection action bar: when the student selects text inside the document
 * content pane, a floating `<SelectionActionBar>` appears with four capture
 * actions (note · ask Praxis · cite · flashcard). Listens to
 * `selectionchange` on the document, debounced ~100ms.
 */

import type {
  DocumentCitationRecord,
  DocumentId,
  DocumentTabSummary,
  SessionId,
} from "@praxis/core/types";
import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "../hooks/use-resource.js";
import styles from "./document-tab-body.module.css";
import { pickRenderer } from "./document-viewer/format-router.js";
import { ErrorMessage } from "./error-message.js";
import { LoadingState } from "./loading-state.js";
import { SelectionActionBar } from "./selection-action-bar.js";

export interface DocumentTabBodyProps {
  tab: DocumentTabSummary;
  /**
   * Optional: the session currently open alongside this document view.
   * When provided, `+ cite` records the citation against this session.
   * When absent, `citingSessionId` is omitted from the citation record.
   */
  currentSessionId?: SessionId;
  /**
   * Optional: called after a `↗ ask Praxis` spawn completes, with the new
   * session handle. The caller is responsible for opening the tab and
   * navigating — this mirrors the session-tab-open-flow pattern where the
   * shell's `useTabs()` owns the in-memory state.
   *
   * When absent, `spawnFromPassage` is still called; the session is created
   * but no tab is opened automatically (the IPC channel works, the UI does
   * not navigate). Callers that own the tab strip should pass this.
   */
  onSpawnedSession?: (sessionId: SessionId) => Promise<void>;
}

/**
 * Walk all text nodes in `root` and collect cumulative character offsets.
 * Returns an array of `{ node, startOffset, endOffset }` entries sorted by
 * document order. Used to map `(startOffset, endOffset)` from the citation
 * record (which counts characters in the full document text) to DOM ranges.
 */
function buildTextNodeIndex(root: Element): Array<{ node: Text; start: number; end: number }> {
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
    mark.dataset.sessionId = citingSessionId;
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
 * Compute the linear character offset of the start of `range` relative to
 * `root`, walking all text nodes in document order.
 *
 * Returns -1 if the range start node is not a descendant of `root`.
 */
function computeRangeOffset(root: Element, rangeNode: Node, rangeOffset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let node: Node | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard TreeWalker pattern
  while ((node = walker.nextNode()) !== null) {
    if (node === rangeNode) {
      return cursor + rangeOffset;
    }
    cursor += (node as Text).length;
  }
  return -1;
}

/**
 * Top-level document viewer. Loads `DocumentDetail` on mount and delegates
 * rendering to the per-format renderer selected by `pickRenderer(doc.mimeType)`.
 *
 * The reading column wraps the renderer output in `.readingColumn` so prose
 * inside every renderer inherits 64ch, serif typography, and loose leading per
 * the locked mode-document.html mock.
 */
export function DocumentTabBody({
  tab,
  currentSessionId,
  onSpawnedSession,
}: DocumentTabBodyProps): JSX.Element {
  const client = usePraxisClient();
  const bodyRef = useRef<HTMLElement>(null);

  // ── Selection action bar state ───────────────────────────────────────────
  const [selectionBar, setSelectionBar] = useState<{
    visible: boolean;
    rect: DOMRect | null;
    text: string;
    startOffset: number;
    endOffset: number;
  }>({ visible: false, rect: null, text: "", startOffset: 0, endOffset: 0 });

  const dismissBar = useCallback(() => {
    setSelectionBar((prev) => ({ ...prev, visible: false }));
  }, []);

  // Subscribe to selectionchange on the document; show the bar when the
  // selection is non-empty and inside the document content pane.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleSelectionChange = () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const sel = window.getSelection();
        const bodyEl = bodyRef.current;

        if (!sel || sel.rangeCount === 0 || !bodyEl) {
          setSelectionBar((prev) => ({ ...prev, visible: false }));
          return;
        }

        const range = sel.getRangeAt(0);
        const selectedText = sel.toString().trim();

        if (!selectedText) {
          setSelectionBar((prev) => ({ ...prev, visible: false }));
          return;
        }

        // Only show if the selection is inside the document body.
        if (!bodyEl.contains(range.commonAncestorContainer)) {
          setSelectionBar((prev) => ({ ...prev, visible: false }));
          return;
        }

        const rect = range.getBoundingClientRect();
        const startOffset = computeRangeOffset(bodyEl, range.startContainer, range.startOffset);
        const endOffset = computeRangeOffset(bodyEl, range.endContainer, range.endOffset);

        if (startOffset < 0 || endOffset < 0 || startOffset >= endOffset) {
          setSelectionBar((prev) => ({ ...prev, visible: false }));
          return;
        }

        setSelectionBar({
          visible: true,
          rect,
          text: selectedText,
          startOffset,
          endOffset,
        });
      }, 100);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (debounceTimer !== null) clearTimeout(debounceTimer);
    };
  }, []);

  // ── Action handlers ──────────────────────────────────────────────────────

  const handleNote = useCallback(async () => {
    await client.notes.create({
      format: "free",
      body: { kind: "free", text: selectionBar.text },
    });
  }, [client, selectionBar.text]);

  const handleAskPraxis = useCallback(async () => {
    const handle = await client.session.spawnFromPassage({
      documentId: tab.documentId as DocumentId,
      range: { startOffset: selectionBar.startOffset, endOffset: selectionBar.endOffset },
    });
    if (onSpawnedSession) {
      await onSpawnedSession(handle.sessionId);
    }
  }, [client, tab.documentId, selectionBar.startOffset, selectionBar.endOffset, onSpawnedSession]);

  const handleCite = useCallback(async () => {
    await client.citations.record({
      documentId: tab.documentId as DocumentId,
      // v1: citingSessionId is required by the API; if no session is active
      // we use an empty-string sentinel. A future iteration can gate this
      // button on an active session being present.
      citingSessionId: (currentSessionId ?? "") as SessionId,
      startOffset: selectionBar.startOffset,
      endOffset: selectionBar.endOffset,
      citedText: selectionBar.text,
    });
  }, [client, tab.documentId, currentSessionId, selectionBar]);

  const handleFlashcard = useCallback(async () => {
    const front = window.prompt("Flashcard front (question or cue):", "");
    if (front === null || front.trim() === "") return; // user cancelled
    await client.flashcards.create({
      front: front.trim(),
      back: selectionBar.text,
      source: { kind: "user-created" },
    });
  }, [client, selectionBar.text]);

  const loader = useCallback(() => client.documents.get(tab.documentId), [client, tab.documentId]);
  const citationsLoader = useCallback(
    () => client.citations.listByDocument(tab.documentId as DocumentId),
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
      applyCitationMark(bodyEl, index, citation, (sessionId) => {
        // Delegate to the caller's session-open handler when available.
        if (onSpawnedSession) {
          void onSpawnedSession(sessionId as SessionId);
        }
      });
    }
  }, [data, citations, onSpawnedSession]);

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
  const displayTitle = data.title ?? data.filename;

  return (
    <>
      <div className={styles.container}>
        {/* Document head — kicker + display title + meta */}
        <header className={styles.docHead}>
          <div className={styles.kicker}>
            <span className={styles.kickerGlyph}>†</span>
            <span>{data.mimeType}</span>
          </div>
          <h1 className={styles.title}>
            <span className={styles.titleStrong}>{displayTitle}</span>
          </h1>
          {data.title && data.title !== data.filename && (
            <div className={styles.docMeta}>{data.filename}</div>
          )}
        </header>

        {/* Scrolling reading surface — renderer output constrained to 64ch column */}
        <main className={styles.body} ref={bodyRef} aria-label="Document content">
          <div className={styles.readingColumn}>
            <Renderer doc={data} />
          </div>
        </main>
      </div>

      {/* Selection action bar — floats above selected text via a portal */}
      <SelectionActionBar
        visible={selectionBar.visible}
        rect={selectionBar.rect}
        onDismiss={dismissBar}
        onNote={handleNote}
        onAskPraxis={handleAskPraxis}
        onCite={handleCite}
        onFlashcard={handleFlashcard}
      />
    </>
  );
}
