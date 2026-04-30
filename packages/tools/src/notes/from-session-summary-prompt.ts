/**
 * Phase 12: Re-export the from_session_summary system prompt from the service layer.
 * The tool file and tests import from here; the actual prompt lives in
 * @praxis/core/src/services/notes-session-summary-prompt.ts.
 *
 * This re-export keeps the prompt at a predictable location within the tools package
 * without duplicating the string.
 */

export { FROM_SESSION_SUMMARY_PROMPT } from "@praxis/core/services";
