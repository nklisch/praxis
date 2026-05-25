import type {
  AssignmentId,
  SessionHandle,
  SessionId,
  SessionTabSummary,
  SketchId,
  TabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId, resolveRenderToggles } from "@praxis/core/types";
import { getMode } from "@praxis/curriculum/modes";
import { getToolLabel } from "@praxis/tools/labels";
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStatus } from "../context/auth-context.js";
import { usePraxisClient } from "../context/client-context.js";
import { useParentChildOptional } from "../context/parent-child-context.js";
import { useAssignment } from "../hooks/use-assignment.js";
import { useFailedEscalation } from "../hooks/use-failed-escalation.js";
import { useQuickCheckBridge } from "../hooks/use-quick-check-bridge.js";
import type { PendingMessageItem } from "../hooks/use-streamed-send.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import { isClaudeAuthRequiredError } from "../lib/auth-error.js";
import { AssignmentCard } from "./assignment-card.js";
import { AuthGate } from "./auth-gate.js";
import styles from "./chat-tab-body.module.css";
import { Composer } from "./composer.js";
import { ComposerStatus } from "./composer-status.js";
import { ComposerVerbs } from "./composer-verbs.js";
import { CourseCreateTabBody } from "./course-create-tab-body.js";
import { DocumentTabBody } from "./document-tab-body.js";
import { EmptyState } from "./empty-state.js";
import { ExamTabBody } from "./exam-tab-body.js";
import { HomeworkTabBody } from "./homework-tab-body.js";
import { MessageBubble } from "./message.js";
import type { InlineNoteFormat } from "./note-format-picker-popover.js";
import { PageImagePanel } from "./page-image-panel.js";
import { QueuedMessageBubble } from "./queued-message-bubble.js";
import { QuickCheckCard } from "./quick-check-card.js";
import { QuizTabBody } from "./quiz-tab-body.js";
import { ReasoningBlock } from "./reasoning-block.js";
import { ResumedBanner } from "./resumed-banner.js";
import { SessionHead } from "./session-head.js";
import { StructuredQuestionCard } from "./structured-question-card.js";
import { StudySkillsTabBody } from "./study-skills-tab-body.js";
import { SubAgentBlock } from "./sub-agent-block.js";
import { SystemNoteCard } from "./system-note-card.js";
import { ThinkingIndicator } from "./thinking-indicator.js";
import { ToolCallDisclosure } from "./tool-call-disclosure.js";

export interface ChatTabBodyProps {
  tab: TabSummary;
  /**
   * Passed to TeachChatTabBody → ComposerVerbs. Fires with the chosen format
   * when the student picks from the inline note-picker popover.
   */
  onNoteOpen?: (format: InlineNoteFormat) => void;
  /** Whether a note already exists for this session. */
  hasSessionNote?: boolean;
}

/**
 * Props for session-mode-specific tab bodies (teach, quiz, homework, exam,
 * course-create, study-skills). These bodies require a session-bound tab and
 * access `tab.sessionId`, `tab.modeId`, etc. directly.
 */
export interface SessionChatTabBodyProps {
  tab: SessionTabSummary;
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

export interface TeachChatTabBodyProps extends SessionChatTabBodyProps {
  /**
   * When provided, renders a "+ note" button in the verb rail.
   * Fires with the chosen format when the student picks one from the popover.
   */
  onNoteOpen?: (format: InlineNoteFormat) => void;
  /**
   * Whether a note already exists for this session (adds a dot indicator to
   * the "+ note" button).
   */
  hasSessionNote?: boolean;
}

/**
 * Teach-mode (and default) tab body. Holds the message log, composer, auth
 * banner, and mode header for a single open tab. Each instance has its own
 * useStreamedSend so message logs are isolated across tabs.
 *
 * The session already exists when this component mounts — it was created by
 * NewTabPicker (or openSessionInTab). This component's job is to drive the
 * existing session via client.session.send.
 *
 * Exported so CourseCreateTabBody can embed it in the left pane.
 */
export function TeachChatTabBody({
  tab,
  onNoteOpen,
  hasSessionNote,
}: TeachChatTabBodyProps): JSX.Element {
  const client = usePraxisClient();
  const parentChild = useParentChildOptional();

  // Trigger a tab-strip pulse whenever a system_note arrives in this session.
  const onSystemNote = useCallback(
    (sessionId: SessionId) => {
      parentChild?.triggerPulse(sessionId);
    },
    [parentChild],
  );

  const {
    items,
    isStreaming,
    thinking,
    lastError,
    send,
    cancel,
    cancelPending,
    editPending,
    retryFailed,
    removeFailed,
    pendingCount,
    failedCount,
    loadHistory,
  } = useStreamedSend(client, { onSystemNote });

  const failedItems = useMemo(
    () =>
      items.filter(
        (i): i is PendingMessageItem => i.kind === "pending-message" && i.status === "failed",
      ),
    [items],
  );
  useFailedEscalation({ failedItems, activity: null });
  const { flagAuthRequired } = useAuthStatus();

  // Resolve content-type render toggles from the session's mode. `getMode`
  // returns undefined for unknown mode ids; we fall back to an empty object
  // which resolveRenderToggles coerces to DEFAULT_RENDER_TOGGLES.
  const renderToggles = useMemo(
    () => resolveRenderToggles(getMode(tab.modeId) ?? {}),
    [tab.modeId],
  );

  // Load the persisted transcript on first mount (or when this tab body is
  // reused for a different session — keyed on tab.sessionId). Without this,
  // re-opening a tab or relaunching the app shows an empty chat even though
  // the episodic log is on disk.
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per session id
  useEffect(() => {
    void loadHistory(tab.sessionId);
  }, [tab.sessionId]);

  // Build a minimal SessionHandle from the tab's metadata.
  // The session already exists; we don't call session.start here.
  const session: SessionHandle = {
    sessionId: tab.sessionId,
    modeId: tab.modeId,
    startedAt: tab.openedAt as unknown as Timestamp,
    ...(tab.courseId !== undefined && {
      courseId: brandId<"CourseId">(tab.courseId),
    }),
    ...(tab.assignmentId !== undefined && {
      assignmentId: brandId<"AssignmentId">(tab.assignmentId),
    }),
  };

  // Phase 17: subscribe to quick-check events for this session. The bridge
  // returns a parallel list interleaved after the message log at render time.
  // Only wired into TeachChatTabBody — quiz/homework/exam don't have a
  // narrating tutor that issues inline quick checks.
  const { pending: quickChecks, resolve: resolveQuickCheck } = useQuickCheckBridge(
    session.sessionId,
  );

  const [examLockdown, setExamLockdown] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [pageImageTarget, setPageImageTarget] = useState<{
    documentId: string;
    page: number;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Scroll restoration ────────────────────────────────────────────────────
  // Persist last scroll position per session id so re-opening a tab restores
  // the student's reading position. Key: praxis.session.<id>.scroll
  const scrollStorageKey = `praxis.session.${tab.sessionId}.scroll`;
  const scrollRestoredRef = useRef(false);

  // Restore scroll once after history loads (items go from 0 → n on first load).
  // biome-ignore lint/correctness/useExhaustiveDependencies: restore once; refs and storageKey stable
  useEffect(() => {
    if (scrollRestoredRef.current) return;
    if (items.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    scrollRestoredRef.current = true;
    const stored = localStorage.getItem(scrollStorageKey);
    if (stored !== null) {
      const savedTop = Number(stored);
      if (Number.isFinite(savedTop) && savedTop > 0) {
        // Use requestAnimationFrame to let the layout settle before restoring.
        requestAnimationFrame(() => {
          container.scrollTop = savedTop;
        });
      }
    }
  }, [items.length]);

  // Persist scroll position on scroll (debounced to ~300ms).
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleScroll = useCallback(() => {
    if (scrollSaveTimerRef.current !== null) {
      clearTimeout(scrollSaveTimerRef.current);
    }
    scrollSaveTimerRef.current = setTimeout(() => {
      const container = messagesContainerRef.current;
      if (container) {
        localStorage.setItem(scrollStorageKey, String(container.scrollTop));
      }
    }, 300);
  }, [scrollStorageKey]);

  // ── Resumed banner ────────────────────────────────────────────────────────
  // Show a brief "Resumed" banner when history loads with existing items.
  // A session is "resumed" when the initial history load returns >0 items
  // (as opposed to a brand-new session that starts empty).
  // We track this with a ref so the banner renders exactly once per mount.
  const resumedDetectedRef = useRef(false);
  const [showResumedBanner, setShowResumedBanner] = useState(false);

  useEffect(() => {
    if (resumedDetectedRef.current) return;
    if (items.length === 0) return;
    // Only show banner if this isn't a live-streaming first message
    // (isStreaming would be true for new sends; history loads are synchronous
    // batches that arrive while isStreaming is false).
    if (isStreaming) return;

    resumedDetectedRef.current = true;
    setShowResumedBanner(true);

    // Auto-dismiss after the banner animation completes (3s).
    const timer = setTimeout(() => {
      setShowResumedBanner(false);
    }, 3200);

    return () => clearTimeout(timer);
  }, [items.length, isStreaming]);

  // Scroll to bottom only when the user is near the bottom (within 80px).
  // This prevents new items from yanking the view when the user has scrolled up.
  const messageCount = items.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on count change; refs are stable
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const NEAR_BOTTOM_THRESHOLD = 80;
    const distanceFromBottom =
      container.scrollHeight - (container.scrollTop + container.clientHeight);
    if (distanceFromBottom <= NEAR_BOTTOM_THRESHOLD) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messageCount]);

  // Surface auth errors from send attempts
  useEffect(() => {
    if (lastError && isClaudeAuthRequiredError(new Error(lastError))) {
      flagAuthRequired();
    }
  }, [lastError, flagAuthRequired]);

  // Esc key binding — cancel an in-flight turn.
  useEffect(() => {
    if (!isStreaming) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isStreaming, cancel]);

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
    const fullMessage = sketchId !== undefined ? `${message}\n\n[sketch:${sketchId}]` : message;
    await handleSend(fullMessage);
  };

  const handleViewPage = (documentId: string, page: number) => {
    setPageImageTarget({ documentId, page });
  };

  return (
    <div className={styles.container}>
      <SessionHead modeId={session.modeId} title={tab.title} />

      {session.assignmentId && (
        <ExamLockdownGate
          assignmentId={session.assignmentId}
          isExamMode={session.modeId === "exam"}
          onLockdownChange={setExamLockdown}
        />
      )}

      <div ref={messagesContainerRef} className={styles.messages} onScroll={handleScroll}>
        {showResumedBanner && <ResumedBanner title={tab.title} />}
        {items.length === 0 && <EmptyState message="Start a conversation with your tutor." />}
        {items.map((item) => {
          if (item.kind === "tool-entry") {
            return (
              <ToolCallDisclosure
                key={`tc-${item.callId}`}
                toolName={item.toolName}
                verdict={
                  item.status === "errored" ? "error" : item.status === "settled" ? "ok" : "running"
                }
                {...(item.input !== undefined && { input: item.input })}
                {...(item.output !== undefined && { output: item.output })}
                {...(item.errorMessage !== undefined && { errorMessage: item.errorMessage })}
              />
            );
          }
          if (item.kind === "sub-agent") {
            return (
              <SubAgentBlock
                key={`sa-${item.callId}`}
                parentCallId={item.callId}
                initialLabel={getToolLabel(item.toolName).present.toLowerCase()}
                status={item.status}
                {...(item.errored !== undefined && { errored: item.errored })}
              />
            );
          }
          if (item.kind === "thinking") {
            return (
              <ReasoningBlock key={item.id} content={item.content} streaming={item.streaming} />
            );
          }
          if (item.kind === "cancel-marker") {
            return (
              <p key={item.id} className={styles.cancelMarker}>
                Cancelled
              </p>
            );
          }
          if (item.kind === "system-note") {
            return (
              <SystemNoteCard
                key={item.id}
                origin={item.origin}
                childSessionId={
                  item.origin.kind === "assignment_submission"
                    ? item.origin.childSessionId
                    : undefined
                }
                onReview={
                  item.origin.kind === "assignment_submission"
                    ? () => {
                        void client.tabs.open({
                          sessionId: brandId<"SessionId">(
                            item.origin.kind === "assignment_submission"
                              ? item.origin.childSessionId
                              : "",
                          ),
                        });
                      }
                    : undefined
                }
              />
            );
          }
          if (item.kind === "pending-message") {
            return (
              <QueuedMessageBubble
                key={item.id}
                item={item}
                onEdit={editPending}
                onRemove={(id) =>
                  item.status === "failed" ? removeFailed(id) : cancelPending(id)
                }
                onRetry={retryFailed}
              />
            );
          }
          return (
            <MessageBubble
              key={item.id}
              role={item.role}
              content={item.content}
              rawContent={item.rawContent}
              {...(item.streaming !== undefined && { streaming: item.streaming })}
              {...(item.citations !== undefined && { citations: item.citations })}
              {...(item.drafts !== undefined && { drafts: item.drafts })}
              {...(item.notes !== undefined && { notes: item.notes })}
              {...(item.dueCards !== undefined && { dueCards: item.dueCards })}
              onViewPage={handleViewPage}
              onRateCard={async (flashcardId, rating) => {
                // biome-ignore lint/suspicious/noExplicitAny: FlashcardId branded cast
                await client.flashcards.review({ flashcardId: flashcardId as any, rating });
              }}
              renderToggles={renderToggles}
              sessionId={tab.sessionId}
              recordDefinitionOccurrence={item.streaming === true}
            />
          );
        })}
        {/* Thinking indicator — shown when engine is working but no assistant text yet. */}
        {thinking && <ThinkingIndicator />}
        {/* Phase 17: quick-check cards appended after the most recent message.
            Each pending check stays visible in arrival order; cards lock
            after the student submits (resolved === true). Per tab-body-isolation,
            these mount once per tab instance and survive display:none switches. */}
        {quickChecks.map((check) => {
          if (check.item.kind === "structured-question") {
            return (
              <StructuredQuestionCard
                key={check.callId}
                callId={check.callId}
                item={check.item}
                onResolve={resolveQuickCheck}
              />
            );
          }
          return (
            <QuickCheckCard
              key={check.callId}
              callId={check.callId}
              item={check.item}
              onResolve={resolveQuickCheck}
            />
          );
        })}

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
          {...(onNoteOpen !== undefined && { onNoteOpen })}
          {...(hasSessionNote !== undefined && { hasSessionNote })}
        />
        <Composer
          ref={composerTextareaRef}
          value={composerValue}
          onChange={setComposerValue}
          onSend={async (msg, sketchId) => {
            // Exam lockdown gate (option 2): intercept at the tab-body level so
            // Composer stays "always-input-accepting" per the new contract. The
            // lockdown semantic belongs here, not in the Composer component.
            if (examLockdown) return;
            setComposerValue("");
            await handleSendWithSketch(msg, sketchId);
          }}
          isStreaming={isStreaming}
          onCancel={cancel}
          sketchEnabled={true}
        />
        <ComposerStatus
          isStreaming={isStreaming}
          pendingCount={pendingCount}
          failedCount={failedCount}
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

/**
 * Top-level tab body dispatcher. Routes each tab to the component that
 * matches its modeId. Teach mode (and unknown modes) use TeachChatTabBody.
 * Quiz, homework, exam, and course-create each have their own modality body.
 *
 * Per the tab-body-isolation pattern, all open instances mount simultaneously;
 * inactive ones are hidden via display:none in the parent (chat.tsx). The
 * dispatcher itself does not manage visibility — that remains in the parent.
 */
export function ChatTabBody({ tab, onNoteOpen, hasSessionNote }: ChatTabBodyProps): JSX.Element {
  // Document tabs have no session; route to the document viewer.
  if (tab.kind === "document") {
    return <DocumentTabBody tab={tab} />;
  }

  // Session tabs — narrow to SessionTabSummary and dispatch on modeId.
  switch (tab.modeId) {
    case "quiz":
      return <QuizTabBody tab={tab} />;
    case "homework":
      return <HomeworkTabBody tab={tab} />;
    case "exam":
      return <ExamTabBody tab={tab} />;
    case "course-create":
      return <CourseCreateTabBody tab={tab} />;
    case "study-skills":
      return <StudySkillsTabBody tab={tab} />;
    default:
      return (
        <TeachChatTabBody
          tab={tab}
          {...(onNoteOpen !== undefined && { onNoteOpen })}
          {...(hasSessionNote !== undefined && { hasSessionNote })}
        />
      );
  }
}
