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
    /** Library section empty states — each is an invitation, not a notice. */
    libraryCoursesEmpty:
      "No courses in progress. Import a pack to begin, or start a bootstrap session.",
    libraryPacksEmpty:
      "No knowledge packs available. Drop a pack JSON into the packs directory and it will appear here.",
    libraryDocumentsEmpty:
      "No documents ingested. Add a textbook, paper, or PDF and Praxis will teach from it.",
    librarySessionsEmpty: "No recent sessions. Open a course or pack to begin a session.",
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
    sketchToggleAriaLabel: "Open sketch input",
    sketchSubmitButton: "Submit sketch",
    sketchCancelButton: "Cancel",
  },
  sketch: {
    noVision:
      "Vision isn't available with the current engine. Switch to one that supports vision.",
    needsReview:
      "I read your work but couldn't verify it cleanly. Could you re-write or clarify?",
  },
} as const;
