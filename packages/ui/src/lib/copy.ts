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
    conceptMaps:
      "No concept maps yet. Sketch one to externalize how the ideas connect — your tutor will compare it to the canonical graph and discuss productive differences with you.",
    /** Library section empty states — each is an invitation, not a notice. */
    libraryCoursesEmpty:
      "No courses in progress. Import a pack to begin, or design one from your materials.",
    libraryPacksEmpty:
      "No knowledge packs available. Drop a pack JSON into the packs directory and it will appear here.",
    libraryDocumentsEmpty:
      "No documents ingested. Add a textbook, paper, or PDF and Praxis will teach from it.",
    librarySessionsEmpty: "No recent sessions. Open a course or pack to begin a session.",
    /** Phase 16: scope-attached document states */
    attachedDocsEmpty:
      "No documents attached yet. Add one from your files, or reuse one from your library.",
    libraryPickerEmpty: "No documents in your library yet — add one to get started.",
    /** Library documents tabs (scope-aware view) */
    libraryDocumentsCourseEmpty: "No documents attached to this course yet.",
    libraryDocumentsSessionEmpty: "This session hasn't attached any documents.",
    libraryDocumentsOrphanedEmpty: "No orphaned documents — your library is tidy.",
    libraryDocumentsFiltered: "No documents match these filters.",
    /** Course concepts list — shown when the course has no concepts yet. */
    concepts: "No concepts yet. Run a course-create session to populate the course with concepts.",
    /** Memory tab — per-projection empty states */
    memorySemanticEmpty:
      "No mastery data yet. Start a teach session to begin tracking concept mastery.",
    memoryMisconceptionsEmpty:
      "No misconceptions recorded. Misconceptions are detected automatically during sessions.",
    memoryProceduralEmpty:
      "No strategy preferences recorded yet. Strategy preferences accumulate as the student works through sessions.",
    memoryAffectiveEmpty:
      "No affective signals recorded yet. Engagement and confidence signals are inferred during active sessions.",
    memoryEpisodicEmpty:
      "No episodic events recorded yet. Events are appended after each session turn.",
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
    placeholder: "answer · or ask the tutor a question",
    hints: "enter send · shift+enter newline · ⌘⇧k sketch",
    sketchToggleAriaLabel: "Open sketch input",
    sketchSubmitButton: "Submit sketch",
    sketchCancelButton: "Cancel",
  },
  sketch: {
    noVision: "Vision isn't available with the current engine. Switch to one that supports vision.",
    needsReview: "I read your work but couldn't verify it cleanly. Could you re-write or clarify?",
  },
  update: {
    available: (version: string): string => `A newer Praxis is available — v${version}.`,
    downloadLabel: "Download",
    dismissLabel: "Dismiss this update",
  },
  prompt: {
    modePickerLabel: "Mode",
    lockedFragmentLabel: "Locked",
    fragmentBlockEditedBadge: "Edited",
    fragmentBlockLockedBadge: "Locked",
    fragmentBlockLockHint: "Configurator lock is on — unlock to edit.",
    fragmentBlockReturnToDefault: "Return to default",
    fragmentBlockDiffShow: "Diff",
    fragmentBlockDiffHide: "Hide diff",
    styleSectionTitle: "Teaching Style",
    styleSectionDesc: "Adjust how the tutor communicates. Changes apply globally across sessions.",
    // Prompt blocks (v3 unified surface)
    blocksSectionTitle: "Prompt blocks",
    blocksSectionDesc:
      "Every slot in the composed prompt — fragments, your global, this mode's append — listed in render order. Toggle between editable blocks and the assembled output.",
    blockGlobalTitle: "Global prompt",
    blockAppendTitleFor: (modeId: string) => `${modeId} append`,
    stackToggleBlocks: "Blocks",
    stackToggleComposed: "Composed",
  },
  libraryPicker: {
    /** Deck copy for course-scope picker: clarifies no re-upload needed. */
    deckCourse: "Select a document to attach it to this course without re-uploading.",
    /** Deck copy for session-scope picker: scoped to the active exploration. */
    deckSession:
      "Select a document to add to this session — the drafter will see it on its next turn.",
  },
  onboarding: {
    welcomeTitle: "Welcome to Praxis",
    welcomeBody:
      "I'm a tutor that adapts to how you learn. We'll set up your engine, pick somewhere to start, and you'll be in your first lesson in a minute.",
    engineTitle: "Pick your tutor's engine",
    engineBody:
      "Praxis can drive Claude, GPT, Gemini, or local models through Ollama. Pick one — you can change this later in Settings.",
    courseTitle: "Where shall we start?",
    courseBody:
      "Choose a curated pack to begin immediately, or hand me a syllabus and we'll shape a course together.",
    courseAlgebraLabel: "Algebra (canonical)",
    courseAlgebraBody: "A CCSS-aligned algebra-1 concept graph. Good for learners 9-12.",
    courseBiologyLabel: "Biology (canonical)",
    courseBiologyBody:
      "An NGSS-aligned high-school biology graph spanning cells, genetics, evolution, and ecosystems.",
    courseFromSyllabusLabel: "From your own syllabus",
    courseFromSyllabusBody:
      "Drop in a syllabus or textbook outline and we'll design a course together from it.",
    skipLabel: "Skip onboarding",
    continueLabel: "Continue",
    backLabel: "Back",
    startLabel: "Start",
    couldNotStart: "Couldn't start that path. Pick another, or skip and we'll set it up later.",
  },
} as const;
