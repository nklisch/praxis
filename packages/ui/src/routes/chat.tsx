import type { SessionHandle } from "@praxis/core/types";
import { useEffect, useRef, useState } from "react";
import { Composer } from "../components/composer.js";
import { MessageBubble } from "../components/message.js";
import { usePraxisClient } from "../context/client-context.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import styles from "./chat.module.css";

export function ChatRoute() {
  const client = usePraxisClient();
  const { messages, isStreaming, lastError, send, clearMessages } = useStreamedSend(client);
  const [session, setSession] = useState<SessionHandle | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  return (
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
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {lastError && <div className={styles.errorBanner}>Error: {lastError}</div>}

      <Composer onSend={handleSend} disabled={!session || isStreaming || starting} />
    </div>
  );
}
