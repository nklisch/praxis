import type { PraxisClient, RetrievalCitation, SessionId } from "@praxis/core/types";
import { useState } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  /** Citations from retrieve_from_textbook tool calls in this message. */
  citations?: RetrievalCitation[];
}

export interface UseStreamedSendResult {
  messages: ChatMessage[];
  isStreaming: boolean;
  lastError: string | null;
  send: (sessionId: SessionId, message: string) => Promise<void>;
  clearMessages: () => void;
}

let msgCounter = 0;
function nextId(): string {
  return `msg-${++msgCounter}`;
}

export function useStreamedSend(client: PraxisClient): UseStreamedSendResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const send = async (sessionId: SessionId, message: string): Promise<void> => {
    if (isStreaming) return;
    setLastError(null);

    // Immediately add user bubble to local state.
    const userMsgId = nextId();
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content: message }]);

    // Add a placeholder assistant bubble for streaming.
    const assistantMsgId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "", streaming: true },
    ]);

    setIsStreaming(true);
    let finalContent = "";
    // Track the most recent tool_call name so we know which tool_result to harvest
    let lastToolCallName: string | null = null;
    const accumulatedCitations: RetrievalCitation[] = [];

    try {
      for await (const event of client.session.send(sessionId, message)) {
        // Ignore user_message events — user bubble already in local state.
        if (event.type === "user_message") continue;

        if (event.type === "model_message") {
          if (event.partial === true) {
            // Streaming delta — append to running content.
            finalContent += event.content;
          } else {
            // Final non-partial — this is the assembled content for the turn.
            finalContent = event.content;
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: finalContent, streaming: true } : m,
            ),
          );
        } else if (event.type === "tool_call") {
          // Track the tool name so we know what to expect in tool_result
          lastToolCallName = event.toolName;
        } else if (event.type === "tool_result") {
          // Harvest citations from retrieve_from_textbook results
          if (lastToolCallName === "retrieve_from_textbook" && event.result.ok) {
            const value = event.result.value as { citations?: RetrievalCitation[] } | undefined;
            if (value?.citations && Array.isArray(value.citations)) {
              accumulatedCitations.push(...(value.citations as RetrievalCitation[]));
            }
          }
          lastToolCallName = null;
          // Update message with accumulated citations
          if (accumulatedCitations.length > 0) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, citations: [...accumulatedCitations] } : m,
              ),
            );
          }
        } else if (event.type === "error") {
          setLastError(event.error.message);
          break;
        }
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      // Mark assistant message as done (no longer streaming).
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                streaming: false,
                ...(accumulatedCitations.length > 0 && { citations: [...accumulatedCitations] }),
              }
            : m,
        ),
      );
      setIsStreaming(false);
    }
  };

  const clearMessages = () => {
    setMessages([]);
    setLastError(null);
  };

  return { messages, isStreaming, lastError, send, clearMessages };
}
