# Design: Phase 12 — Workspace + Notes + Flashcards

## Overview

Phase 12 makes Praxis a *study* tool, not just a teaching tool. The student takes structured notes during or after a session (Cornell, Feynman, Outline, or Free format), generates flashcards from those notes, and reviews them on an FSRS-scheduled cadence. The agent can author notes for the student via tools (`note.create`, `note.from_session_summary`); the student manages and reviews them at `/workspace`.

After Phase 12: during a teach session, the student or agent calls `note.create({format: "cornell", questions: [...], details: [...], summary: "..."})` → note persists. After several sessions, the student visits `/workspace/review` → 8 due cards waiting → rates each (Again/Hard/Good/Easy) → next review dates computed via FSRS → `pnpm db:cards-due` confirms the schedule. Or the student can ask the agent "warm up before today's lesson" → agent calls `flashcard.review_next` → reviews 3-5 cards inline in chat.

**Key design moves (from user discussion):**

1. **Structured JSON per format** for note bodies. Cornell stores `{questions: [], details: [], summary}`; Feynman stores `{explanation, followUps: []}`; Outline stores `{root: TreeNode}`; Free stores `{text}`. Each value can contain markdown — students write naturally — but the regions are typed. This makes flashcard generation clean (each Cornell question pairs with its detail; each Feynman follow-up is its own card) and makes per-format UI render reliably.

2. **`ts-fsrs` library** wrapped as a `FsrsScheduler` port. Lives in `@praxis/curriculum/scheduling/`. The port lets Phase 14 evals swap implementations (or A/B-test parameter tuning) without touching service code. v1 ships FSRS-5 with default parameters.

3. **Standalone `/workspace` route + inline panel from chat.** Browse notes at `/workspace/notes`; manage cards at `/workspace/cards`; review at `/workspace/review`. From a chat session, a "Take a note" button opens the workspace inline (split-pane). Same components, two surfaces.

4. **Both review surfaces** ship in v1: dedicated `/workspace/review` route for sit-down review sessions (one card at a time, four rating buttons, progress indicator) + agent-driven inline review for "warm up before today's lesson" via `flashcard.review_next` tool. They share the same scheduler and rating math.

5. **Sketch format defers to Phase 13.** The `format: "sketch"` enum value already exists from Phase 1; Phase 12 doesn't expose it as a creation option in the UI (no tldraw integration yet). The other four formats ship.

**What ships:**

- **Type contracts** (`@praxis/core/types/notes.ts`, `flashcards.ts`):
  - `NoteBody` discriminated union — `CornellBody`, `FeynmanBody`, `OutlineBody`, `FreeBody`.
  - `OutlineNode` recursive tree type for outline format.
  - `FsrsScheduler` port + `Rating` enum (`"again" | "hard" | "good" | "easy"`).
  - `NotesService` and `FlashcardsService` server-side interfaces.
  - `NotesClient` and `FlashcardsClient` client-side interfaces.
- **No schema changes** — existing `notes` and `flashcards` tables (Phase 1) are sufficient. The `body` column stores a JSON-encoded `NoteBody` for structured formats; the format enum tells us how to parse. The `reviewStateJson` column stores FSRS state opaquely.
- **`FsrsSchedulerImpl`** in `@praxis/curriculum/src/scheduling/` — wraps `ts-fsrs`. Pure function: `(currentState, rating, now) → newState`. Plus initial-state factory.
- **`NotesServiceImpl`** in `@praxis/core/src/services/notes-service.ts` — `create`, `update`, `get`, `list`, `delete` for notes. Reads/writes through Drizzle; parses/serializes the JSON body per format.
- **`FlashcardsServiceImpl`** in `@praxis/core/src/services/flashcards-service.ts` — `create`, `update`, `get`, `list` (with `due?: boolean` filter), `delete`, `review` (records a rating and computes next state via FSRS). Plus `dueCount` for UI badges.
- **Note tools** in `@praxis/tools/src/notes/`:
  - `note.create({format, body, context?})` — creates a note. Body validated per format.
  - `note.update({noteId, body})` — modifies an existing note.
  - `note.show({noteId})` — returns the note for inline rendering in chat (UI dispatches on `tool_result` to render `<NoteCard>`).
  - `note.list({courseId?, lessonId?, format?})` — list student's notes with filters.
  - `note.from_session_summary({sessionId, format})` — generates a note from the session's recent episodic events. Calls a one-shot LLM agent via `runOneShot` (same pattern as misconception indexer in Phase 7) to produce structured `NoteBody` JSON.
- **Flashcard tools** in `@praxis/tools/src/flashcards/`:
  - `flashcard.create({front, back, conceptId?})` — direct authoring.
  - `flashcard.from_note({noteId, sectionId?})` — extracts flashcards from a note. For Cornell: each `(question[i], details[i])` pair → one card. For Feynman: explanation→front, follow-ups→cards. For Outline: each leaf node → card. Returns proposed cards; student/agent confirms before persisting.
  - `flashcard.review_next({count?})` — fetches up to `count` (default 1) due cards. Used by the agent for inline review.
  - `flashcard.review({cardId, rating})` — records a rating and computes next state. Returns `{ok, nextReviewAt}`.
- **`/workspace` route** at `packages/ui/src/routes/workspace/` with three sub-routes:
  - `/workspace/notes` — list of notes (filterable by course/lesson/format) + "New note" button.
  - `/workspace/notes/:noteId` — note editor for the four text formats (Cornell/Feynman/Outline/Free).
  - `/workspace/cards` — flashcard browser (filterable by concept) with stats: due now, learning, mature.
  - `/workspace/review` — sit-down review session: one card at a time, four rating buttons, progress indicator.
- **Inline workspace panel** — when chat surface has a "Take a note" affordance and the user clicks it, opens the workspace as a split-pane (chat left, workspace right). Same components, route-less mode.
- **Agent-driven inline review** — `flashcard.review_next` returns a card; UI's `useStreamedSend` dispatches on the `tool_result` to render an inline `<ReviewCard>` with rating buttons. User clicks a rating; UI calls `flashcard.review`.
- **`praxis.notes.*` + `praxis.flashcards.*` IPC** — read/write channels.
- **`pnpm db:cards-due`** CLI — lists due cards with their next-review dates.
- **Configure mode integration** — Phase 11's memory inspector gains a "Notes" sub-tab (browse + reset notes per concept).
- **Doc updates**: `docs/ROADMAP.md` Phase 12 description tightened; `docs/CURRICULUM.md` adds spaced-repetition + note-taking sections; `docs/CONTRACT.md` adds NotesService + FlashcardsService.

**What does not ship (deferred):**

- **Sketch note format UI** — Phase 13 (tldraw integration). The format enum value exists; `note.create({format: "sketch"})` is not exposed in v1.
- **Custom FSRS parameter tuning** — Phase 14 (per-student parameter optimization based on review history).
- **Card pre-generation from canonical packs** — pack-shipped flashcards. Future.
- **Multi-deck organization** — v1 is one big deck per student. Tagging + decks deferred.
- **Note search (full-text)** — list-and-filter only in v1. FTS integration is Phase 14.
- **Cross-device sync** — local-first by deployment.
- **Image/audio attachments to flashcards** — text only in v1.
- **Review streaks / gamification** — out of scope per VISION.md (not a goal).
- **Note sharing between students** — multi-student is post-v1 anyway.
- **Bulk import** of existing flashcard decks (Anki .apkg, etc.) — future.

## Why these choices (decision rationale)

**Why structured JSON per format (vs. markdown convention).** The structure-with-markdown-inside model matches how students actually work — they want the system to enforce "this is the questions column" without restricting how they write inside it. Flashcard generation is dramatically cleaner: each Cornell `(question, detail)` pair maps deterministically to a card front/back. With markdown headers as delimiters, the parser would have to handle ambiguous edits ("did the student delete the H2 or just the text under it?"). Per-format types also let the UI render correctly without runtime parsing — the editor for Cornell has three textareas; for Outline, a recursive component; for Free, one textarea.

**Why `ts-fsrs` library (vs. custom).** FSRS-5 is a well-tuned algorithm with good defaults. The roadmap explicitly mentions "FSRS reference TS implementation" as research. `ts-fsrs` is MIT-licensed, ~5KB, used in Anki community ports. Wrapping it in a port (`FsrsScheduler`) means Phase 14 can swap implementations or A/B-test parameter sets without touching service code. Custom implementation would be reinventing a wheel; SM-2 is too simple for a tool that takes pedagogy seriously.

**Why two review surfaces (dedicated route + agent-driven).** They serve different study modes:
- **Dedicated `/workspace/review`** — for the student who sits down for 20 minutes of focused review. Volume: 30-50 cards. Single-card-at-a-time UX, clear progress, no chat distractions.
- **Agent-driven inline** — for the "5-card warm-up before today's lesson" use case. Volume: 3-5 cards. Conversational; the agent narrates what they're reviewing and why.

Both share the same scheduler + rating math; UI surfaces differ. Cost: small additional UI surface vs. Phase 14+ if we shipped one and added the other later. Worth the extra UI now since both flows are first-class.

**Why notes and flashcards are separate services (`NotesService` + `FlashcardsService`).** They have different access patterns, different write rates, different tools. Notes are append-and-edit; flashcards are append-and-review (high-frequency). Mixing them would force one service to have two distinct read patterns. Following Phase 6/7/8 precedent: domain artifacts get their own service.

**Why FSRS state is stored opaquely in `reviewStateJson`.** ts-fsrs maintains its own state shape (stability, difficulty, elapsed, scheduled, reps, lapses, etc.). Praxis types it as `Record<string, unknown>` per Phase 1's `ReviewState.state` field — Praxis owns the wrapper (`{algorithm: "fsrs", state, nextReviewAt, lastReviewedAt}`); ts-fsrs owns the inner shape. If Phase 14 swaps to a different scheduler, the wrapper survives; only the `state` field shape changes per algorithm.

**Why flashcard generation is "propose and confirm" (not auto-create).** UX.md says "Flashcards can be generated from notes ... the student confirms each before adding." Phase 6's draft-bootstrap flow already used this pattern — the agent shows proposed work, the user confirms or edits before persistence. Same shape here: `flashcard.from_note` returns proposed cards; the UI renders them as a card-picker; user clicks "Add" per card. Avoids deck pollution from one bad note.

**Why no schema changes.** The Phase 1 schema for `notes` and `flashcards` already supports JSON-encoded bodies (`body: text` accepts JSON strings) and FSRS state (`reviewStateJson: text json mode`). The discriminator is `format`. Phase 12 is purely application-layer work.

**Why `flashcard.review` is a tool (not just an IPC call).** The agent might initiate a review during chat ("let's warm up"); the tool call surfaces in the transcript so `pnpm db:episodic` shows the review activity. Same pattern as Phase 6's `course.mark_studied` and Phase 7's `update_mastery` — student state changes that the agent participates in are tools, not silent IPC writes.

## Scope and assumptions

- **Single-student per install** (v1).
- **Notes are scoped per `(student, course, lesson, session)`** via `NoteContext`. Searches filter by these fields.
- **Flashcards are scoped per `(student, conceptId?)`** — concept-id is optional but recommended (links flashcard to mastery model for cross-referenced display in Phase 9 progress map).
- **FSRS-5 default parameters** ship in v1. Tuning is Phase 14.
- **Notes are mutable; flashcards are mutable for content but not for review state from the UI** — only `flashcard.review` writes the FSRS state.
- **Note `body` storage**: structured formats encode `NoteBody` as JSON string in the existing `body` column. The application layer parses on read; serializes on write.
- **`flashcard.from_note` is idempotent in spirit**: re-running it on the same note doesn't auto-add the same cards (the user has to confirm). The cards table doesn't enforce dedup; the UI does.
- **Review queue ordering**: due-most-overdue first; ties broken by `lastReviewedAt` ascending (oldest reviewed first). Cards never reviewed (`lastReviewedAt = null`) come AFTER due cards (so review-mode prioritizes maintenance over learning).
- **`note.from_session_summary` LLM cost**: one `runOneShot` call per invocation. Bounded; fits the same pattern as Phase 7 misconception indexer + Phase 6 extractor.
- **No re-locking of "easy" cards**: rating "Easy" extends the interval per FSRS; never resets to learning.
- **Slow tests gated** behind `PRAXIS_RUN_SLOW_TESTS=1` — Phase 12 has no real-engine tests; integration test uses FakeEngine.

## Dependency direction (Phase 12 additions)

```
@praxis/core/types
  ├─ NEW: notes.ts (NoteBody union; CornellBody, FeynmanBody, OutlineBody, FreeBody; OutlineNode)
  ├─ NEW: flashcards.ts (Rating; FsrsScheduler port; FsrsState wrapper)
  ├─ MODIFIED: tool.ts — server-side NotesService + FlashcardsService
  ├─ MODIFIED: client.ts — NotesClient + FlashcardsClient
  └─ MODIFIED: index.ts — re-exports

@praxis/curriculum/src/scheduling/
  ├─ NEW: types.ts — re-export FsrsScheduler port from core/types
  ├─ NEW: fsrs-impl.ts — FsrsSchedulerImpl wrapping ts-fsrs
  ├─ NEW: config.ts — FSRS parameter defaults (single source of truth)
  └─ NEW: index.ts

@praxis/core/src/services
  ├─ NEW: notes-service.ts — NotesServiceImpl
  └─ NEW: flashcards-service.ts — FlashcardsServiceImpl

@praxis/tools/src/
  ├─ NEW: notes/{create,update,show,list,from-session-summary}.ts + index.ts
  ├─ NEW: notes/from-session-summary-prompt.ts (LLM prompt)
  └─ NEW: flashcards/{create,from-note,review,review-next}.ts + index.ts

@praxis/curriculum/src/modes/
  ├─ MODIFIED: teach.ts — toolNames adds note + flashcard tools
  ├─ MODIFIED: study-skills.ts (Phase 14 — exists or stub) — toolNames adds notes/cards
  └─ MODIFIED: fragments/tools.ts (teach mode) — describe new tools

@praxis/desktop/electron/main/
  ├─ MODIFIED: services.ts — wire FsrsSchedulerImpl + NotesServiceImpl + FlashcardsServiceImpl
  └─ MODIFIED: ipc-server.ts — praxis.notes.* + praxis.flashcards.* handlers

@praxis/client/src/services/
  ├─ NEW: notes-client.ts
  └─ NEW: flashcards-client.ts

@praxis/ui/src/
  ├─ NEW: routes/workspace.tsx + .module.css (route shell)
  ├─ NEW: routes/workspace/notes-list.tsx + .module.css
  ├─ NEW: routes/workspace/note-editor.tsx + .module.css
  ├─ NEW: routes/workspace/cards-list.tsx + .module.css
  ├─ NEW: routes/workspace/review.tsx + .module.css
  ├─ NEW: components/note-editor-cornell.tsx + .module.css
  ├─ NEW: components/note-editor-feynman.tsx + .module.css
  ├─ NEW: components/note-editor-outline.tsx + .module.css
  ├─ NEW: components/note-editor-free.tsx + .module.css
  ├─ NEW: components/note-card.tsx + .module.css (chat inline rendering)
  ├─ NEW: components/flashcard-review.tsx + .module.css (rating buttons + flip)
  ├─ NEW: components/flashcard-proposal.tsx + .module.css (per-card add/skip from from_note)
  ├─ NEW: hooks/use-notes.ts
  ├─ NEW: hooks/use-flashcards.ts
  ├─ NEW: hooks/use-due-cards.ts
  ├─ MODIFIED: routes/chat.tsx — "Take a note" affordance + inline review
  ├─ MODIFIED: hooks/use-streamed-send.ts — dispatch tool_result for note.show / flashcard.review_next
  ├─ MODIFIED: components/nav.tsx — Workspace link
  └─ MODIFIED: router.tsx — register /workspace routes

scripts/
  └─ NEW: db-cards-due.ts

docs/
  ├─ MODIFIED: ROADMAP.md (Phase 12 tightened)
  ├─ MODIFIED: CURRICULUM.md (notes + spaced repetition v1 sections)
  └─ MODIFIED: CONTRACT.md (NotesService + FlashcardsService surfaces)
```

`ts-fsrs` is added as a dependency in `@praxis/curriculum/package.json`.

No Python in Phase 12.

---

## Implementation Units

### Unit 1: Type contracts

**Files**:
- `packages/core/src/types/notes.ts` (new)
- `packages/core/src/types/flashcards.ts` (new)
- `packages/core/src/types/tool.ts` (modified — server-side NotesService + FlashcardsService)
- `packages/core/src/types/client.ts` (modified — client-side NotesClient + FlashcardsClient)
- `packages/core/src/types/index.ts` (re-export)

```typescript
// packages/core/src/types/notes.ts (new)

import type { NoteId } from "./ids.js";

/**
 * NoteBody — discriminated union over the four supported text formats.
 * Sketch is reserved for Phase 13 (tldraw integration).
 *
 * Each value field can contain markdown — the type enforces structure (which
 * region holds what), not content format. Students write naturally in any region.
 */
export type NoteBody =
  | { kind: "cornell"; questions: string[]; details: string[]; summary: string }
  | { kind: "feynman"; explanation: string; followUps: string[] }
  | { kind: "outline"; root: OutlineNode }
  | { kind: "free"; text: string };

/** Recursive outline node. Leaves have no children. */
export interface OutlineNode {
  text: string;
  children: OutlineNode[];
}

/**
 * Phase 12 helper for note bodies. Parses the JSON body string from the DB
 * `notes.body` column based on `notes.format`. Throws on malformed JSON or
 * format/body mismatch.
 */
export function parseNoteBody(format: "cornell" | "feynman" | "outline" | "free" | "sketch", bodyJson: string | null): NoteBody;
export function serializeNoteBody(body: NoteBody): string;
```

```typescript
// packages/core/src/types/flashcards.ts (new)

import type { Timestamp } from "./common.js";
import type { Logger } from "./common.js";

/** Rating per FSRS-5 — four ratings the user picks during review. */
export type Rating = "again" | "hard" | "good" | "easy";

/**
 * Wrapper over the algorithm-specific state. Phase 1 declared the shape
 * (`ReviewState`); Phase 12 implements it for FSRS.
 */
export interface FsrsState {
  /** ts-fsrs's internal Card object — opaque to Praxis core. */
  state: Record<string, unknown>;
  nextReviewAt?: Timestamp;
  lastReviewedAt?: Timestamp;
  /** Total reviews logged. Useful for UI ("first review!" badges). */
  reps: number;
  /** Total times the card was rated "again". */
  lapses: number;
}

/**
 * Pure-function port. Wraps ts-fsrs (or a future custom impl).
 * Phase 14 may A/B-test alternate implementations.
 */
export interface FsrsScheduler {
  /** Initial state for a new card. lastReviewedAt is undefined; nextReviewAt is now. */
  initial(now: Timestamp): FsrsState;

  /**
   * Apply a rating and compute the new state.
   * `now` is the wall clock at the moment of review (caller passes Date.now()).
   */
  review(input: { state: FsrsState; rating: Rating; now: Timestamp }): FsrsState;

  /**
   * Predict the four next intervals (one per rating) without committing.
   * Used by the UI to show "Easy → 14 days" labels on the rating buttons.
   */
  preview(input: { state: FsrsState; now: Timestamp }): Record<Rating, { nextReviewAt: Timestamp }>;
}
```

```typescript
// packages/core/src/types/tool.ts — additions

/** Server-side NotesService. Methods take studentId where applicable. */
export interface NotesService {
  create(input: {
    studentId: StudentId;
    format: "cornell" | "feynman" | "outline" | "free";
    body: NoteBody;
    context?: NoteContext;
  }): Promise<Note>;

  update(input: {
    studentId: StudentId;
    noteId: NoteId;
    body: NoteBody;
  }): Promise<Note>;

  get(input: { studentId: StudentId; noteId: NoteId }): Promise<Note | null>;

  list(input: {
    studentId: StudentId;
    courseId?: CourseId;
    lessonId?: LessonId;
    format?: "cornell" | "feynman" | "outline" | "free";
    limit?: number;
  }): Promise<Note[]>;

  delete(input: { studentId: StudentId; noteId: NoteId }): Promise<void>;
}

/** Server-side FlashcardsService. */
export interface FlashcardsService {
  create(input: {
    studentId: StudentId;
    front: string;
    back: string;
    conceptId?: ConceptId;
    source?: { kind: "authored" | "extracted" | "user-created"; ref?: string };
  }): Promise<Flashcard>;

  update(input: {
    studentId: StudentId;
    flashcardId: FlashcardId;
    patch: Partial<Pick<Flashcard, "front" | "back" | "conceptId">>;
  }): Promise<Flashcard>;

  get(input: { studentId: StudentId; flashcardId: FlashcardId }): Promise<Flashcard | null>;

  list(input: {
    studentId: StudentId;
    conceptId?: ConceptId;
    due?: boolean;
    limit?: number;
  }): Promise<Flashcard[]>;

  delete(input: { studentId: StudentId; flashcardId: FlashcardId }): Promise<void>;

  /**
   * Record a rating; compute the new FSRS state; persist; return the new card row.
   */
  review(input: {
    studentId: StudentId;
    flashcardId: FlashcardId;
    rating: Rating;
  }): Promise<{ flashcard: Flashcard; nextReviewAt: Timestamp }>;

  /** Total count of cards currently due (`nextReviewAt <= now`). */
  dueCount(input: { studentId: StudentId }): Promise<number>;
}

export interface ToolServices {
  // ... existing ...
  notes: NotesService;        // ← Phase 12
  flashcards: FlashcardsService; // ← Phase 12
  fsrsScheduler: FsrsScheduler;  // ← Phase 12 (used by FlashcardsServiceImpl + tools)
}
```

```typescript
// packages/core/src/types/client.ts — additions

/** Client-side NotesClient (no studentId on methods; resolved server-side). */
export interface NotesClient {
  create(input: {
    format: "cornell" | "feynman" | "outline" | "free";
    body: NoteBody;
    context?: NoteContext;
  }): Promise<Note>;

  update(input: { noteId: NoteId; body: NoteBody }): Promise<Note>;
  get(noteId: NoteId): Promise<Note | null>;
  list(input?: { courseId?: CourseId; lessonId?: LessonId; format?: "cornell" | "feynman" | "outline" | "free"; limit?: number }): Promise<Note[]>;
  delete(noteId: NoteId): Promise<void>;
}

export interface FlashcardsClient {
  create(input: { front: string; back: string; conceptId?: ConceptId; source?: { kind: "authored" | "extracted" | "user-created"; ref?: string } }): Promise<Flashcard>;
  update(input: { flashcardId: FlashcardId; patch: Partial<Pick<Flashcard, "front" | "back" | "conceptId">> }): Promise<Flashcard>;
  get(flashcardId: FlashcardId): Promise<Flashcard | null>;
  list(input?: { conceptId?: ConceptId; due?: boolean; limit?: number }): Promise<Flashcard[]>;
  delete(flashcardId: FlashcardId): Promise<void>;
  review(input: { flashcardId: FlashcardId; rating: Rating }): Promise<{ flashcard: Flashcard; nextReviewAt: Timestamp }>;
  dueCount(): Promise<number>;
}

export interface PraxisClient {
  // ... existing ...
  notes: NotesClient;        // ← Phase 12
  flashcards: FlashcardsClient; // ← Phase 12
}
```

**Implementation notes**:
- `parseNoteBody` is a runtime helper (not just a type) — exported alongside the type union. Tests verify round-trip for every format.
- `Note.body` field on the existing `Note` interface (Phase 1) stays as `string?` for backward compat; Phase 12 always populates it as a JSON string for non-sketch formats. Reading code calls `parseNoteBody(format, body)` to get the typed structure.
- `OutlineNode` is recursive; tests verify nested-tree round-trip.

**Acceptance criteria**:
- [ ] `parseNoteBody("cornell", JSON.stringify({...}))` returns a typed `CornellBody`.
- [ ] `parseNoteBody("free", JSON.stringify({text: "..."}))` returns `{kind: "free", text: "..."}`.
- [ ] Format/body mismatch (e.g., Cornell JSON parsed as Feynman) throws with descriptive error.
- [ ] All new types re-exported from `packages/core/src/types/index.ts`.

---

### Unit 2: FSRS scheduler implementation

**Files**:
- `packages/curriculum/src/scheduling/types.ts` (new — re-exports + helpers)
- `packages/curriculum/src/scheduling/config.ts` (new)
- `packages/curriculum/src/scheduling/fsrs-impl.ts` (new)
- `packages/curriculum/src/scheduling/index.ts` (new)
- `packages/curriculum/package.json` (modified — add `ts-fsrs` dep)

```typescript
// config.ts — Single Source of Truth for FSRS parameters

/**
 * FSRS-5 default parameters. Tunable; Phase 14 may swap or per-student override.
 */
export const FSRS_DEFAULTS = {
  /** Request retention: target retention rate (0..1). 0.9 = 90% recall. */
  request_retention: 0.9,
  /** Maximum interval in days. Caps reviews from spreading too far. */
  maximum_interval: 365 * 5,
  /** ts-fsrs's `w` parameter — 19 weights for the FSRS-5 model. Defaults from the library. */
  // The library's default `w` is best left to the library; we don't hardcode it.
  enable_fuzz: true,
} as const;
```

```typescript
// fsrs-impl.ts — wraps ts-fsrs

import { fsrs, generatorParameters, Card, Rating as TsFsrsRating } from "ts-fsrs";
import type {
  FsrsScheduler,
  FsrsState,
  Rating,
  Timestamp,
} from "@praxis/core/types";
import { FSRS_DEFAULTS } from "./config.js";

/**
 * FSRS-5 scheduler implementation backed by ts-fsrs.
 *
 * The library's Card type is the canonical state shape; Praxis's FsrsState
 * wraps it with `nextReviewAt` / `lastReviewedAt` / `reps` / `lapses` for
 * easy querying.
 */
export class FsrsSchedulerImpl implements FsrsScheduler {
  private readonly engine = fsrs(generatorParameters(FSRS_DEFAULTS));

  initial(now: Timestamp): FsrsState {
    const card: Card = {
      due: new Date(now),
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0, // New
      last_review: undefined,
    };
    return {
      state: card as unknown as Record<string, unknown>,
      nextReviewAt: now,
      reps: 0,
      lapses: 0,
    };
  }

  review(input: { state: FsrsState; rating: Rating; now: Timestamp }): FsrsState {
    const card = input.state.state as unknown as Card;
    const tsRating = ratingToTsFsrs(input.rating);
    const result = this.engine.next(card, new Date(input.now), tsRating);
    const nextCard = result.card;
    const nextReviewAt = nextCard.due.getTime() as Timestamp;
    return {
      state: nextCard as unknown as Record<string, unknown>,
      nextReviewAt,
      lastReviewedAt: input.now,
      reps: nextCard.reps,
      lapses: nextCard.lapses,
    };
  }

  preview(input: { state: FsrsState; now: Timestamp }): Record<Rating, { nextReviewAt: Timestamp }> {
    const card = input.state.state as unknown as Card;
    const previews = this.engine.repeat(card, new Date(input.now));
    return {
      again: { nextReviewAt: previews[TsFsrsRating.Again].card.due.getTime() as Timestamp },
      hard: { nextReviewAt: previews[TsFsrsRating.Hard].card.due.getTime() as Timestamp },
      good: { nextReviewAt: previews[TsFsrsRating.Good].card.due.getTime() as Timestamp },
      easy: { nextReviewAt: previews[TsFsrsRating.Easy].card.due.getTime() as Timestamp },
    };
  }
}

function ratingToTsFsrs(r: Rating): TsFsrsRating {
  switch (r) {
    case "again": return TsFsrsRating.Again;
    case "hard": return TsFsrsRating.Hard;
    case "good": return TsFsrsRating.Good;
    case "easy": return TsFsrsRating.Easy;
  }
}
```

**Implementation notes**:
- ts-fsrs's API uses `Date` objects; Praxis uses `Timestamp` (millisecond epoch). Convert at the boundary.
- The wrapper's `state` field stores the ts-fsrs `Card` object opaquely. If Phase 14 swaps schedulers, the wrapper survives; only the inner shape changes.
- `preview` is pure (doesn't mutate state); used by the UI to label rating buttons.

**Acceptance criteria**:
- [ ] `initial(now)` returns a state with `nextReviewAt: now` and `reps: 0`.
- [ ] `review({state, rating: "good"})` returns a state with `nextReviewAt > now`.
- [ ] `review` with rating "again" increments `lapses`.
- [ ] `preview` returns four future timestamps; "easy" > "good" > "hard" > "again" in nextReviewAt.
- [ ] Pure: same inputs produce same outputs (modulo `enable_fuzz` randomness — disable in tests via constructor option).

---

### Unit 3: `NotesServiceImpl`

**File**: `packages/core/src/services/notes-service.ts` (new)

```typescript
import { v7 as uuidv7 } from "uuid";
import { eq, and, desc } from "drizzle-orm";
import { notes } from "@praxis/artifacts/schema";
import type { PraxisDb } from "../db/index.js";
import type { Note, NoteBody, NoteContext, NoteId, NotesService, StudentId, Logger, CourseId, LessonId, Timestamp } from "../types/index.js";
import { brandId, parseNoteBody, serializeNoteBody } from "../types/index.js";

export interface NotesServiceDeps {
  db: PraxisDb;
  log: Logger;
}

export class NotesServiceImpl implements NotesService {
  constructor(private readonly deps: NotesServiceDeps) {}

  async create(input: {
    studentId: StudentId;
    format: "cornell" | "feynman" | "outline" | "free";
    body: NoteBody;
    context?: NoteContext;
  }): Promise<Note> {
    if (input.body.kind !== input.format) {
      throw new Error(`Note format '${input.format}' does not match body kind '${input.body.kind}'`);
    }
    const id = uuidv7();
    const now = new Date();
    this.deps.db.insert(notes).values({
      id,
      studentId: input.studentId,
      contextJson: input.context ?? {},
      format: input.format,
      body: serializeNoteBody(input.body),
      sketchSceneJson: null,
      linksJson: [],
      createdAt: now,
      updatedAt: now,
    }).run();
    const result = await this.get({ studentId: input.studentId, noteId: brandId<"NoteId">(id) });
    if (!result) throw new Error("note disappeared after insert");
    return result;
  }

  async update(input: { studentId: StudentId; noteId: NoteId; body: NoteBody }): Promise<Note> {
    const existing = await this.get({ studentId: input.studentId, noteId: input.noteId });
    if (!existing) throw new Error(`Note not found: ${input.noteId}`);
    if (input.body.kind !== existing.format) {
      throw new Error(`Cannot change note format on update; tried to write '${input.body.kind}' to '${existing.format}' note`);
    }
    const now = new Date();
    this.deps.db.update(notes).set({
      body: serializeNoteBody(input.body),
      updatedAt: now,
    }).where(eq(notes.id, input.noteId)).run();
    const updated = await this.get({ studentId: input.studentId, noteId: input.noteId });
    if (!updated) throw new Error("note disappeared after update");
    return updated;
  }

  async get(input: { studentId: StudentId; noteId: NoteId }): Promise<Note | null> {
    const row = this.deps.db.select().from(notes)
      .where(and(eq(notes.id, input.noteId), eq(notes.studentId, input.studentId)))
      .get();
    if (!row) return null;
    return rowToNote(row);
  }

  async list(input: { studentId: StudentId; courseId?: CourseId; lessonId?: LessonId; format?: "cornell" | "feynman" | "outline" | "free"; limit?: number }): Promise<Note[]> {
    // Build a filtered query; default limit 100.
    const limit = input.limit ?? 100;
    const rows = this.deps.db.select().from(notes)
      .where(and(
        eq(notes.studentId, input.studentId),
        ...(input.format ? [eq(notes.format, input.format)] : []),
      ))
      .orderBy(desc(notes.updatedAt))
      .limit(limit)
      .all();
    let result = rows.map(rowToNote);
    // Filter by context fields in app code (JSON column).
    if (input.courseId) result = result.filter((n) => n.context.courseId === input.courseId);
    if (input.lessonId) result = result.filter((n) => n.context.lessonId === input.lessonId);
    return result;
  }

  async delete(input: { studentId: StudentId; noteId: NoteId }): Promise<void> {
    this.deps.db.delete(notes)
      .where(and(eq(notes.id, input.noteId), eq(notes.studentId, input.studentId)))
      .run();
  }
}

function rowToNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id as NoteId,
    studentId: row.studentId as StudentId,
    context: row.contextJson as NoteContext,
    format: row.format,
    ...(row.body !== null && { body: row.body }),
    ...(row.sketchSceneJson !== null && { sketchScene: row.sketchSceneJson as never }),
    links: row.linksJson as ReturnType<typeof rowToNote>["links"],
    createdAt: row.createdAt.getTime() as Timestamp,
    updatedAt: row.updatedAt.getTime() as Timestamp,
  };
}
```

**Implementation notes**:
- Format validation at create + update — body kind must match format.
- Format change on update is rejected (would require re-mapping body shapes; not Phase 12 scope).
- `list` filters by JSON-column fields (context.courseId, context.lessonId) in app code rather than constructing a JSON path query (Drizzle's SQLite JSON support is limited).
- The existing `Note` type from Phase 1 has `body?: string` — Phase 12 always populates it for non-sketch formats. The application reads `note.body` (string) and parses via `parseNoteBody(note.format, note.body)` to get the typed structure.

**Acceptance criteria**:
- [ ] `create` rejects body/format mismatch.
- [ ] `update` rejects format change.
- [ ] `get` returns null for unknown noteId.
- [ ] `list` orders by `updatedAt desc`; respects format + course/lesson filters.
- [ ] `delete` removes only the matching row (studentId-scoped).

---

### Unit 4: `FlashcardsServiceImpl`

**File**: `packages/core/src/services/flashcards-service.ts` (new)

```typescript
import { v7 as uuidv7 } from "uuid";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { flashcards } from "@praxis/artifacts/schema";
import type { PraxisDb } from "../db/index.js";
import type {
  ConceptId,
  Flashcard,
  FlashcardId,
  FlashcardsService,
  FsrsScheduler,
  FsrsState,
  Logger,
  Rating,
  StudentId,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface FlashcardsServiceDeps {
  db: PraxisDb;
  log: Logger;
  scheduler: FsrsScheduler;
}

export class FlashcardsServiceImpl implements FlashcardsService {
  constructor(private readonly deps: FlashcardsServiceDeps) {}

  async create(input: {
    studentId: StudentId;
    front: string;
    back: string;
    conceptId?: ConceptId;
    source?: { kind: "authored" | "extracted" | "user-created"; ref?: string };
  }): Promise<Flashcard> {
    const id = uuidv7();
    const now = Date.now() as Timestamp;
    const initialState = this.deps.scheduler.initial(now);
    const reviewState = {
      algorithm: "fsrs" as const,
      ...initialState,
    };
    this.deps.db.insert(flashcards).values({
      id,
      studentId: input.studentId,
      conceptId: input.conceptId ?? null,
      front: input.front,
      back: input.back,
      reviewStateJson: reviewState,
      sourceJson: input.source ?? { kind: "user-created" },
      nextReviewAt: new Date(now),
    }).run();
    const created = await this.get({ studentId: input.studentId, flashcardId: brandId<"FlashcardId">(id) });
    if (!created) throw new Error("flashcard disappeared after insert");
    return created;
  }

  async update(input: { studentId: StudentId; flashcardId: FlashcardId; patch: Partial<Pick<Flashcard, "front" | "back" | "conceptId">> }): Promise<Flashcard> {
    this.deps.db.update(flashcards).set({
      ...(input.patch.front !== undefined && { front: input.patch.front }),
      ...(input.patch.back !== undefined && { back: input.patch.back }),
      ...(input.patch.conceptId !== undefined && { conceptId: input.patch.conceptId }),
    }).where(and(eq(flashcards.id, input.flashcardId), eq(flashcards.studentId, input.studentId))).run();
    const updated = await this.get({ studentId: input.studentId, flashcardId: input.flashcardId });
    if (!updated) throw new Error(`flashcard not found: ${input.flashcardId}`);
    return updated;
  }

  async get(input: { studentId: StudentId; flashcardId: FlashcardId }): Promise<Flashcard | null> {
    const row = this.deps.db.select().from(flashcards)
      .where(and(eq(flashcards.id, input.flashcardId), eq(flashcards.studentId, input.studentId)))
      .get();
    if (!row) return null;
    return rowToFlashcard(row);
  }

  async list(input: { studentId: StudentId; conceptId?: ConceptId; due?: boolean; limit?: number }): Promise<Flashcard[]> {
    const limit = input.limit ?? 100;
    const now = new Date();
    const conditions = [eq(flashcards.studentId, input.studentId)];
    if (input.conceptId) conditions.push(eq(flashcards.conceptId, input.conceptId));
    if (input.due) conditions.push(lte(flashcards.nextReviewAt, now));
    const rows = this.deps.db.select().from(flashcards)
      .where(and(...conditions))
      .orderBy(asc(flashcards.nextReviewAt))
      .limit(limit)
      .all();
    return rows.map(rowToFlashcard);
  }

  async delete(input: { studentId: StudentId; flashcardId: FlashcardId }): Promise<void> {
    this.deps.db.delete(flashcards)
      .where(and(eq(flashcards.id, input.flashcardId), eq(flashcards.studentId, input.studentId)))
      .run();
  }

  async review(input: { studentId: StudentId; flashcardId: FlashcardId; rating: Rating }): Promise<{ flashcard: Flashcard; nextReviewAt: Timestamp }> {
    const card = await this.get({ studentId: input.studentId, flashcardId: input.flashcardId });
    if (!card) throw new Error(`flashcard not found: ${input.flashcardId}`);
    const now = Date.now() as Timestamp;
    const currentState: FsrsState = card.reviewState.state as FsrsState; // wrapped state
    const newState = this.deps.scheduler.review({ state: currentState, rating: input.rating, now });
    const newReviewState = {
      algorithm: "fsrs" as const,
      ...newState,
    };
    this.deps.db.update(flashcards).set({
      reviewStateJson: newReviewState,
      nextReviewAt: new Date(newState.nextReviewAt!),
    }).where(eq(flashcards.id, input.flashcardId)).run();
    const updated = await this.get({ studentId: input.studentId, flashcardId: input.flashcardId });
    if (!updated) throw new Error("flashcard disappeared after review");
    return { flashcard: updated, nextReviewAt: newState.nextReviewAt! };
  }

  async dueCount(input: { studentId: StudentId }): Promise<number> {
    const now = new Date();
    const rows = this.deps.db.select({ count: sql<number>`count(*)` })
      .from(flashcards)
      .where(and(eq(flashcards.studentId, input.studentId), lte(flashcards.nextReviewAt, now)))
      .get();
    return rows?.count ?? 0;
  }
}

function rowToFlashcard(row: typeof flashcards.$inferSelect): Flashcard {
  return {
    id: row.id as FlashcardId,
    studentId: row.studentId as StudentId,
    ...(row.conceptId !== null && { conceptId: row.conceptId as ConceptId }),
    front: row.front,
    back: row.back,
    reviewState: row.reviewStateJson as Flashcard["reviewState"],
    source: row.sourceJson as Flashcard["source"],
  };
}
```

**Implementation notes**:
- The `reviewState` field on `Flashcard` (Phase 1) wraps `algorithm + state + nextReviewAt + lastReviewedAt`. Phase 12 stores `algorithm: "fsrs"` and the FSRS state shape inside `state`.
- `nextReviewAt` is denormalized to its own column for efficient `due` queries (Phase 1 already declared the column).
- `list({due: true})` orders by `nextReviewAt asc` — most-overdue first.

**Acceptance criteria**:
- [ ] `create` produces a card with `nextReviewAt: now` (immediately due).
- [ ] `review` advances `nextReviewAt` for "good" rating.
- [ ] `dueCount` returns the number of cards with `nextReviewAt <= now`.
- [ ] `list({due: true})` returns only currently-due cards, oldest-first.
- [ ] All methods are studentId-scoped.

---

### Unit 5: Note tools

**Files**:
- `packages/tools/src/notes/create.ts`
- `packages/tools/src/notes/update.ts`
- `packages/tools/src/notes/show.ts`
- `packages/tools/src/notes/list.ts`
- `packages/tools/src/notes/from-session-summary.ts`
- `packages/tools/src/notes/from-session-summary-prompt.ts`
- `packages/tools/src/notes/index.ts` (barrel + `NOTE_TOOLS`)

```typescript
// notes/create.ts

import { brandId, type ToolContext, type ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const NoteBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cornell"), questions: z.array(z.string()), details: z.array(z.string()), summary: z.string() }),
  z.object({ kind: z.literal("feynman"), explanation: z.string().min(1), followUps: z.array(z.string()) }),
  z.object({ kind: z.literal("outline"), root: z.lazy(() => OutlineNodeSchema) }),
  z.object({ kind: z.literal("free"), text: z.string().min(1) }),
]);

const OutlineNodeSchema: z.ZodType<{ text: string; children: unknown[] }> = z.lazy(() => z.object({
  text: z.string(),
  children: z.array(OutlineNodeSchema),
}));

const InputSchema = z.object({
  format: z.enum(["cornell", "feynman", "outline", "free"]),
  body: NoteBodySchema,
  context: z.object({
    courseId: z.string().optional(),
    lessonId: z.string().optional(),
    sessionId: z.string().optional(),
    conceptIds: z.array(z.string()).optional(),
  }).optional(),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  noteId: z.string(),
});

export const createNoteTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "note.create",
  description: "Create a structured note for the student in one of four formats: cornell (questions + details + summary), feynman (explanation + follow-ups), outline (recursive bullet tree), or free (plain text). Each value field can contain markdown. Pass context.courseId, context.lessonId, context.sessionId, and context.conceptIds to link the note for later filtering.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const note = await ctx.services.notes.create({
      studentId: ctx.studentId,
      format: args.format,
      body: args.body as never,
      ...(args.context && { context: args.context as never }),
    });
    return { ok: true, noteId: note.id };
  },
};
```

```typescript
// notes/show.ts

const InputSchema = z.object({ noteId: z.string() });
const OutputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok"), note: z.unknown() }),
  z.object({ kind: z.literal("not_found") }),
]);

export const showNoteTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "note.show",
  description: "Display a note inline in chat. The student's UI renders the note's structured body (Cornell columns, Feynman prose, Outline tree, or Free text). Use this when the student asks you to show a previous note.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext) {
    const note = await ctx.services.notes.get({ studentId: ctx.studentId, noteId: brandId<"NoteId">(args.noteId) });
    if (!note) return { kind: "not_found" as const };
    return { kind: "ok" as const, note };
  },
};
```

```typescript
// notes/from-session-summary.ts

import { runOneShot } from "@praxis/engines";
import { extractJsonBlock } from "@praxis/core/services";
import { FROM_SESSION_SUMMARY_PROMPT } from "./from-session-summary-prompt.js";
import { z } from "zod";

const InputSchema = z.object({
  sessionId: z.string(),
  format: z.enum(["cornell", "feynman", "outline", "free"]),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  noteId: z.string(),
});

const NoteBodyOutputSchema = NoteBodySchema; // reuse from create.ts

export const fromSessionSummaryTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "note.from_session_summary",
  description: "Generate a structured note from the recent session's transcript. Calls a fresh one-shot LLM session that reads the last N turns of the session and produces a structured NoteBody per the requested format. Returns the new note's id; the student can edit afterward.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    // 1. Read the last N events from the session via memory.episodic.
    const events: unknown[] = [];
    for await (const ev of ctx.services.memory.episodic({ studentId: ctx.studentId, sessionId: args.sessionId as never })) {
      events.push(ev);
      if (events.length >= 50) break;
    }
    if (events.length === 0) {
      throw new Error(`No episodic events found for session ${args.sessionId}`);
    }

    // 2. Compose the user message — transcript as text + format request.
    const userMessage = composeUserMessage(events, args.format);

    // 3. Run the one-shot LLM call.
    const engine = ctx.services.engineResolver(); // assumes ToolServices.engineResolver exists; otherwise add to deps
    const result = runOneShot(engine, {
      systemPrompt: FROM_SESSION_SUMMARY_PROMPT,
      tools: { list: () => [], dispatch: noopDispatch },
      maxSteps: 1,
    }, userMessage);

    let assistantText = "";
    for await (const ev of result) {
      if (ev.type === "model_message") assistantText += ev.content;
      if (ev.type === "error") throw new Error(`from_session_summary engine error: ${ev.error.message}`);
    }

    // 4. Parse + validate.
    const parsed = NoteBodyOutputSchema.safeParse(extractJsonBlock(assistantText));
    if (!parsed.success) {
      throw new Error(`from_session_summary output failed validation: ${parsed.error.message}`);
    }
    if (parsed.data.kind !== args.format) {
      throw new Error(`from_session_summary returned ${parsed.data.kind}, expected ${args.format}`);
    }

    // 5. Persist via NotesService.
    const note = await ctx.services.notes.create({
      studentId: ctx.studentId,
      format: args.format,
      body: parsed.data,
      context: { sessionId: args.sessionId },
    });
    return { ok: true, noteId: note.id };
  },
};
```

```typescript
// from-session-summary-prompt.ts

export const FROM_SESSION_SUMMARY_PROMPT = `You are summarizing a tutoring-session transcript into a structured study note.

The user will provide the transcript and a target format (cornell, feynman, outline, or free). Output a single JSON object (in a \`\`\`json fence) matching the target format:

cornell: { "kind": "cornell", "questions": ["..."], "details": ["..."], "summary": "..." }
  — questions and details are PARALLEL arrays; questions[i] should be answered by details[i].
  — typical: 3-7 questions; one summary sentence at the bottom.

feynman: { "kind": "feynman", "explanation": "...", "followUps": ["...", "..."] }
  — explanation is a plain-language paragraph (as if explaining to someone who's never seen it).
  — followUps are Socratic questions that probe gaps.

outline: { "kind": "outline", "root": { "text": "...", "children": [...] } }
  — recursive tree; each node has text + children array.
  — root usually has the topic; children are major points; grandchildren are details.

free: { "kind": "free", "text": "..." }
  — plain prose; markdown allowed.

Rules:
- Stay close to the transcript content. Don't invent facts the student didn't engage with.
- Use the student's own words where possible.
- Markdown is allowed inside any value field.
- Do not include any prose outside the JSON fence.`;
```

`note.update`, `note.list` follow similar patterns. `NOTE_TOOLS` aggregates them.

**Acceptance criteria**:
- [ ] `note.create` validates body shape per format via Zod.
- [ ] `note.show` returns the structured note for UI rendering.
- [ ] `note.list` returns the student's notes filtered by optional course/lesson/format.
- [ ] `note.from_session_summary` produces a structured body and persists.
- [ ] Engine errors during `from_session_summary` surface as tool errors.

---

### Unit 6: Flashcard tools

**Files**:
- `packages/tools/src/flashcards/create.ts`
- `packages/tools/src/flashcards/from-note.ts`
- `packages/tools/src/flashcards/review.ts`
- `packages/tools/src/flashcards/review-next.ts`
- `packages/tools/src/flashcards/index.ts`

```typescript
// flashcards/create.ts

const InputSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  conceptId: z.string().optional(),
});
const OutputSchema = z.object({ ok: z.literal(true), flashcardId: z.string() });

export const createFlashcardTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "flashcard.create",
  description: "Create a flashcard with front + back text. Optional conceptId links to the course's concept graph for cross-referenced display in the progress map.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx) {
    const card = await ctx.services.flashcards.create({
      studentId: ctx.studentId,
      front: args.front,
      back: args.back,
      ...(args.conceptId && { conceptId: brandId<"ConceptId">(args.conceptId) }),
      source: { kind: "authored" },
    });
    return { ok: true, flashcardId: card.id };
  },
};
```

```typescript
// flashcards/from-note.ts

const InputSchema = z.object({
  noteId: z.string(),
  /** When omitted, propose for the whole note. */
  sectionIndex: z.number().int().nonnegative().optional(),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  noteId: z.string(),
  proposed: z.array(z.object({
    front: z.string(),
    back: z.string(),
  })),
});

export const fromNoteTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "flashcard.from_note",
  description: "Propose flashcards from a note's structured body. Cornell: each (questions[i], details[i]) pair becomes a card. Feynman: explanation→one card; each followUp→one card. Outline: each leaf node→one card (parent path as front). Free: not supported (plain text has no structure to extract from). Returns proposed cards; the UI prompts the student to confirm each before adding.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"], // proposal only — no writes
  async handler(args, ctx) {
    const note = await ctx.services.notes.get({ studentId: ctx.studentId, noteId: brandId<"NoteId">(args.noteId) });
    if (!note) throw new Error(`note not found: ${args.noteId}`);
    const body = parseNoteBody(note.format, note.body ?? null);
    const proposed = proposeFlashcardsFromBody(body, args.sectionIndex);
    return { ok: true, noteId: note.id, proposed };
  },
};

function proposeFlashcardsFromBody(body: NoteBody, sectionIndex?: number): Array<{ front: string; back: string }> {
  switch (body.kind) {
    case "cornell": {
      const cards: Array<{ front: string; back: string }> = [];
      const indices = sectionIndex !== undefined ? [sectionIndex] : body.questions.map((_, i) => i);
      for (const i of indices) {
        const q = body.questions[i]?.trim();
        const d = body.details[i]?.trim();
        if (q && d) cards.push({ front: q, back: d });
      }
      return cards;
    }
    case "feynman": {
      const cards = [{ front: "Explain in your own words.", back: body.explanation }];
      cards.push(...body.followUps.map((q) => ({ front: q, back: "(no answer authored — fill in during review)" })));
      return cards;
    }
    case "outline": {
      const out: Array<{ front: string; back: string }> = [];
      const walk = (node: OutlineNode, ancestors: string[]) => {
        if (node.children.length === 0) {
          // leaf — front is the path; back is the leaf text
          out.push({ front: ancestors.join(" > ") || "(root)", back: node.text });
        } else {
          for (const child of node.children) walk(child, [...ancestors, node.text]);
        }
      };
      walk(body.root, []);
      return out;
    }
    case "free":
      return []; // can't extract structure from free text
  }
}
```

```typescript
// flashcards/review.ts

const InputSchema = z.object({
  flashcardId: z.string(),
  rating: z.enum(["again", "hard", "good", "easy"]),
});
const OutputSchema = z.object({
  ok: z.literal(true),
  flashcardId: z.string(),
  nextReviewAt: z.number(),
  reps: z.number().int(),
});

export const reviewFlashcardTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "flashcard.review",
  description: "Record a review rating for a flashcard. The FSRS scheduler computes the next review date. Use this after the student has rated a card during inline review.",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: ["memory.write"],
  async handler(args, ctx) {
    const result = await ctx.services.flashcards.review({
      studentId: ctx.studentId,
      flashcardId: brandId<"FlashcardId">(args.flashcardId),
      rating: args.rating,
    });
    return {
      ok: true,
      flashcardId: result.flashcard.id,
      nextReviewAt: result.nextReviewAt,
      reps: result.flashcard.reviewState.reps as number,
    };
  },
};
```

```typescript
// flashcards/review-next.ts

const InputSchema = z.object({
  count: z.number().int().positive().max(20).optional(),
});

const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    cards: z.array(z.object({
      flashcardId: z.string(),
      front: z.string(),
      conceptId: z.string().nullable(),
      preview: z.object({
        again: z.number(),
        hard: z.number(),
        good: z.number(),
        easy: z.number(),
      }),
    })),
  }),
  z.object({ kind: z.literal("none_due") }),
]);

export const reviewNextTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "flashcard.review_next",
  description: "Fetch the next due flashcards for inline review. Returns front + conceptId + preview of all four next-review-dates (so the UI can label rating buttons). Defaults to 1 card; cap 20 per call. Use during chat for 'warm up before today's lesson' or 'quick review break'.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx) {
    const cards = await ctx.services.flashcards.list({
      studentId: ctx.studentId,
      due: true,
      limit: args.count ?? 1,
    });
    if (cards.length === 0) return { kind: "none_due" as const };
    const now = Date.now() as Timestamp;
    const out = cards.map((c) => {
      const preview = ctx.services.fsrsScheduler.preview({
        state: c.reviewState.state as never,
        now,
      });
      return {
        flashcardId: c.id,
        front: c.front,
        conceptId: c.conceptId ?? null,
        preview: {
          again: preview.again.nextReviewAt,
          hard: preview.hard.nextReviewAt,
          good: preview.good.nextReviewAt,
          easy: preview.easy.nextReviewAt,
        },
      };
    });
    return { kind: "ok" as const, cards: out };
  },
};
```

**Acceptance criteria**:
- [ ] `flashcard.create` produces an immediately-due card.
- [ ] `flashcard.from_note` for Cornell pairs `questions[i]` with `details[i]`.
- [ ] `flashcard.from_note` for Free returns empty array (graceful).
- [ ] `flashcard.review` advances `nextReviewAt`.
- [ ] `flashcard.review_next` returns cards ordered by oldest-due-first.
- [ ] `flashcard.review_next` returns `kind: "none_due"` when no cards are due.

---

### Unit 7: Mode + tools fragment updates

**Files**:
- `packages/curriculum/src/modes/teach.ts` (modified)
- `packages/curriculum/src/modes/fragments/tools.ts` (modified)

`teachMode.toolNames` adds: `note.create`, `note.update`, `note.show`, `note.list`, `note.from_session_summary`, `flashcard.create`, `flashcard.from_note`, `flashcard.review`, `flashcard.review_next`.

The teach-mode tools fragment gets a section:

```
Notes & flashcards:
- note.create — create a structured note (cornell, feynman, outline, or free format). Use when the student asks to take notes, or when you want to surface a structured summary.
- note.show — display an existing note inline in chat. Use when the student asks "what was that note about X?".
- note.from_session_summary — generate a note from the recent session's transcript. Use at session end if the student wants a study artifact.
- flashcard.create — author a flashcard directly. Use when the student says "make a flashcard for X".
- flashcard.from_note — propose flashcards extracted from a note's structure. The UI prompts the student to confirm each.
- flashcard.review_next — fetch due cards for inline review. Use for "quick warm-up" requests (3-5 cards).
- flashcard.review — record a rating after the student responds. The UI dispatches this on click.
```

**Acceptance criteria**:
- [ ] `teachMode.toolNames` contains all 9 new note + flashcard tools.
- [ ] Tools fragment text mentions each new tool with use-case guidance.

---

### Unit 8: ServiceDeps + buildServices wiring

**Files**:
- `packages/core/src/services/types.ts` (modified — `ServiceDeps.toolServices.{notes, flashcards, fsrsScheduler}`)
- `packages/desktop/electron/main/services.ts` (modified)
- `packages/core/src/services/index.ts` (modified — export new services)

```typescript
// services.ts additions

import { FsrsSchedulerImpl } from "@praxis/curriculum/scheduling";
import { FlashcardsServiceImpl, NotesServiceImpl } from "@praxis/core/services";
import { FLASHCARD_TOOLS, NOTE_TOOLS } from "@praxis/tools";

const fsrsScheduler = new FsrsSchedulerImpl();
const notesService = new NotesServiceImpl({ db, log });
const flashcardsService = new FlashcardsServiceImpl({ db, log, scheduler: fsrsScheduler });

const toolDefinitions = [
  // ... existing ...
  ...NOTE_TOOLS,
  ...FLASHCARD_TOOLS,
];

const deps: ServiceDeps = {
  // ...
  toolServices: {
    // ... existing ...
    notes: notesService,
    flashcards: flashcardsService,
    fsrsScheduler,
  },
};

return {
  // ...
  notes: notesService,
  flashcards: flashcardsService,
  fsrsScheduler,
};
```

**Acceptance criteria**:
- [ ] `pnpm desktop:build` succeeds.
- [ ] First-run boot works (no notes/cards yet).

---

### Unit 9: IPC + clients

**Files**:
- `packages/desktop/electron/main/ipc-server.ts` (modified)
- `packages/client/src/services/notes-client.ts` (new)
- `packages/client/src/services/flashcards-client.ts` (new)
- `packages/client/src/client.ts` (modified)

IPC channels:
```
praxis.notes.create        / get / update / list / delete
praxis.flashcards.create   / get / update / list / delete / review / dueCount
```

All handlers resolve studentId via `getOrCreateDefaultStudentId(db)`. Pattern matches Phase 6/8/10/11 client + IPC.

**Acceptance criteria**:
- [ ] All 11+ IPC channels route correctly.
- [ ] `client.notes.*` and `client.flashcards.*` methods invoke the right channels.

---

### Unit 10: `/workspace` UI

**Files** (lots — see dependency direction above):
- Route shell + 4 sub-routes (`/workspace/notes`, `/workspace/notes/:id`, `/workspace/cards`, `/workspace/review`).
- 4 note editor components (one per format).
- `<NoteCard>` for inline rendering.
- `<FlashcardReview>` for the review UI (front/back flip + 4 rating buttons).
- `<FlashcardProposal>` for `flashcard.from_note` confirmation flow.
- 3 hooks (`useNotes`, `useFlashcards`, `useDueCards`).
- Nav update + chat-route inline panel integration.

```tsx
// routes/workspace.tsx (route shell)

const TABS = ["notes", "cards", "review"] as const;

export function WorkspaceRoute() {
  const { dueCount } = useDueCards();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const activeTab = (search?.tab as typeof TABS[number]) ?? "notes";

  return (
    <div className={styles.layout}>
      <header>
        <h1>Workspace</h1>
        <nav className={styles.tabs}>
          <button onClick={() => navigate({ to: "/workspace", search: { tab: "notes" } as never })}>Notes</button>
          <button onClick={() => navigate({ to: "/workspace", search: { tab: "cards" } as never })}>Cards</button>
          <button onClick={() => navigate({ to: "/workspace", search: { tab: "review" } as never })}>
            Review {dueCount > 0 && <span className={styles.dueBadge}>{dueCount}</span>}
          </button>
        </nav>
      </header>
      {activeTab === "notes" && <NotesList />}
      {activeTab === "cards" && <CardsList />}
      {activeTab === "review" && <ReviewSession />}
    </div>
  );
}
```

```tsx
// components/note-editor-cornell.tsx

interface CornellEditorProps {
  body: CornellBody;
  onChange: (body: CornellBody) => void;
  disabled?: boolean;
}

export function CornellEditor({ body, onChange, disabled }: CornellEditorProps) {
  return (
    <div className={styles.cornell}>
      <div className={styles.questions}>
        <h3>Key questions</h3>
        {body.questions.map((q, i) => (
          <textarea
            key={i}
            value={q}
            onChange={(e) => onChange({ ...body, questions: body.questions.map((qq, j) => (j === i ? e.target.value : qq)) })}
            disabled={disabled}
          />
        ))}
        <button onClick={() => onChange({ ...body, questions: [...body.questions, ""], details: [...body.details, ""] })}>+ Add question</button>
      </div>
      <div className={styles.details}>
        <h3>Details</h3>
        {body.details.map((d, i) => (
          <textarea
            key={i}
            value={d}
            onChange={(e) => onChange({ ...body, details: body.details.map((dd, j) => (j === i ? e.target.value : dd)) })}
            disabled={disabled}
          />
        ))}
      </div>
      <div className={styles.summary}>
        <h3>Summary</h3>
        <textarea
          value={body.summary}
          onChange={(e) => onChange({ ...body, summary: e.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
```

```tsx
// components/flashcard-review.tsx

interface FlashcardReviewProps {
  card: { flashcardId: string; front: string; preview: { again: number; hard: number; good: number; easy: number } };
  onRate: (rating: Rating) => Promise<void>;
}

export function FlashcardReview({ card, onRate }: FlashcardReviewProps) {
  const [showBack, setShowBack] = useState(false);
  const [back, setBack] = useState<string | null>(null);
  // ... fetch back from full card object passed via prop or separately ...

  return (
    <div className={styles.card}>
      <div className={styles.front}>{card.front}</div>
      {!showBack ? (
        <button onClick={() => setShowBack(true)}>Show answer</button>
      ) : (
        <>
          <div className={styles.back}>{back}</div>
          <div className={styles.rateRow}>
            <button onClick={() => onRate("again")}>Again<small>{formatInterval(card.preview.again)}</small></button>
            <button onClick={() => onRate("hard")}>Hard<small>{formatInterval(card.preview.hard)}</small></button>
            <button onClick={() => onRate("good")}>Good<small>{formatInterval(card.preview.good)}</small></button>
            <button onClick={() => onRate("easy")}>Easy<small>{formatInterval(card.preview.easy)}</small></button>
          </div>
        </>
      )}
    </div>
  );
}
```

```tsx
// chat.tsx — inline-review dispatch in useStreamedSend

// On tool_result for `flashcard.review_next`:
//   - If `kind === "ok"`, render <FlashcardReview> inline in the message
//   - On rate, call client.flashcards.review(...) then refresh

// On tool_result for `note.show`:
//   - Render <NoteCard> inline (read-only display)
```

**Acceptance criteria**:
- [ ] `/workspace` route renders three tabs (Notes / Cards / Review).
- [ ] Notes tab: list with format filter; click → editor.
- [ ] Cards tab: list with concept filter; due-count badge.
- [ ] Review tab: queue of due cards; rating advances to next.
- [ ] Inline review in chat works via tool_result dispatch.
- [ ] Inline note rendering in chat works via tool_result dispatch.

---

### Unit 11: `pnpm db:cards-due` CLI

**File**: `scripts/db-cards-due.ts` (new)

Lists cards with `nextReviewAt <= now`, ordered by most-overdue first. Format-output table with front, conceptId, nextReviewAt.

**Acceptance criteria**:
- [ ] Empty DB: prints "No cards due."
- [ ] After review of a card with rating "good", reflects new schedule.

---

### Unit 12: Doc updates

- `docs/ROADMAP.md` Phase 12 description tightened.
- `docs/CURRICULUM.md` adds spaced-repetition + note-format sections.
- `docs/CONTRACT.md` adds `NotesService` + `FlashcardsService` + `FsrsScheduler` v1 status.

---

### Unit 13: Tests

| Test file | Type | What it tests |
|---|---|---|
| `packages/core/src/types/__tests__/notes-body.test.ts` | unit, fast | `parseNoteBody` round-trip per format; mismatch errors. |
| `packages/curriculum/src/scheduling/__tests__/fsrs-impl.test.ts` | unit, fast | `initial`, `review` (each rating), `preview` order; deterministic with `enable_fuzz: false`. |
| `packages/core/src/services/__tests__/notes-service.test.ts` | unit, fast (real DB) | create/update/get/list/delete; format/body match enforcement. |
| `packages/core/src/services/__tests__/flashcards-service.test.ts` | unit, fast (real DB + real scheduler) | create/list/review; `due` filter; `dueCount` math. |
| `packages/tools/src/notes/__tests__/*.test.ts` | unit | Each note tool's handler. |
| `packages/tools/src/flashcards/__tests__/*.test.ts` | unit | Each flashcard tool's handler; `from_note` per format. |
| `packages/desktop/src/__tests__/ipc-server-{notes,flashcards}.test.ts` | unit | IPC routing. |
| `packages/client/src/__tests__/{notes,flashcards}-client.test.ts` | unit | Client invocations. |
| `packages/ui/src/__tests__/note-editor-cornell.test.tsx` | unit (jsdom) | Edit + add-question. |
| `packages/ui/src/__tests__/flashcard-review.test.tsx` | unit (jsdom) | Show answer; rate; next. |
| `packages/ui/src/__tests__/workspace-route.test.tsx` | unit (jsdom) | Tab navigation; due badge. |
| `tests/notes-flashcards-end-to-end.test.ts` | integration | Create note → from_note → confirm cards → review → next-due moves forward. |

---

## Implementation Order

1. **Unit 1** — Type contracts (notes.ts, flashcards.ts, NotesService, FlashcardsService, FsrsScheduler).
2. **Unit 2** — FsrsSchedulerImpl (depends on Unit 1; `ts-fsrs` install).
3. **Unit 3** — NotesServiceImpl.
4. **Unit 4** — FlashcardsServiceImpl (depends on Units 1, 2, 3).
5. **Unit 5** — Note tools.
6. **Unit 6** — Flashcard tools.
7. **Unit 7** — Mode + tools fragment update.
8. **Unit 8** — ServiceDeps + buildServices wiring.
9. **Unit 9** — IPC + clients.
10. **Unit 10** — UI route + components.
11. **Unit 11** — `pnpm db:cards-due` CLI.
12. **Unit 12** — Doc updates.
13. **Unit 13** — Tests interspersed.

Units 2 (FSRS), 3 (Notes), 5/6 (Tools shells) parallelizable once Unit 1 lands.

---

## Verification

```bash
pnpm install                       # picks up ts-fsrs
pnpm rebuild better-sqlite3
pnpm typecheck
pnpm lint
pnpm test
pnpm db:cards-due

# Manual checkpoint (Phase 12)
pnpm desktop:build && pnpm dev
# 1. Start a teach session against a course.
# 2. Tell the tutor: "Take a Cornell note for me on linear equations."
# 3. Agent calls note.create with cornell body → success.
# 4. Open /workspace/notes → see the note → click → edit in CornellEditor.
# 5. Tell the tutor: "Make flashcards from that note."
# 6. Agent calls note.show, then flashcard.from_note → returns proposed cards.
# 7. UI shows <FlashcardProposal> per card with "Add" / "Skip" buttons → click "Add" on a few.
# 8. Open /workspace/cards → see the cards.
# 9. Open /workspace/review → see the cards in the review queue → rate "Good" on each → cards re-scheduled.
# 10. `pnpm db:cards-due` → shows the new schedule.
# 11. Mid-session: "Quick warm-up before today's lesson." → agent calls flashcard.review_next → inline <FlashcardReview> renders → rate.
```
