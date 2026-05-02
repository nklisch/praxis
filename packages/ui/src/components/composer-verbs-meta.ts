/**
 * Mode-aware verb sets for the chip rail above the composer.
 *
 * Tap a verb → the composer textarea is prefilled with the verb + a trailing
 * space, cursor positioned at the end so the student keeps typing.
 *
 * Verbs are starter words, not autosend. The student remains in control.
 *
 * Phase 16 will add exam, quiz, and homework verb sets alongside their
 * modality bodies. Until then, those modes fall back to the teach set.
 */
export const VERBS_BY_MODE: Readonly<Record<string, ReadonlyArray<string>>> = {
  teach: ["explain", "quiz me on", "let me try", "show your work", "slower", "go deeper"],
  bootstrap: ["what should we cover", "add this", "remove that", "what's next"],
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
