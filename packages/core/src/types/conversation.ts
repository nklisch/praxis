/**
 * One side of a conversation turn, in chronological order. Used to seed an
 * EngineSession when rebuilding from episodic (engine swap, process restart).
 *
 * Phase 3 fidelity: text-only. Assistant content for a multi-step turn is the
 * concatenation of all final (non-partial) model_message contents in that
 * turn, joined with "\n". Tool calls within turns are not re-injected when
 * seeding — the agent sees the assistant's final textual response. Adequate
 * because rebuilds are rare; native multi-turn (the common case) preserves
 * full fidelity through the SDK.
 */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}
