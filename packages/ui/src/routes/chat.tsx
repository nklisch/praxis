import type { AssignmentId, SessionHandle, SessionId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AddDocumentButton } from "../components/add-document-button.js";
import { AssignmentCard } from "../components/assignment-card.js";
import { ClaudeAuthModal } from "../components/claude-auth-modal.js";
import { Composer } from "../components/composer.js";
import { DocumentList } from "../components/document-list.js";
import { MessageBubble } from "../components/message.js";
import { ModeHeader } from "../components/mode-header.js";
import { PageImagePanel } from "../components/page-image-panel.js";
import { usePraxisClient } from "../context/client-context.js";
import { useAssignment } from "../hooks/use-assignment.js";
import { useDocuments } from "../hooks/use-documents.js";
import { useIngestion } from "../hooks/use-ingestion.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import { isClaudeAuthRequiredError } from "../lib/auth-error.js";
import styles from "./chat.module.css";

/**
 * Inner component for exam lockdown detection. Called only when the session
 * has an assignmentId so the hook always runs (no conditional hook calls).
 */
function ExamLockdownGate({
  assignmentId,
  isExamMode,
  onLockdownChange,
}: {
  assignmentId: AssignmentId;
  isExamMode: boolean;
  onLockdownChange: (locked: boolean) => void;
}) {
  const { assignment } = useAssignment(assignmentId);
  const isSubmitted = !!assignment?.submittedAt;
  const lockdown = isExamMode && !isSubmitted;

  // Notify parent of lockdown state changes
  useEffect(() => {
    onLockdownChange(lockdown);
  }, [lockdown, onLockdownChange]);

  return null;
}

export function ChatRoute() {
  const client = usePraxisClient();
  const navigate = useNavigate();
  const { messages, isStreaming, lastError, send, clearMessages } = useStreamedSend(client);
  const [session, setSession] = useState<SessionHandle | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [starting, setStarting] = useState(false);
  const [examLockdown, setExamLockdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // If the user navigated here with ?sessionId=xxx (e.g., from "New course" or
  // "Start session" buttons), pick up that already-started session instead of
  // auto-starting a fresh teach session.
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Router search params typed loosely at root
  const search = useSearch({ strict: false }) as Record<string, any>;
  const externalSessionId: SessionId | undefined = search?.sessionId
    ? brandId<"SessionId">(String(search.sessionId))
    : undefined;

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

  // Session acquisition — extracted into a useCallback so both the mount
  // effect and the post-auth retry can call the same logic.
  const acquireSession = useCallback(
    async (cancelled: { current: boolean }) => {
      setStarting(true);
      setStartError(null);
      setNeedsAuth(false);
      try {
        if (externalSessionId) {
          // Optimistically treat the external id as the active session handle.
          // client.session.active() returns the most-recent active session;
          // in the single-session v1 model that's the one we just started.
          const active = await client.session.active();
          if (!cancelled.current) {
            if (active && active.sessionId === externalSessionId) {
              setSession(active);
            } else {
              // Fallback: build a minimal handle from what we know so chat is
              // usable even if active() doesn't match yet.
              setSession({
                sessionId: externalSessionId,
                modeId: "bootstrap",
                startedAt: Date.now() as import("@praxis/core/types").Timestamp,
              });
            }
          }
        } else {
          const handle = await client.session.start({ modeId: "teach" });
          if (!cancelled.current) setSession(handle);
        }
      } catch (err) {
        if (!cancelled.current) {
          if (isClaudeAuthRequiredError(err)) {
            setNeedsAuth(true);
            setStartError(null);
          } else {
            setStartError(err instanceof Error ? err.message : String(err));
          }
        }
      } finally {
        if (!cancelled.current) setStarting(false);
      }
    },
    // externalSessionId is derived from search params and stable per navigation.
    [client, externalSessionId],
  );

  // Session acquisition on mount (React 19 double-mount safe).
  useEffect(() => {
    const cancelled = { current: false };

    acquireSession(cancelled);

    return () => {
      cancelled.current = true;
    };
  }, [acquireSession]);

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
    const cancelled = { current: false };
    await acquireSession(cancelled);
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
        <ModeHeader
          session={session}
          starting={starting}
          onNewChat={handleNewChat}
          newChatDisabled={starting || isStreaming}
        />

        {startError && <div className={styles.errorBanner}>Session error: {startError}</div>}

        {needsAuth && (
          <div className={styles.authBanner}>
            <span>Not signed in to Claude.</span>
            <button
              type="button"
              className={styles.authBannerButton}
              onClick={() => setShowAuthModal(true)}
            >
              Sign in
            </button>
            <button
              type="button"
              className={styles.authBannerButtonSecondary}
              onClick={() => navigate({ to: "/settings" })}
            >
              Switch engine
            </button>
          </div>
        )}

        {/* Phase 8: exam lockdown detection — rendered outside of message list to avoid hook-in-map */}
        {session?.assignmentId && (
          <ExamLockdownGate
            assignmentId={session.assignmentId}
            isExamMode={session.modeId === "exam"}
            onLockdownChange={setExamLockdown}
          />
        )}

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
              {...(msg.drafts !== undefined && { drafts: msg.drafts })}
              {...(msg.notes !== undefined && { notes: msg.notes })}
              {...(msg.dueCards !== undefined && { dueCards: msg.dueCards })}
              onViewPage={handleViewPage}
              onRateCard={async (flashcardId, rating) => {
                // biome-ignore lint/suspicious/noExplicitAny: FlashcardId branded cast
                await client.flashcards.review({ flashcardId: flashcardId as any, rating });
              }}
            />
          ))}
          {/* Phase 8: render AssignmentCard inline when session is assignment-bound */}
          {session?.assignmentId && (
            <AssignmentCard assignmentId={session.assignmentId} examLockdown={examLockdown} />
          )}
          <div ref={messagesEndRef} />
        </div>

        {lastError && <div className={styles.errorBanner}>Error: {lastError}</div>}

        <Composer
          onSend={handleSend}
          disabled={!session || isStreaming || starting || examLockdown || needsAuth}
        />
        {examLockdown && (
          <div className={styles.lockdownNotice}>
            The chat is muted during the exam. Submit your answers to continue.
          </div>
        )}
      </div>

      {/* Page image side panel */}
      {pageImageTarget && (
        <PageImagePanel
          documentId={pageImageTarget.documentId}
          page={pageImageTarget.page}
          onClose={() => setPageImageTarget(null)}
        />
      )}

      {showAuthModal && (
        <ClaudeAuthModal
          onClose={() => setShowAuthModal(false)}
          onSignedIn={() => {
            setShowAuthModal(false);
            setNeedsAuth(false);
            const cancelled = { current: false };
            acquireSession(cancelled);
          }}
        />
      )}
    </div>
  );
}
