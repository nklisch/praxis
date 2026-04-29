import type { ConversationTurn } from "@praxis/core/types";

/**
 * Serialize prior conversation turns into a plain-text transcript for adapters
 * whose SDK doesn't accept structured history when opening a fresh session.
 * Used by ClaudeCodeEngineSession and CodexEngineSession only when seeding
 * with priorTurns (engine swap, process restart). Subsequent turns benefit
 * from the SDK's native multi-turn — the transcript prefix appears only on
 * the first send after open.
 */
export function buildTranscriptPreface(priorTurns: ReadonlyArray<ConversationTurn>): string {
  if (priorTurns.length === 0) return "";
  const lines = ["[Continuing this conversation from earlier:]", ""];
  for (const turn of priorTurns) {
    const label = turn.role === "user" ? "User" : "Tutor";
    lines.push(`${label}: ${turn.content}`);
  }
  lines.push("", "[Now continuing — please respond to the next user message.]", "");
  return lines.join("\n");
}
