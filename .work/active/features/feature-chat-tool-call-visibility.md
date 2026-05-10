---
id: feature-chat-tool-call-visibility
kind: feature
stage: implementing
tags: [ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-09
updated: 2026-05-10
---

# Chat: surface tool calls inline as ambient editorial interstitials

## Brief

Tool calls are invisible to the student today. `useStreamedSend` consumes
`tool_call` and `tool_result` events but only uses them to harvest renderable
results (citations, drafts, notes, due-cards) — see
`packages/ui/src/hooks/use-streamed-send.ts:116-189`. The `tool_call` event
itself never produces UI; the student sees a pause, then the tutor's text.
For long-running tools (textbook retrieval, grading, exploration drafts) the
pause can stretch for several seconds with no signal that anything is
happening.

This feature renders each in-flight tool call as a compact, ambient
interstitial in the message stream — italic editorial copy on its own line,
inline between turns, e.g. "looking up algebra II prerequisites…" or
"grading your work…". Once the tool returns, the line either disappears,
collapses to a past-tense summary, or stays as quiet context — the design
phase decides which based on tool semantics. The pattern should feel like
the same restraint the `<ActivityRail />` uses for background work: present
when relevant, never demanding attention.

**Scope of the interstitial — what it renders.** Just enough to communicate
that *something is happening and roughly what*. The tool name (humanised) or
a one-phrase summary is sufficient — no arguments, no JSON, no raw payloads,
no expandable disclosure. The interstitial is **animated to indicate live
activity** (subtle pulsing dots, a slow ellipsis cadence, or a gentle opacity
drift — design phase picks the specific motion language) so the student can
distinguish "still working" from "stuck". Animation is the *only* permissible
attention-grabber; it stops the moment the tool resolves. Rich tool outputs
(citations, drafts, notes, due-cards) already render via their own dedicated
components — this feature does NOT duplicate or preview those. The
interstitial is a thin presence indicator, not a debug log.

The feature owns:

- A mapping from tool name → human-readable present-progressive label and an
  optional past-tense settled label. This belongs near the tool registry so
  the source of truth lives where new tools are added, not scattered in the
  UI. (Candidate location: alongside `composer-verbs-meta.ts` or as a sibling
  table in `@praxis/tools` exposed to the renderer.)
- Stream handling in `useStreamedSend` (or a successor hook) that emits an
  in-flight item per `tool_call` event and resolves it on the matching
  `tool_result` (the existing `lastToolCallName` pairing logic is fragile
  and assumes strict serialization — verify or replace).
- Rendering inside `<MessageBubble>` (or a new sibling component for between-
  bubble interstitials) that hits the editorial primitives — no badges, no
  spinning icons, no dopamine taps. Italic text plus a subtle activity
  animation (e.g., paced ellipsis, low-amplitude opacity breath); just enough
  motion to read as "live", nothing closer to a marketing splash.
- Replay parity through `episodicToMessages` so that re-opening a tab shows
  the same interstitials a live viewer saw, in the same positions relative
  to bubbles.

Editorial guardrails from `docs/VISION.md` are non-negotiable:

- No emoji, no icons-as-attention-grabbers
- No "Tool: foo()" technical leakage — student sees what the tutor is doing,
  not the underlying API
- Errors during tool execution should still surface (don't silently hide
  failed calls), but the framing remains pedagogical, not diagnostic

Out of scope: changing what tools the model can call, surfacing tool inputs
or outputs (those already render as their own components — citations, drafts,
notes), or building a debug panel. This is purely about ambient awareness in
the conversation flow.

## Source

Promoted from `idea-show-tool-calls` (parked 2026-05-09).

---

## Design decisions

- **Label registry location**: `packages/tools/src/labels/index.ts` exposed
  via a new `@praxis/tools/labels` subpath export. UI takes a runtime dep on
  `@praxis/tools`. The brief explicitly preferences "near the tool registry";
  the subpath keeps the labels module isolated so importing it doesn't pull
  Pyodide / ingestion into the UI bundle (those live behind the package
  root export, which UI never touches).
- **Tool-call ↔ tool-result pairing**: switched from the fragile
  `lastToolCallName` ordering to `EngineEvent.callId`-keyed lookup. `callId`
  already rides every `tool_call` and `tool_result` (`packages/core/src/types/engine.ts:175-176`).
  The existing logic only worked because the model serialised tool calls one
  at a time; a future engine that fans out parallel calls would silently
  cross-pair results into the wrong renderable buckets today.
- **Interstitial position**: arrival order in the items list. No "between
  bubbles" rebalancing. The user-message + placeholder assistant bubble are
  pushed at turn start, so any in-turn `tool_call` lands AFTER the assistant
  bubble in the items list, which reads cleanly ("tutor speaks → tutor pauses
  to look something up").
- **Settled-state behaviour**: collapse silently by default; render past-tense
  copy ONLY for tools where it adds context (e.g. "Cited textbook" leaves a
  trace next to the citations card). Reduces visual debris on tools that
  fired and finished without producing renderable output.
- **Errored tool calls**: persist as a muted-warning past-tense line
  ("Couldn't finish looking up textbook references."). Surfaces failure
  without leaking diagnostics; framing stays pedagogical per VISION.
- **`hidden: true` flag**: tools that already produce their own card
  (`flashcard.review_next` → flashcard review surface, `quick_check.*` →
  QuickCheckCard, `note.show` / `course.show_draft` → existing render) skip
  the interstitial entirely. Without this, every quick-check would render as
  a doubled signal (interstitial + card). The hidden tools still feed their
  results into the assistant accumulator; only the visual interstitial is
  suppressed.
- **Render shape change**: `useStreamedSend.messages` becomes `items:
  ChatStreamItem[]`. The chat-tab-body is the only consumer; renaming
  surfaces every call site at the type-checker. `episodicToMessages`
  follows the same rename. Single-stride feature → no shim.

## Architectural choice

**Sibling label table in `@praxis/tools/labels` + callId-keyed interstitial
items in the existing stream hook + a thin `<ToolInterstitial>` editorial
component.** Chosen over (a) inlining `presentLabel` / `pastLabel` onto
every `ToolDefinition` (would touch all ~75 tools and bake presentation
copy into the engine-facing contract) and (b) keeping the table in the UI
itself (loses the "co-located with tool registration" intent in the brief).

Why this shape:

- **Engine contract stays presentational-free.** `ToolDefinition` is consumed
  by every engine adapter and every test fixture; pushing UI copy through it
  would bloat unrelated surfaces.
- **Labels live where new tools are added.** A developer scoping a new tool
  in `packages/tools/src/<domain>/<name>.ts` adds an entry one directory
  over in `labels/index.ts`. If they forget, the humanizer fallback keeps
  the interstitial readable.
- **Subpath export keeps UI bundle clean.** `@praxis/tools/labels` exports
  pure data with no transitive imports — the heavy modules under the
  package root (Pyodide, ingestion) stay out of the UI bundle.
- **callId pairing matches the wire format.** `EngineEvent` already carries
  `callId` on both `tool_call` and `tool_result`, so we drop the fragile
  ordering assumption with no protocol change.

## Implementation Units

### Unit 1: Tool labels registry

**File**: `packages/tools/src/labels/index.ts` (new)

```typescript
export interface ToolLabel {
  /**
   * Present-progressive copy shown while the tool is in flight, e.g.
   * "Looking up textbook references". No trailing ellipsis or punctuation —
   * the renderer adds animated dots for the "live" cue.
   */
  present: string;
  /**
   * Past-tense copy shown after the tool resolves successfully. When omitted,
   * the interstitial collapses (renderer returns null) once the result lands.
   * Set this only when the past-tense line adds standing context next to a
   * renderable surface (e.g. "Cited textbook" alongside SourceCards).
   */
  past?: string;
  /**
   * When true, the interstitial is suppressed entirely — the tool already
   * has its own card surface (quick checks, draft preview, due-card review),
   * so an interstitial would be a doubled signal. Hidden entries still
   * participate in result harvesting; only the visual interstitial is
   * skipped. Default false.
   */
  hidden?: boolean;
}

export const TOOL_LABELS: Readonly<Record<string, ToolLabel>> = {
  // Textbook + retrieval
  retrieve_from_textbook: { present: "Looking up textbook references", past: "Cited textbook" },
  "document.outline": { present: "Reading the table of contents" },
  "document.list_sections": { present: "Scanning sections" },
  "document.read_pages": { present: "Reading pages" },

  // Course bootstrap (drafting)
  "course.start_exploration": { present: "Exploring your sources" },
  "course.draft_init": { present: "Sketching a course outline" },
  "course.draft_add_unit": { present: "Adding a unit" },
  "course.draft_add_lessons": { present: "Adding lessons" },
  "course.draft_add_concepts": { present: "Mapping concepts" },
  "course.draft_add_edges": { present: "Connecting concepts" },
  "course.draft_set_assessment_plan": { present: "Setting an assessment plan" },
  "course.draft_add_lesson_assessments": { present: "Drafting lesson assessments" },
  "course.draft_set_metadata": { present: "Updating course details" },
  "course.draft_remove_concept": { present: "Pruning a concept" },
  "course.draft_remove_lesson": { present: "Removing a lesson" },
  "course.show_draft": { present: "Showing the draft", hidden: true },
  "course.confirm_draft": { present: "Saving your course" },
  "course.discard_draft": { present: "Discarding the draft" },
  "course.edit_draft": { present: "Revising the draft" },
  "course.edit": { present: "Updating the course" },

  // Course navigation
  "course.current_concept": { present: "Checking where you are" },
  "course.what_can_i_teach": { present: "Reviewing the syllabus" },
  "course.start_lesson": { present: "Starting the lesson" },
  "course.mark_studied": { present: "Marking concept studied" },
  "course.attach_document": { present: "Attaching a source" },
  "course.detach_document": { present: "Detaching a source" },
  "course.list_course_documents": { present: "Listing course sources" },
  "course.list_library_documents": { present: "Listing your library" },
  "course.list_canonical_packs": { present: "Listing pack templates" },
  "course.use_canonical_pack": { present: "Loading a pack template" },

  // Assessment + grading
  "assignment.create": { present: "Building practice problems" },
  "assignment.show": { present: "Loading the assignment", hidden: true },
  "assignment.read_grade": { present: "Checking your grade" },
  grade_math: { present: "Grading your work", past: "Graded" },

  // Pedagogy
  "pedagogy.get_strategy": { present: "Choosing a teaching approach" },
  "pedagogy.get_technique": { present: "Picking a study technique" },
  "pedagogy.list_metacognitive_prompts": { present: "Considering reflection prompts" },
  "pedagogy.list_strategies": { present: "Reviewing strategies" },
  "pedagogy.list_techniques": { present: "Reviewing techniques" },

  // Memory
  record_misconception: { present: "Noting a misunderstanding", past: "Logged a misunderstanding" },
  update_mastery: { present: "Updating mastery", past: "Updated mastery" },
  "memory.clear_misconception": { present: "Clearing a misunderstanding" },
  "memory.reset_concept": { present: "Resetting concept progress" },
  "memory.export": { present: "Exporting memory" },
  "memory.delete_all": { present: "Clearing memory" },

  // Notes + flashcards
  "note.create": { present: "Writing a note" },
  "note.show": { present: "Showing a note", hidden: true },
  "note.list": { present: "Listing notes" },
  "note.update": { present: "Updating a note" },
  "note.from_session_summary": { present: "Summarising the session as a note" },
  "flashcard.create": { present: "Creating a flashcard" },
  "flashcard.from_note": { present: "Turning a note into flashcards" },
  "flashcard.review": { present: "Recording your review" },
  "flashcard.review_next": { present: "Pulling up your due cards", hidden: true },

  // Quick checks (suppressed — they spawn their own card via the bridge)
  clarification: { present: "Asking a clarifying question", hidden: true },
  "quick_check.confidence": { present: "Asking a quick check", hidden: true },
  "quick_check.matching": { present: "Asking a quick check", hidden: true },
  "quick_check.multi_select": { present: "Asking a quick check", hidden: true },
  "quick_check.short_answer": { present: "Asking a quick check", hidden: true },
  "quick_check.single_choice": { present: "Asking a quick check", hidden: true },

  // Gates
  "gate.create": { present: "Setting up a checkpoint" },
  "gate.delete": { present: "Removing a checkpoint" },
  "gate.edit": { present: "Editing a checkpoint" },
  "gate.override": { present: "Overriding a checkpoint" },

  // Lessons
  "lesson.create": { present: "Adding a lesson" },
  "lesson.delete": { present: "Removing a lesson" },
  "lesson.edit": { present: "Editing the lesson" },

  // Prompt + customization
  "prompt.set_style": { present: "Adjusting tutor style" },
  "prompt.override_fragment": { present: "Customising tutor instructions" },
  "prompt.clear_fragment": { present: "Resetting tutor instructions" },

  // Sketch + sandbox
  "sketch.read": { present: "Looking at your sketch" },
  code_sandbox: { present: "Running code", past: "Ran code" },
};

/**
 * Resolve a tool name to its display copy. Falls back to a humanised version
 * of the name when no entry exists, so newly-added tools render readable
 * text until the labels file is curated.
 */
export function getToolLabel(name: string): ToolLabel {
  const entry = TOOL_LABELS[name];
  if (entry) return entry;
  return { present: humanizeToolName(name) };
}

function humanizeToolName(name: string): string {
  // course.draft_add_unit → "Course / draft add unit"
  return name
    .split(".")
    .map((part) =>
      part
        .split("_")
        .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(" "),
    )
    .join(" / ");
}
```

**Implementation Notes**:
- File has zero side effects — pure data + one helper. Importing it into the UI bundle is cheap.
- Treat the table as a curated copy file: a writer can scan it end-to-end and edit lines without touching tool implementations.
- New tools with no entry render via the humanizer (`"future_unknown_tool" → "Future unknown tool"`). This is graceful degradation, not a bug — a follow-up story can add real copy.

**Acceptance Criteria**:
- [ ] `getToolLabel("retrieve_from_textbook").present === "Looking up textbook references"`
- [ ] `getToolLabel("retrieve_from_textbook").past === "Cited textbook"`
- [ ] `getToolLabel("flashcard.review_next").hidden === true`
- [ ] `getToolLabel("future_unknown_tool")` returns `{ present: "Future unknown tool" }` (no `past`, not `hidden`)
- [ ] No emoji codepoints (U+1F000-U+1FFFF) or arrow / glyph icons in any value
- [ ] No raw tool name (e.g. `"course.draft_add_unit"`) appears verbatim in any rendered label

---

### Unit 2: Package wiring (subpath export + UI dep)

**File**: `packages/tools/package.json`

Add to the `exports` map:

```json
"./labels": {
  "praxis-source": "./src/labels/index.ts",
  "types": "./dist/labels/index.d.ts",
  "import": "./dist/labels/index.js",
  "node": "./dist/labels/index.js",
  "default": "./dist/labels/index.js"
}
```

**File**: `packages/ui/package.json`

Add to `dependencies`:

```json
"@praxis/tools": "workspace:*"
```

**File**: `packages/tools/tsconfig.json` (verify no change required — the new
file lives under `src/` and the existing `include` covers it).

**Implementation Notes**:
- The new edge `@praxis/ui → @praxis/tools` is a precedent (UI does not
  import tools today). It does not violate the dependency-direction rules in
  `CLAUDE.md` — those constrain reverse-direction runtime imports
  (`core → engines/tools`), not the UI side. The labels subpath imports
  nothing else from the tools package and no `@praxis/*` packages, so the
  new edge does not introduce a cycle and does not bloat the UI bundle.
- Keep the addition to `@praxis/tools/index.ts` re-exports OUT of scope —
  consumers route through the `./labels` subpath only.

**Acceptance Criteria**:
- [ ] `pnpm build` succeeds across the workspace
- [ ] `pnpm typecheck` passes
- [ ] `import { getToolLabel } from "@praxis/tools/labels"` resolves cleanly
      from inside `@praxis/ui`
- [ ] The labels module's transitive imports include nothing from
      `packages/tools/src/runtime/`, `packages/tools/src/math/`,
      `packages/tools/src/sandbox/` (manual check via `grep '^import' packages/tools/src/labels/index.ts`)

---

### Unit 3: Stream model — interstitial items + callId pairing

**File**: `packages/ui/src/hooks/use-streamed-send.ts`

Replace the `messages: ChatMessage[]` array with `items: ChatStreamItem[]`,
where:

```typescript
import type { ToolResultValue /* existing */ } from "...";

export interface ToolInterstitial {
  /** EngineEvent.callId — pairs tool_call with tool_result. */
  callId: string;
  toolName: string;
  /** "in_flight" while awaiting tool_result; "settled" once the result lands. */
  status: "in_flight" | "settled";
  /** True when the matched tool_result.ok === false. */
  errored?: boolean;
}

export type ChatStreamItem =
  | ({ kind: "message" } & ChatMessage)
  | ({ kind: "interstitial" } & ToolInterstitial);

export interface UseStreamedSendResult {
  items: ChatStreamItem[];
  isStreaming: boolean;
  lastError: string | null;
  send: (sessionId: SessionId, message: string) => Promise<void>;
  clearMessages: () => void;
  loadHistory: (sessionId: SessionId) => Promise<void>;
}
```

**Implementation Notes**:

- Replace `lastToolCallName: string | null` with
  `pendingByCallId: Map<string, string>` (callId → toolName). Populate on
  every `tool_call`; consume + delete on every `tool_result`. This works
  for both serialised and concurrent tool fan-out.
- On `tool_call`: look up the label via `getToolLabel(event.toolName)` and
  push a new item `{ kind: "interstitial", callId, toolName, status: "in_flight" }`
  ONLY if `!label.hidden`. Always populate `pendingByCallId` regardless of
  hidden status, because result harvesting still needs the toolName lookup
  for hidden tools (e.g. `flashcard.review_next` is hidden but its results
  still feed `dueCards`).
- On `tool_result`: pull `toolName = pendingByCallId.get(event.callId)`,
  delete the entry, then:
  1. If a visible interstitial exists with that callId, mutate it
     (immutably via `setItems(prev => prev.map(...))`) to
     `status: "settled"` and set `errored = !event.result.ok`.
  2. Run the existing renderable-result harvester (`citations`, `drafts`,
     `notes`, `dueCards`) keyed off `toolName`. The harvester logic stays
     identical; only the toolName lookup changes.
- The placeholder assistant message added at line 80-85 of the current hook
  becomes `{ kind: "message", id, role: "assistant", content: "", rawContent: "", streaming: true }`
  in the items array.
- `clearMessages` clears `items` (not just messages) and resets `lastError`.
- An unmatched `tool_result` (no entry in `pendingByCallId`) is logged via
  `console.warn` once and otherwise ignored — never throws. Defensive
  against malformed streams; current behaviour silently drops.

**Acceptance Criteria**:
- [ ] A turn with one `tool_call` → `tool_result` produces, in order:
      `[user-message, assistant-message(placeholder), interstitial(in_flight), ...settle...]`
      and after the result, the interstitial flips to `status: "settled"` (or
      stays `in_flight` is wrong — must flip)
- [ ] Two concurrent `tool_call`s with different callIds emit two
      interstitials in arrival order; results delivered out-of-order pair
      correctly via callId
- [ ] `tool_result.ok === false` sets `errored: true` on the matching
      interstitial; `errored` is `undefined` (not `false`) on success
- [ ] A `tool_call` whose label is `hidden: true` (e.g. `flashcard.review_next`)
      does NOT add an interstitial item, but the tool's renderable result
      (`dueCards`, etc.) still appears on the assistant message
- [ ] An unmatched `tool_result` produces no items mutation and no throw
- [ ] `clearMessages()` empties `items` and `lastError`

---

### Unit 4: Replay parity in `episodicToMessages`

**File**: `packages/ui/src/hooks/episodic-to-messages.ts`

Rename to `episodicToItems` (and re-export under the old name as a deprecated
alias OR rename in place — see notes below). Return `ChatStreamItem[]`
instead of `ChatMessage[]`.

```typescript
export function episodicToItems(events: readonly EpisodicEvent[]): ChatStreamItem[] {
  // ... same walk as today, plus:
  // - on tool_call: append interstitial item, set pendingByCallId.set(callId, toolName)
  // - on tool_result: find interstitial by callId in `items` and mutate to settled
  // - hidden tools: don't append an interstitial; still populate pendingByCallId
}
```

**Implementation Notes**:

- Replace the `assistant.pendingToolName: string | null` field with a
  per-turn `pendingByCallId: Map<string, string>`. Reset on turn boundaries.
- Interstitial items go into the `messages` (now `items`) array directly,
  in arrival order. They are NOT wrapped in the assistant accumulator
  (interstitials live ALONGSIDE the assistant bubble in the items list,
  not inside it).
- For the `tool_result → settled` mutation, walk `items` from the end
  backwards looking for the interstitial whose `callId` matches; this is
  O(N) worst-case but the target is almost always within the last few
  items (same turn). Acceptable for replay (one-shot on history load).
- The empty-turn dropping logic (line 88-94 of current
  `episodic-to-messages.ts`) still applies to assistant accumulators, but
  interstitials count as "visible" content — a turn that produced only
  visible interstitials still contributes them to the items array. (Hidden
  interstitials don't, by definition — they were never appended.)
- Single rename, no shim: update the only caller (`use-streamed-send.ts`'s
  `loadHistory`) and the test file in the same stride.

**Acceptance Criteria**:
- [ ] Replaying `[user, tool_call, tool_result, model_message, final]`
      produces `[user-message, interstitial(settled), assistant-message]`
- [ ] Replaying interleaved concurrent tool calls produces the correct
      `(toolName, status)` per interstitial
- [ ] Replaying with a `tool_result.ok === false` produces an interstitial
      with `errored: true`
- [ ] Replaying a stream containing `flashcard.review_next` produces no
      interstitial item but the assistant message still has `dueCards`
- [ ] Existing tests in `__tests__/episodic-to-messages.test.ts` updated to
      assert the new `kind`-tagged shape and continue to pass

---

### Unit 5: Interstitial render component

**Files** (new):
- `packages/ui/src/components/tool-interstitial.tsx`
- `packages/ui/src/components/tool-interstitial.module.css`

```typescript
import { getToolLabel } from "@praxis/tools/labels";
import type { JSX } from "react";
import styles from "./tool-interstitial.module.css";

export interface ToolInterstitialProps {
  toolName: string;
  status: "in_flight" | "settled";
  errored?: boolean;
}

export function ToolInterstitial({
  toolName,
  status,
  errored,
}: ToolInterstitialProps): JSX.Element | null {
  const label = getToolLabel(toolName);
  if (label.hidden) return null;

  if (status === "in_flight") {
    return (
      <p className={styles.interstitial} aria-live="polite">
        <span className={styles.text}>{label.present}</span>
        <span className={styles.dots} aria-hidden="true">
          <span /><span /><span />
        </span>
      </p>
    );
  }

  if (errored) {
    return (
      <p className={`${styles.interstitial} ${styles.errored}`}>
        Couldn't finish {label.present.toLowerCase()}.
      </p>
    );
  }

  if (label.past !== undefined) {
    return <p className={`${styles.interstitial} ${styles.settled}`}>{label.past}</p>;
  }

  return null;
}
```

```css
/* tool-interstitial.module.css — editorial restraint, matches activity-rail. */
.interstitial {
  composes: editorial from global;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin: 0.25rem 0 0.25rem 0.25rem;
  padding: 0;
  align-self: flex-start;
  max-width: 80%;
  line-height: 1.5;
  display: flex;
  align-items: baseline;
  gap: 0.4em;
}

.text {
  /* inherits italic from .editorial */
}

.dots {
  display: inline-flex;
  gap: 0.18em;
  align-items: baseline;
}

.dots > span {
  display: inline-block;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.25;
  animation: praxis-interstitial-pulse 1.2s ease-in-out infinite;
}

.dots > span:nth-child(2) {
  animation-delay: 0.15s;
}

.dots > span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes praxis-interstitial-pulse {
  0%, 100% {
    opacity: 0.2;
    transform: translateY(0);
  }
  50% {
    opacity: 0.85;
    transform: translateY(-1px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dots > span {
    animation: none;
    opacity: 0.45;
  }
}

.settled {
  opacity: 0.6;
}

.errored {
  color: var(--color-warning, var(--color-text-muted));
  opacity: 0.85;
}
```

**Implementation Notes**:
- `aria-live="polite"` on the in-flight branch announces tool activity to
  screen readers without interrupting; settled/errored branches drop the
  attribute (the change is announced once when the in-flight node is
  replaced).
- Three pulsing dots, staggered by 150ms — animation matches the rail's
  220ms `praxis-rail-in` cadence enough to read as the same family.
- No emoji, no SVG icons, no spinner glyph. Italic copy via
  `composes: editorial from global` — same primitive used by `<ActivityRail />`
  and other editorial surfaces.
- Hidden tools render `null`. Settled-without-`past` renders `null` (collapse).
  These are deliberate: the items array still carries the entry (so concurrent
  resolution works), the DOM just doesn't reflect it.

**Acceptance Criteria**:
- [ ] In-flight branch renders the present-progressive label, three pulsing
      dots, `aria-live="polite"`
- [ ] Settled-with-`past` branch renders the past-tense copy, no animation
- [ ] Settled-without-`past` renders `null`
- [ ] `errored: true` branch renders "Couldn't finish …" muted-warning copy
- [ ] `getToolLabel.hidden === true` short-circuits to `null` regardless of `status`
- [ ] `prefers-reduced-motion: reduce` keeps the dots visible but suppresses animation
- [ ] No `img`, `svg`, `[role="img"]` elements in any branch
- [ ] No bubble-style background, border, or rounded corners — the line reads
      as plain ambient text, not a card

---

### Unit 6: Wire interstitials into the chat surface

**File**: `packages/ui/src/components/chat-tab-body.tsx`

Update the `TeachChatTabBody` render to consume `items` instead of
`messages`:

```tsx
const { items, isStreaming, lastError, send, loadHistory } = useStreamedSend(client);
// ...
{items.length === 0 && (
  <p className={styles.emptyState}>Start a conversation with your tutor.</p>
)}
{items.map((item) => {
  if (item.kind === "interstitial") {
    return (
      <ToolInterstitial
        key={`tc-${item.callId}`}
        toolName={item.toolName}
        status={item.status}
        {...(item.errored !== undefined && { errored: item.errored })}
      />
    );
  }
  return (
    <MessageBubble
      key={item.id}
      role={item.role}
      content={item.content}
      rawContent={item.rawContent}
      {...(item.streaming !== undefined && { streaming: item.streaming })}
      {...(item.citations !== undefined && { citations: item.citations })}
      {...(item.drafts !== undefined && { drafts: item.drafts })}
      {...(item.notes !== undefined && { notes: item.notes })}
      {...(item.dueCards !== undefined && { dueCards: item.dueCards })}
      onViewPage={handleViewPage}
      onRateCard={async (flashcardId, rating) => {
        await client.flashcards.review({ flashcardId: flashcardId as any, rating });
      }}
    />
  );
})}
```

Update `messageCount` to track `items.length` (or just rename to
`itemCount`) so the auto-scroll-on-change effect still fires.

**Implementation Notes**:
- The `quickChecks` parallel list (Phase 17) keeps its current behaviour —
  it renders AFTER the items list, unchanged.
- No other component reads `useStreamedSend`'s return; verify with grep
  before landing.
- The `<AssignmentCard>` and `<PageImagePanel>` blocks are unaffected.

**Acceptance Criteria**:
- [ ] Items render in arrival order: bubbles and interstitials interleave
      based on stream order
- [ ] Interstitials render as plain editorial lines (no bubble background)
- [ ] Auto-scroll-to-bottom still fires when a new item arrives
- [ ] Existing chat-tab-body tests (auth gate, exam lockdown, sketch attach,
      empty state) continue to pass
- [ ] Replaying a session that included a `retrieve_from_textbook` call
      shows "Cited textbook" past-tense interstitial alongside the
      `<SourceCard>` stack

---

## Implementation Order

1. **Unit 1** — labels registry (no dependents on other units)
2. **Unit 2** — package wiring (depends on Unit 1's file existing for the
   subpath to resolve)
3. **Unit 3** — stream model in `useStreamedSend` (depends on Unit 1's
   `getToolLabel` for the `hidden` check)
4. **Unit 4** — replay parity in `episodicToMessages` (depends on Unit 3's
   `ChatStreamItem` type)
5. **Unit 5** — `<ToolInterstitial>` component (depends on Units 1 and 2)
6. **Unit 6** — `chat-tab-body` wiring (depends on Units 3, 4, 5)

Each unit's tests land alongside the unit. Run `pnpm test --filter @praxis/tools`
after Unit 1, `pnpm typecheck && pnpm build` after Unit 2,
`pnpm test --filter @praxis/ui` after each remaining unit.

## Testing

### Unit Tests

- `packages/tools/src/labels/__tests__/index.test.ts` (new) — covers Unit 1
  acceptance: present + past lookups, `hidden` flag, fallback humanization,
  no emoji codepoint sweep across `Object.values(TOOL_LABELS)`.

- `packages/ui/src/__tests__/use-streamed-send.test.ts` (new — none exists
  today; this feature introduces the first hook test) — fakes a `PraxisClient`
  whose `session.send` yields a chosen sequence of `EngineEvent`s. Asserts:
  - one `tool_call` → `tool_result` produces an interstitial that flips
    `in_flight → settled`
  - two concurrent calls with different callIds settle correctly when
    results arrive out of order
  - `tool_result.ok === false` sets `errored: true`
  - `hidden: true` tool produces no interstitial item but still populates
    the assistant's `dueCards`
  - unmatched `tool_result` is a no-op
  - `clearMessages()` empties `items`

  Use the existing `makeFakeClient` helper from
  `packages/ui/src/__tests__/helpers/fake-client.ts` and override
  `session.send` to return a generator.

- `packages/ui/src/__tests__/episodic-to-messages.test.ts` (extend) — extend
  existing tests to assert the renamed `episodicToItems` returns
  `ChatStreamItem[]` with `kind`-tagged entries; add cases for callId
  pairing and hidden tools.

- `packages/ui/src/__tests__/tool-interstitial.test.tsx` (new) —
  `@testing-library/react` tests for the four render branches (in-flight /
  settled-with-past / settled-without-past / errored), the `hidden`
  short-circuit, and a sweep that asserts no `img`/`svg` rendered.

### Integration

- `packages/ui/src/__tests__/chat-tab-body.test.tsx` (extend if exists,
  otherwise add a focused test) — render a `<TeachChatTabBody>` with a
  fake client that streams `tool_call` + `model_message` + `tool_result`,
  assert the DOM contains an interstitial line followed by the bubble,
  and that the interstitial collapses or settles appropriately.

### Test Data

- No new fixtures required. The hook tests construct `EngineEvent`s
  inline; the labels tests are pure data assertions.

## Risks

1. **Visual interleaving with streaming partials.** A turn that emits
   `model_message(partial="A")` → `tool_call` → `tool_result` →
   `model_message(partial="B")` will render as `[bubble("A"), interstitial,
   bubble("AB")]`. Because the assistant bubble is a single mutating item,
   the interstitial appears BELOW the bubble (the bubble grows in place;
   the interstitial is appended after). This is the desired reading order
   ("the tutor pauses to look something up, then continues"), but QA on
   real Claude Code streams should confirm the cadence reads naturally.
   Fallback: defer the interstitial insertion until the next non-tool event,
   or pin interstitials below the latest bubble at render time. Cost is
   ~10 LoC if needed.

2. **Concurrency assumptions in result harvesting.** Today the result
   harvester is keyed on the most-recent tool_call name. After this change
   it's keyed on callId. If any adapter mistakenly emits a `tool_result`
   without a matching `tool_call` (or with a stale callId), renderable
   results that previously slipped in via name-coincidence will silently
   drop. Mitigation: log unmatched results via `console.warn` so QA
   notices; the existing harvester behaviour is technically buggy under
   concurrency, so dropping unmatched results is more correct than
   preserving the bug.

3. **Bundle-size regression on labels module growth.** As tools accumulate,
   the labels file grows linearly. At ~75 tools today the table is ~2 KB
   uncompressed; at 300 tools it's ~8 KB. Acceptable for the foreseeable
   future. If the table ever needs trimming, the humanizer fallback already
   handles uncovered tools.

4. **Editorial copy quality.** The labels are a writing surface as much as
   a code surface. The committed table is a first pass; expect a follow-up
   review pass once the feature is live and the cadence is observable in
   real sessions.
