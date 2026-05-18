/**
 * Mode-aware verb sets for the chip rail above the composer.
 *
 * Tap a verb → the composer textarea is prefilled with the verb + a trailing
 * space, cursor positioned at the end so the student keeps typing.
 *
 * Verbs are starter words, not autosend. The student remains in control.
 *
 * Phase 16: quiz, homework, and exam each have their own chip set. The
 * quiz/homework chips appear in the SidekickPanel composer; the exam chip
 * appears in the ClarificationPill composer.
 */
export const VERBS_BY_MODE: Readonly<Record<string, ReadonlyArray<string>>> = {
  teach: ["explain", "quiz me on", "let me try", "show your work", "slower", "go deeper"],
  "course-create": ["what should we cover", "add this", "remove that", "what's next"],
  quiz: ["I'm stuck", "give me a nudge", "explain this"],
  homework: ["clarify wording", "show your work", "flag for review"],
  exam: ["ask for clarification", "next problem"],
};

/**
 * Returns the verb list for the given mode. Falls back to the `teach` set for
 * modes not yet represented (exam, quiz, homework, etc.).
 * Returns an empty array when `modeId` is undefined (no active session).
 */
export function getVerbsForMode(modeId: string | undefined): ReadonlyArray<string> {
  if (modeId === undefined) return [];
  return VERBS_BY_MODE[modeId] ?? VERBS_BY_MODE.teach ?? [];
}
