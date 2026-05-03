import type { AssignmentId, SessionHandle, SketchId, TabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { useNavigate } from "@tanstack/react-router";
import { type JSX, useEffect, useRef, useState } from "react";
import { useAuthStatus } from "../context/auth-context.js";
import { usePraxisClient } from "../context/client-context.js";
import { useAssignment } from "../hooks/use-assignment.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import { isClaudeAuthRequiredError } from "../lib/auth-error.js";
import { AssignmentCard } from "./assignment-card.js";
import { AuthGate } from "./auth-gate.js";
import styles from "./chat-tab-body.module.css";
import { Composer } from "./composer.js";
import { ComposerVerbs } from "./composer-verbs.js";
import { MessageBubble } from "./message.js";
import { ModeHeader } from "./mode-header.js";
import { PageImagePanel } from "./page-image-panel.js";

export interface ChatTabBodyProps {
  tab: TabSummary;
}

/**
 * Inner component for exam lockdown detection.
 * Pulled out so the hook always runs (no conditional hook calls).
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

  useEffect(() => {
    onLockdownChange(lockdown);
  }, [lockdown, onLockdownChange]);

  return null;
}

/**
 * Per-tab session body. Holds the message log, composer, auth banner, and
 * mode header for a single open tab. Each instance has its own useStreamedSend
 * so message logs are isolated across tabs.
 *
 * The session already exists when this component mounts — it was created by
 * NewTabPicker (or openSessionInTab). This component's job is to drive the
 * existing session via client.session.send.
 */
export function ChatTabBody({ tab }: ChatTabBodyProps): JSX.Element {
  const client = usePraxisClient();
  const navigate = useNavigate();
  const { messages, isStreaming, lastError, send } = useStreamedSend(client);
  const { flagAuthRequired } = useAuthStatus();

  // Build a minimal SessionHandle from the tab's metadata.
  // The session already exists; we don't call session.start here.
  const session: SessionHandle = {
    sessionId: tab.sessionId,
    modeId: tab.modeId,
    startedAt: tab.openedAt as unknown as Timestamp,
    ...(tab.courseId !== undefined && {
      courseId: brandId<"CourseId">(tab.courseId),
    }),
  };

  const [examLockdown, setExamLockdown] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  // Phase 15a: captured sketch attached to the next outgoing message.
  const [pendingSketchId, setPendingSketchId] = useState<SketchId | undefined>(undefined);
  const [pageImageTarget, setPageImageTarget] = useState<{
    documentId: string;
    page: number;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when the message count changes.
  const messageCount = messages.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on count change; ref is stable
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  // Surface auth errors from send attempts
  useEffect(() => {
    if (lastError && isClaudeAuthRequiredError(new Error(lastError))) {
      flagAuthRequired();
    }
  }, [lastError, flagAuthRequired]);

  const handleSend = async (message: string) => {
    try {
      await send(session.sessionId, message);
    } catch (err) {
      if (isClaudeAuthRequiredError(err)) {
        flagAuthRequired();
      }
    }
  };

  /**
   * Phase 15a: wraps handleSend to append the [sketch:<id>] marker when a
   * sketch is attached. The agent's prompt fragment (sketch-awareness) instructs
   * the model to call sketch.read when it sees this marker.
   */
  const handleSendWithSketch = async (message: string, sketchId?: SketchId) => {
    const fullMessage =
      sketchId !== undefined ? `${message}\n\n[sketch:${sketchId}]` : message;
    setPendingSketchId(undefined);
    await handleSend(fullMessage);
  };

  const handleViewPage = (documentId: string, page: number) => {
    setPageImageTarget({ documentId, page });
  };

  return (
    <div className={styles.container}>
      <ModeHeader
        session={session}
        starting={false}
        onNewChat={() => {
          // "New chat" in tab context: navigate back to bare /chat so user can
          // open a fresh tab via the picker. We don't auto-create a session.
          navigate({ to: "/chat" });
        }}
        newChatDisabled={isStreaming}
      />

      {session.assignmentId && (
        <ExamLockdownGate
          assignmentId={session.assignmentId}
          isExamMode={session.modeId === "exam"}
          onLockdownChange={setExamLockdown}
        />
      )}

      <div className={styles.messages}>
        {messages.length === 0 && (
          <p className={styles.emptyState}>Start a conversation with your tutor.</p>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            rawContent={msg.rawContent}
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
        {session.assignmentId && (
          <AssignmentCard assignmentId={session.assignmentId} examLockdown={examLockdown} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {lastError && !isClaudeAuthRequiredError(new Error(lastError)) && (
        <div className={styles.errorBanner}>Error: {lastError}</div>
      )}

      <AuthGate>
        <ComposerVerbs
          modeId={session.modeId}
          onPrefill={(seed) => {
            setComposerValue((prev) => (prev ? `${prev} ${seed}` : seed));
            composerTextareaRef.current?.focus();
          }}
        />
        <Composer
          ref={composerTextareaRef}
          value={composerValue}
          onChange={setComposerValue}
          onSend={async (msg, sketchId) => {
            setComposerValue("");
            await handleSendWithSketch(msg, sketchId);
          }}
          disabled={isStreaming || examLockdown}
          sketchEnabled={true}
        />
      </AuthGate>
      {examLockdown && (
        <div className={styles.lockdownNotice}>
          The chat is muted during the exam. Submit your answers to continue.
        </div>
      )}

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
