import type {
  AssignmentId,
  SessionHandle,
  SketchId,
  TabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { getToolLabel } from "@praxis/tools/labels";
import { useNavigate } from "@tanstack/react-router";
import { type JSX, useEffect, useRef, useState } from "react";
import { useAuthStatus } from "../context/auth-context.js";
import { usePraxisClient } from "../context/client-context.js";
import { useAssignment } from "../hooks/use-assignment.js";
import { useQuickCheckBridge } from "../hooks/use-quick-check-bridge.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import { isClaudeAuthRequiredError } from "../lib/auth-error.js";
import { AssignmentCard } from "./assignment-card.js";
import { AuthGate } from "./auth-gate.js";
import { BootstrapTabBody } from "./bootstrap-tab-body.js";
import styles from "./chat-tab-body.module.css";
import { Composer } from "./composer.js";
import { ComposerVerbs } from "./composer-verbs.js";
import { ExamTabBody } from "./exam-tab-body.js";
import { HomeworkTabBody } from "./homework-tab-body.js";
import { MessageBubble } from "./message.js";
import { ModeHeader } from "./mode-header.js";
import { PageImagePanel } from "./page-image-panel.js";
import { QuickCheckCard } from "./quick-check-card.js";
import { QuizTabBody } from "./quiz-tab-body.js";
import { ReasoningBlock } from "./reasoning-block.js";
import { StructuredQuestionCard } from "./structured-question-card.js";
import { StudySkillsTabBody } from "./study-skills-tab-body.js";
import { SubAgentBlock } from "./sub-agent-block.js";
import { ThinkingIndicator } from "./thinking-indicator.js";
import { ToolInterstitial } from "./tool-interstitial.js";

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
 * Teach-mode (and default) tab body. Holds the message log, composer, auth
 * banner, and mode header for a single open tab. Each instance has its own
 * useStreamedSend so message logs are isolated across tabs.
 *
 * The session already exists when this component mounts — it was created by
 * NewTabPicker (or openSessionInTab). This component's job is to drive the
 * existing session via client.session.send.
 *
 * Exported so BootstrapTabBody can embed it in the left pane.
 */
export function TeachChatTabBody({ tab }: ChatTabBodyProps): JSX.Element {
  const client = usePraxisClient();
  const navigate = useNavigate();
  const { items, isStreaming, thinking, lastError, send, cancel, loadHistory } =
    useStreamedSend(client);
  const { flagAuthRequired } = useAuthStatus();

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

      <div ref={messagesContainerRef} className={styles.messages}>
        {items.length === 0 && (
          <p className={styles.emptyState}>Start a conversation with your tutor.</p>
        )}
        {items.map((item) => {
          if (item.kind === "interstitial") {
            return (
              <ToolInterstitial
                key={`tc-${item.callId}`}
                toolName={item.toolName}
                status={item.status}
                {...(item.errored !== undefined && { errored: item.errored })}
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
        />
        {isStreaming && (
          <div className={styles.stopRow}>
            <button
              type="button"
              className={styles.stopButton}
              onClick={cancel}
              aria-label="Stop generating"
            >
              Stop
            </button>
          </div>
        )}
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

/**
 * Top-level tab body dispatcher. Routes each tab to the component that
 * matches its modeId. Teach mode (and unknown modes) use TeachChatTabBody.
 * Quiz, homework, exam, and bootstrap each have their own modality body.
 *
 * Per the tab-body-isolation pattern, all open instances mount simultaneously;
 * inactive ones are hidden via display:none in the parent (chat.tsx). The
 * dispatcher itself does not manage visibility — that remains in the parent.
 */
export function ChatTabBody({ tab }: ChatTabBodyProps): JSX.Element {
  switch (tab.modeId) {
    case "quiz":
      return <QuizTabBody tab={tab} />;
    case "homework":
      return <HomeworkTabBody tab={tab} />;
    case "exam":
      return <ExamTabBody tab={tab} />;
    case "bootstrap":
      return <BootstrapTabBody tab={tab} />;
    case "study-skills":
      return <StudySkillsTabBody tab={tab} />;
    default:
      return <TeachChatTabBody tab={tab} />;
  }
}
