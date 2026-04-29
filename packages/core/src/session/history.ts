import { episodicEvents } from "@praxis/memory/schema";
import { asc, eq } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type { ConversationTurn, EngineEvent } from "../types/index.js";

export interface LoadConversationHistoryInput {
  db: PraxisDb;
  sessionId: string;
}

/**
 * Read all (non-redacted) episodic events for a session and project to
 * ConversationTurn[]. Each turnIndex contributes one user turn (from its
 * user_message event) followed by one assistant turn (from concatenated
 * non-partial model_message contents) if assistant output exists.
 *
 * Used by SessionServiceImpl when opening (or re-opening) an EngineSession
 * with prior context — engine swap, process restart.
 */
export function loadConversationHistory(input: LoadConversationHistoryInput): ConversationTurn[] {
  const rows = input.db
    .select()
    .from(episodicEvents)
    .where(eq(episodicEvents.sessionId, input.sessionId))
    .orderBy(asc(episodicEvents.turnIndex), asc(episodicEvents.ts))
    .all();

  const byTurn = new Map<number, EngineEvent[]>();
  for (const row of rows) {
    if (row.redactedAt) continue;
    const evt = row.eventJson as EngineEvent;
    const list = byTurn.get(row.turnIndex);
    if (list) list.push(evt);
    else byTurn.set(row.turnIndex, [evt]);
  }

  const turns: ConversationTurn[] = [];
  for (const turnIdx of [...byTurn.keys()].sort((a, b) => a - b)) {
    const events = byTurn.get(turnIdx);
    if (!events) continue;

    const userEvent = events.find(
      (e): e is Extract<EngineEvent, { type: "user_message" }> => e.type === "user_message",
    );
    if (userEvent) turns.push({ role: "user", content: userEvent.content });

    const assistantParts = events
      .filter(
        (e): e is Extract<EngineEvent, { type: "model_message" }> =>
          e.type === "model_message" && e.partial !== true,
      )
      .map((e) => e.content);
    if (assistantParts.length > 0) {
      turns.push({ role: "assistant", content: assistantParts.join("\n") });
    }
  }

  return turns;
}
