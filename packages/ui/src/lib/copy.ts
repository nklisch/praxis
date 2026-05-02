/**
 * Editorial voice — invitational, quiet, never alarmist.
 *
 * Empty states read as invitations; errors are framed without panic;
 * loading is a slow italic ellipsis, not a spinner label.
 *
 * All UI-visible strings live here. To add copy, extend this constant.
 * To change voice, change it in one place.
 *
 * Browser-safe — no Node imports.
 */
export const COPY = {
  empty: {
    documents:
      "There are no documents yet. Bring me something to teach you — a textbook, a paper, a pack of concepts.",
    courses:
      "No courses yet. Start one from a knowledge pack, or upload your materials and we'll shape one together.",
    packs: "No knowledge packs available. Drop one into the packs directory and it'll appear here.",
    notes: "No notes yet. Take one from a session, or write one fresh.",
    flashcards: "No flashcards yet. Generate them from a note, or write your own.",
    sessions: "No sessions yet. Open one to begin.",
    tabs: "No tabs open. Choose a session from your library, or open a new one.",
    misconceptions: "No active misconceptions tracked.",
    unlockedGates: "No newly unlocked content. Keep working.",
  },
  loading: {
    default: "loading…",
    documents: "reading your documents…",
    courses: "looking through your courses…",
    starting: "opening a session…",
    saving: "saving…",
  },
  error: {
    /** Generic action-failed framing. Pass the verb: e.g. "save your changes". */
    generic: (whatYouTriedToDo: string): string =>
      `Couldn't ${whatYouTriedToDo}. Try again, or tell me what you saw.`,
    network: "The network seems quiet. Check your connection and try again.",
    unknown: "Something didn't go through. Try again, or tell me what you saw.",
  },
  composer: {
    placeholder: "Type a message… (Enter to send, Shift+Enter for newline)",
  },
} as const;
