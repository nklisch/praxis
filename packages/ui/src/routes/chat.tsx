import type { SessionHandle } from "@praxis/core/types";
import { useEffect, useRef, useState } from "react";
import { AddDocumentButton } from "../components/add-document-button.js";
import { Composer } from "../components/composer.js";
import { DocumentList } from "../components/document-list.js";
import { MessageBubble } from "../components/message.js";
import { PageImagePanel } from "../components/page-image-panel.js";
import { usePraxisClient } from "../context/client-context.js";
import { useDocuments } from "../hooks/use-documents.js";
import { useIngestion } from "../hooks/use-ingestion.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import styles from "./chat.module.css";

export function ChatRoute() {
  const client = usePraxisClient();
  const { messages, isStreaming, lastError, send, clearMessages } = useStreamedSend(client);
  const [session, setSession] = useState<SessionHandle | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Page-image side panel state
  const [pageImageTarget, setPageImageTarget] = useState<{
    documentId: string;
    page: number;
  } | null>(null);

  // Documents sidebar
  const {
    documents,
    loading: docsLoading,
    error: docsError,
    refresh: refreshDocs,
    deleteDocument,
  } = useDocuments();

  // Ingestion flow — refresh documents list when ingestion completes
  const ingestion = useIngestion(refreshDocs);

  // Auto-start a session on mount (React 19 double-mount safe).
  useEffect(() => {
    let cancelled = false;

    async function startSession() {
      setStarting(true);
      setStartError(null);
      try {
        const handle = await client.session.start({ modeId: "teach" });
        if (!cancelled) setSession(handle);
      } catch (err) {
        if (!cancelled) {
          setStartError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    }

    startSession();

    return () => {
      cancelled = true;
    };
  }, [client]);

  // Scroll to bottom when the message count changes.
  const messageCount = messages.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on count change; ref is stable
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  const handleSend = async (message: string) => {
    if (!session) return;
    await send(session.sessionId, message);
  };

  const handleNewChat = async () => {
    if (session) {
      await client.session.end(session.sessionId).catch(() => {});
    }
    clearMessages();
    setSession(null);
    setStartError(null);
    setStarting(true);
    try {
      const handle = await client.session.start({ modeId: "teach" });
      setSession(handle);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const handleViewPage = (documentId: string, page: number) => {
    setPageImageTarget({ documentId, page });
  };

  return (
    <div className={styles.layout}>
      {/* Documents sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Documents</span>
        </div>
        <div className={styles.sidebarContent}>
          <AddDocumentButton ingestion={ingestion} />
          <DocumentList
            documents={documents}
            loading={docsLoading}
            error={docsError}
            onDelete={deleteDocument}
          />
        </div>
      </aside>

      {/* Main chat area */}
      <div className={styles.container}>
        <div className={styles.toolbar}>
          <span className={styles.status}>
            {starting ? "Starting session…" : session ? "Session active" : "No session"}
          </span>
          <button
            type="button"
            className={styles.newChatButton}
            onClick={handleNewChat}
            disabled={starting || isStreaming}
          >
            New chat
          </button>
        </div>

        {startError && <div className={styles.errorBanner}>Session error: {startError}</div>}

        <div className={styles.messages}>
          {messages.length === 0 && !starting && !startError && (
            <p className={styles.emptyState}>Start a conversation with your tutor.</p>
          )}
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              {...(msg.streaming !== undefined && { streaming: msg.streaming })}
              {...(msg.citations !== undefined && { citations: msg.citations })}
              onViewPage={handleViewPage}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {lastError && <div className={styles.errorBanner}>Error: {lastError}</div>}

        <Composer onSend={handleSend} disabled={!session || isStreaming || starting} />
      </div>

      {/* Page image side panel */}
      {pageImageTarget && (
        <PageImagePanel
          documentId={pageImageTarget.documentId}
          page={pageImageTarget.page}
          onClose={() => setPageImageTarget(null)}
        />
      )}
    </div>
  );
}
