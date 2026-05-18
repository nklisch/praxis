import type { ConfiguratorActionRow, SessionId, Timestamp } from "@praxis/core/types";
import { useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import styles from "./authoring-chat-pane.module.css";
import { Composer } from "./composer.js";
import { MessageBubble } from "./message.js";
import { SubAgentBlock } from "./sub-agent-block.js";
import { ToolCallEntry } from "./tool-call-entry.js";

/** Mode ids that mount an authoring chat pane. */
export type AuthoringModeId = "configure" | "bootstrap";

/** Labels shown in the pane header per mode. */
const MODE_LABEL: Record<AuthoringModeId, string> = {
  configure: "Configure assistant",
  bootstrap: "Course-design assistant",
};

/** Empty-state hint text per mode. */
const MODE_EMPTY_STATE: Record<AuthoringModeId, string> = {
  configure: "Ask me to edit courses, lessons, gates, or customize prompts.",
  bootstrap: "Steer the draft — or say 'confirm and open the course'.",
};

export interface AuthoringChatPaneProps {
  /** Which authoring mode this pane is serving. Controls labels and empty-state copy. */
  mode: AuthoringModeId;
  /** The session id to load history for and send messages to. */
  sessionId: SessionId | null;
  /** When true, the composer is disabled even if a session is active. */
  disabled?: boolean;
}

/**
 * Generic chat pane for authoring surfaces (configure and course-create).
 *
 * Reuses `useStreamedSend` exactly like the main chat route but scoped to the
 * authoring session. `<ConfigureChatPane>` is a thin wrapper that passes
 * `mode="configure"`.
 */
export function AuthoringChatPane({ mode, sessionId, disabled = false }: AuthoringChatPaneProps) {
  const client = usePraxisClient();
  const { items, isStreaming, lastError, send, loadHistory } = useStreamedSend(client);
  const [composerValue, setComposerValue] = useState("");

  // ── Configurator actions correlation ───────────────────────────────────────
  // Load the audit log once per session and refresh at the end of each
  // streaming turn. Used to match settled tool-entry items to audit-log action
  // rows so we can pass `actionId` + `restoredAt` to <ToolCallEntry>.
  const [actions, setActions] = useState<ConfiguratorActionRow[]>([]);
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    const fetchActions = async () => {
      try {
        const rows = await client.author.listConfiguratorActions();
        setActions(rows);
      } catch {
        // Non-fatal: revert buttons simply won't appear.
      }
    };

    // Refresh when a streaming turn ends (wasStreaming → not streaming).
    if (wasStreamingRef.current && !isStreaming) {
      void fetchActions();
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, client]);

  // Load once when the session id is set.
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per session id
  useEffect(() => {
    if (!sessionId) return;
    void (async () => {
      try {
        const rows = await client.author.listConfiguratorActions();
        setActions(rows);
      } catch {
        // Non-fatal.
      }
    })();
  }, [sessionId]);

  /**
   * Correlate a `tool-entry` item's callId to a `ConfiguratorActionRow`.
   *
   * Tool names match action kinds directly (e.g. "lesson.create" → action.kind
   * "lesson.create"). Within a kind group, correlation is by time order: the
   * n-th settled tool entry of a given kind maps to the n-th action row of that
   * kind (ordered by `ts` asc). This is reliable because authoring sessions are
   * single-turn (no concurrent tool fan-out within one user message).
   */
  const buildCallIdToActionMap = (): Map<
    string,
    { actionId: string; restoredAt: Timestamp | null | undefined }
  > => {
    const map = new Map<string, { actionId: string; restoredAt: Timestamp | null | undefined }>();
    if (actions.length === 0) return map;

    // Group action rows by kind, sorted by ts asc.
    const actionsByKind = new Map<string, ConfiguratorActionRow[]>();
    for (const row of actions) {
      const kind = row.action.kind;
      const bucket = actionsByKind.get(kind) ?? [];
      bucket.push(row);
      actionsByKind.set(kind, bucket);
    }
    for (const [, bucket] of actionsByKind) {
      bucket.sort((a, b) => (a.ts as number) - (b.ts as number));
    }

    // Group settled tool-entry items by toolName, sorted by firstSeenAt asc.
    const entriesByName = new Map<string, (typeof items)[number][]>();
    for (const item of items) {
      if (item.kind !== "tool-entry" || item.status === "in_flight") continue;
      const bucket = entriesByName.get(item.toolName) ?? [];
      bucket.push(item);
      entriesByName.set(item.toolName, bucket);
    }
    for (const [, bucket] of entriesByName) {
      // ToolEntryItem has firstSeenAt; runtime cast is safe here
      bucket.sort((a, b) => {
        const aTs = (a as { firstSeenAt?: number }).firstSeenAt ?? 0;
        const bTs = (b as { firstSeenAt?: number }).firstSeenAt ?? 0;
        return aTs - bTs;
      });
    }

    // Zip by index within each kind group.
    for (const [toolName, entries] of entriesByName) {
      const rows = actionsByKind.get(toolName);
      if (!rows) continue;
      entries.forEach((entry, idx) => {
        const row = rows[idx];
        if (row == null) return;
        map.set((entry as { callId: string }).callId, {
          actionId: row.id,
          restoredAt: row.restoredAt,
        });
      });
    }

    return map;
  };

  const callIdToAction = buildCallIdToActionMap();

  // Load the persisted transcript when a session id appears. The pane may be
  // reused across tabs so sessionId can be null while a session is starting.
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per session id
  useEffect(() => {
    if (sessionId) void loadHistory(sessionId);
  }, [sessionId]);

  const handleSend = async (message: string) => {
    if (!sessionId) return;
    await send(sessionId, message);
  };

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <span className={styles.label}>{MODE_LABEL[mode]}</span>
        <span className={styles.status}>
          {!sessionId ? "Starting session…" : isStreaming ? "Thinking…" : "Ready"}
        </span>
      </div>

      <div className={styles.messages}>
        {items.length === 0 && <p className={styles.emptyState}>{MODE_EMPTY_STATE[mode]}</p>}
        {items.map((item) => {
          if (item.kind === "tool-entry") {
            const verdict =
              item.status === "in_flight" ? "running" : item.status === "errored" ? "error" : "ok";
            const summary =
              item.status === "errored"
                ? (item.errorMessage ?? `Failed.`)
                : item.status === "in_flight"
                  ? "…"
                  : typeof item.output === "string"
                    ? item.output
                    : ((item.output as { summary?: string } | undefined)?.summary ?? item.toolName);
            const correlation = callIdToAction.get(item.callId);
            // Build partial props separately to avoid exactOptionalPropertyTypes issues:
            // only include actionId/restoredAt when correlation is known.
            const revertProps: {
              actionId?: string;
              restoredAt?: Timestamp | null;
            } =
              correlation != null
                ? {
                    actionId: correlation.actionId,
                    ...(correlation.restoredAt !== undefined && {
                      restoredAt: correlation.restoredAt,
                    }),
                  }
                : {};
            return (
              <ToolCallEntry
                key={`tc-${item.callId}`}
                name={item.toolName}
                summary={summary}
                verdict={verdict}
                {...revertProps}
              />
            );
          }
          if (item.kind === "sub-agent") {
            return (
              <SubAgentBlock
                key={`sa-${item.callId}`}
                parentCallId={item.callId}
                initialLabel={item.toolName}
                status={item.status}
                {...(item.errored === true && { errored: true })}
              />
            );
          }
          if (item.kind === "thinking") {
            // Reasoning blocks don't appear in the authoring pane — render nothing.
            return null;
          }
          if (item.kind === "cancel-marker") {
            return null;
          }
          if (item.kind === "pending-message") {
            // Pending messages are teach-mode UI state; authoring panes use a
            // separate session.
            return null;
          }
          if (item.kind === "system-note") {
            // system_note cards don't appear in the authoring pane.
            return null;
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
            />
          );
        })}
      </div>

      {lastError && (
        <div className={styles.errorBanner} role="alert">
          Error: {lastError}
        </div>
      )}

      <Composer
        value={composerValue}
        onChange={setComposerValue}
        onSend={async (msg) => {
          setComposerValue("");
          await handleSend(msg);
        }}
        disabled={!sessionId || isStreaming || disabled}
      />
    </div>
  );
}
