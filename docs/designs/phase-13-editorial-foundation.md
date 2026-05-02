# Design: Phase 13 — Editorial Foundation

## Overview

Phase 13 establishes the editorial visual language across the entire app, polishes the
chat composer with mode-aware tutor-verb chips, eases the streaming text rhythm so model
output reads as deliberate writing, and replaces generic copy with editorial voice. **No
structural changes** — every existing route, IPC channel, and data model stays as it is.
This phase exists so all later work (tabs + Library in 14, sketching in 15, modalities
in 16) inherits one coherent design language.

The chat header (`<ModeHeader />`) we built earlier is the prototype; this phase extends
its system everywhere.

**Scope (recap from `docs/ROADMAP.md` Phase 13):**

1. Extend the editorial system across all existing routes via a generic `<RouteHeader />` parallel to `<ModeHeader />`.
2. Add a tutor-verb chip rail above the chat composer, mode-aware, with prefill semantics.
3. Refactor `<Composer />` to controlled value so external surfaces (the chips) can prefill.
4. Add an eased-streaming hook that paces token release; wire it into `useStreamedSend`.
5. Add an editorial copy module; replace generic empty / loading / error / idle strings throughout.
6. Polish existing modals (`UnlockModal`, `ClaudeAuthModal`) to use the editorial typography pair.

**Out of scope:**
- Tabs, Library, multi-session model — Phase 14.
- Sketching, tldraw integration — Phase 15.
- Mode-specific tab body shapes — Phase 16.
- Adding new routes or modifying IPC.

## Design language reference

Established by `<ModeHeader />` and now lifted to a shared visual system:

- **Display font** (`--font-display`): `Iowan Old Style → Sitka Text → Charter → Source Serif → Georgia → serif`. System-installed; CSP-safe.
- **Mono font** (`--font-mono`): `JetBrains Mono → Fira Code → ui-monospace → SF Mono → Consolas → monospace`.
- **Typographic pairing**: italic display serif over uppercase mono kicker.
- **Ornaments**: real Unicode marks (`§ ¶ † ‡ ❦ ⁂ ·`).
- **Mode tints** are reserved for **active sessions only** (the `ModeHeader` inside a tab body). Route headers use a graphite neutral tint so colored accents stay semantically meaningful — color = "you're in a session of this mode."

---

## Implementation Units

### Unit 1: Editorial typography in `global.css`

**File**: `packages/ui/src/styles/global.css`

Already partially done in the chat-header pass — `--font-display` and `--font-mono` exist.
Verify the following are present and correct:

```css
:root {
  /* Existing tokens unchanged */
  --color-bg: #0f0f0f;
  --color-surface: #1a1a1a;
  --color-border: #2a2a2a;
  --color-text: #e8e8e8;
  --color-text-muted: #888;
  --color-accent: #6b7ef8;
  --radius: 8px;

  /* Editorial tokens */
  --font-mono:
    "JetBrains Mono", "Fira Code", ui-monospace, "SF Mono", Consolas, monospace;
  --font-display:
    "Iowan Old Style", "Sitka Text", "Charter", "Source Serif Pro",
    "Source Serif 4", Georgia, "Times New Roman", serif;

  /* New: route-header neutral tint */
  --tint-route: var(--color-text-muted);
}
```

**Acceptance Criteria**:
- [ ] `--font-display` and `--font-mono` exist as CSS variables and are usable from any module.
- [ ] No `Inter`, `Roboto`, `Geist`, or imported web font appears in any CSS file under `packages/ui/`.

---

### Unit 2: `<RouteHeader />` component

**File**: `packages/ui/src/components/route-header.tsx` (new)

Sibling component to `<ModeHeader />`. Same editorial layout; designed for non-session
routes (Library, Settings, Workspace, Course Detail, Course Map, Configure, Packs,
Courses).

```typescript
import type { CSSProperties, ReactNode } from "react";
import styles from "./route-header.module.css";

export interface RouteHeaderProps {
  /** The route's typographic ornament — see ROUTE_GLYPHS for the convention. */
  ornament: string;
  /** Tiny uppercase mono kicker — e.g. "LIBRARY", "COURSE", "SETTINGS". */
  kicker: string;
  /** Italic display title — e.g. "your library", "settings". */
  title: string;
  /** Optional italic deck line beneath the title. */
  deck?: string;
  /** Optional right-aligned actions (buttons, links). Use the styles.actionButton class for visual consistency. */
  actions?: ReactNode;
  /**
   * Optional tint override. Defaults to `--tint-route` (graphite). Mode tints are
   * reserved for `<ModeHeader />` inside session tab bodies — DO NOT pass a mode
   * tint here even if a route is "about" a mode.
   */
  tint?: string;
}

export function RouteHeader(props: RouteHeaderProps): JSX.Element;
```

**File**: `packages/ui/src/components/route-header.module.css` (new)

Mirror the layout grammar of `mode-header.module.css`:

- `display: grid` with `grid-template-columns: auto 1fr auto; grid-template-rows: auto auto`
- Ornament hangs across both rows on the left (drop-initial style)
- Kicker on row 1 column 2 with the kicker dot
- Title + optional deck on row 2 column 2
- Actions on column 3 vertically centered
- Tint-prefixed bottom hairline (first ~4.5rem in the tint, rest in `--color-border`)
- Tint inherited via `--tint-route` (overridable via inline `style={{ "--tint-route": ... }}`)

Reuse the same padding scale and typographic sizes as `mode-header.module.css` so the
two headers feel like the same family.

**Implementation Notes**:
- Do NOT duplicate `mode-header.module.css` — copy and rename so divergence later is intentional.
- Both header CSS files reference shared design tokens (`--font-display`, `--font-mono`, `--color-text`, `--color-text-muted`, `--color-border`).

**Acceptance Criteria**:
- [ ] Renders the ornament, kicker, title, optional deck, optional actions in the editorial layout.
- [ ] Tint default is graphite; an inline `style={{ "--tint-route": "..." }}` override works.
- [ ] Visual parity with `<ModeHeader />` — same paddings, same typography sizes, same hairline behavior.
- [ ] Tested against `axe` (or React Testing Library `getByRole`) — the header is a proper `<header>` landmark.

---

### Unit 3: Route metadata (single source of truth)

**File**: `packages/ui/src/components/route-meta.ts` (new)

Per-route ornament and copy. Sibling to `mode-meta.ts`.

```typescript
export interface RouteMeta {
  readonly ornament: string;
  readonly kicker: string;
  readonly title: string;
  readonly deck: string;
}

export const ROUTE_META: Readonly<Record<string, RouteMeta>> = {
  // Phase 14 will add a /library entry that supersedes /courses + /packs;
  // both pre-Phase-14 routes get their own treatment for the duration of Phase 13.
  courses: {
    ornament: "¶",
    kicker: "COURSES",
    title: "courses",
    deck: "what you're learning",
  },
  packs: {
    ornament: "§",
    kicker: "PACKS",
    title: "knowledge packs",
    deck: "available curriculum",
  },
  workspace: {
    ornament: "❦",
    kicker: "WORKSPACE",
    title: "your workspace",
    deck: "notes and review",
  },
  configure: {
    ornament: "⁂",
    kicker: "CONFIGURE",
    title: "configure",
    deck: "author and tune",
  },
  settings: {
    ornament: "·",
    kicker: "SETTINGS",
    title: "settings",
    deck: "engine and preferences",
  },
  courseDetail: {
    ornament: "¶",
    kicker: "COURSE",
    title: "", // dynamic — caller passes the course title
    deck: "", // dynamic — caller passes the deck (e.g. "wk 4 · 12 lessons")
  },
  courseMap: {
    ornament: "§",
    kicker: "COURSE MAP",
    title: "concept map",
    deck: "how concepts connect",
  },
};

export function getRouteMeta(routeId: keyof typeof ROUTE_META): RouteMeta;
```

**Implementation Notes**:
- `courseDetail` is deliberately blank for `title`/`deck` — the route fills them in with the live course data.
- Adding a new route = one entry, not three files.

**Acceptance Criteria**:
- [ ] `ROUTE_META` covers every existing route (verify by grepping `packages/ui/src/routes/*.tsx` for top-level route components).

---

### Unit 4: Apply `<RouteHeader />` to existing routes

**Files**: each route file under `packages/ui/src/routes/`.

For each route, replace any current ad-hoc heading / toolbar with `<RouteHeader />` driven
by `ROUTE_META`. Examples (sketch — not literal diffs):

```tsx
// packages/ui/src/routes/courses.tsx
import { RouteHeader } from "../components/route-header.js";
import { getRouteMeta } from "../components/route-meta.js";

export function CoursesRoute() {
  // ... existing logic ...
  const meta = getRouteMeta("courses");
  return (
    <div className={styles.layout}>
      <RouteHeader
        ornament={meta.ornament}
        kicker={meta.kicker}
        title={meta.title}
        deck={meta.deck}
        actions={<button className={styles.newCourseBtn} onClick={handleNewCourse}>New course</button>}
      />
      {/* ... existing list / empty state ... */}
    </div>
  );
}
```

Routes to update (one file each — do not skip):

| Route | Notes |
|---|---|
| `routes/courses.tsx` | Title from `getRouteMeta("courses")`. Pass "New course" button as `actions`. |
| `routes/packs.tsx` | As above with `getRouteMeta("packs")`. |
| `routes/workspace.tsx` | As above. The notes/cards body stays. |
| `routes/configure.tsx` | Locked-state screen also gets a `<RouteHeader>` so it looks intentional, not broken. |
| `routes/settings.tsx` | Save button as `actions`. |
| `routes/course-detail.tsx` | Pass dynamic `title={course.title}` and `deck={\`wk ${week} · ${lessonCount} lessons\`}`. |
| `routes/course-map.tsx` | As above with `getRouteMeta("courseMap")`. |

The `routes/chat.tsx` route already has `<ModeHeader />` — leave it alone.

**Acceptance Criteria**:
- [ ] Every route under `packages/ui/src/routes/*.tsx` (except `chat.tsx`) renders a `<RouteHeader />` at its top.
- [ ] Route-specific action buttons live in `actions` and use the `actionButton` style class so they're visually consistent.
- [ ] No route still uses ad-hoc inline `<h1>` / `<header>` markup with hard-coded styles.

---

### Unit 5: Editorial copy module

**File**: `packages/ui/src/lib/copy.ts` (new)

Single source for all empty / loading / error / idle strings the UI surfaces. Subsequent
phases add to this rather than scattering literals.

```typescript
/**
 * Editorial voice — invitational, quiet, never alarmist. Empty states read as
 * invitations; errors are framed without panic; loading is a slow italic
 * ellipsis, not a spinner.
 */
export const COPY = {
  empty: {
    documents:
      "There are no documents yet. Bring me something to teach you — a textbook, a paper, a pack of concepts.",
    courses:
      "No courses yet. Start one from a knowledge pack, or upload your materials and we'll shape one together.",
    packs:
      "No knowledge packs available. Drop one into the packs directory and it'll appear here.",
    notes: "No notes yet. Take one from a session, or write one fresh.",
    flashcards:
      "No flashcards yet. Generate them from a note, or write your own.",
    sessions: "No sessions yet. Open one to begin.",
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
    network:
      "The network seems quiet. Check your connection and try again.",
    unknown:
      "Something didn't go through. Try again, or tell me what you saw.",
  },
  composer: {
    placeholder: "Type a message… (Enter to send, Shift+Enter for newline)",
  },
} as const;
```

**Implementation Notes**:
- `as const` — copy strings are deeply readonly; types narrow nicely.
- Functions for templated copy (`error.generic`) take semantic parameters, not pre-built strings — keeps editorial voice in one file.
- This module is browser-safe (no Node imports).

**Acceptance Criteria**:
- [ ] Module exports a `COPY` constant with the four namespaces (`empty`, `loading`, `error`, `composer`).
- [ ] Importing `COPY` adds zero new third-party dependencies.

---

### Unit 6: Replace inline copy strings with `COPY` imports

**Files**: every place under `packages/ui/src/` that hard-codes a generic empty / loading / error string.

Examples to find-and-replace (non-exhaustive — implementer should grep for the patterns):

| Find | Replace with |
|---|---|
| `"Loading..."` / `"Loading…"` | `COPY.loading.default` (or domain-specific variant) |
| `"No documents found"` | `COPY.empty.documents` |
| `"No courses"` | `COPY.empty.courses` |
| `\`Error: ${err.message}\`` (in catch blocks that surface to UI) | `COPY.error.generic("...")` plus the underlying message in dev tools |
| Composer `placeholder="Type a message..."` | `placeholder={COPY.composer.placeholder}` |

**Implementation Notes**:
- This is a sweep across the existing UI — likely 15–25 small replacements.
- Update any test that asserts on the old literal strings (the chat-route tests that check "Loading…" / "Session active" etc. were updated in earlier phases; carry the same discipline here).

**Acceptance Criteria**:
- [ ] `grep -r '"Loading\.\.\.\?"' packages/ui/src/` returns no production hits (only test fixtures, if any).
- [ ] `grep -r '"No \w\+ found"' packages/ui/src/` returns no production hits.
- [ ] All UI tests still pass after the sweep.

---

### Unit 7: `<Composer />` refactored to controlled value

**File**: `packages/ui/src/components/composer.tsx` (modify existing)

Today `Composer` owns its own `value` state. To allow external surfaces (the chip rail
in Unit 8) to prefill the textarea, lift the value out.

New props shape:

```typescript
export interface ComposerProps {
  /** Controlled value. */
  value: string;
  /** Called on every keystroke. */
  onChange: (value: string) => void;
  /** Called on Enter (or send button). The composer does not clear itself; the parent does. */
  onSend: (message: string) => void;
  disabled?: boolean;
}
```

`Composer` becomes a dumb controlled input. `routes/chat.tsx` lifts the value:

```tsx
const [composerValue, setComposerValue] = useState("");
// ...
<Composer
  value={composerValue}
  onChange={setComposerValue}
  onSend={async (msg) => {
    setComposerValue("");
    await handleSend(msg);
  }}
  disabled={!session || isStreaming || starting || examLockdown || needsAuth}
/>
```

**Implementation Notes**:
- The Enter-to-send and placeholder logic stay inside `<Composer />`.
- Update the placeholder to `COPY.composer.placeholder`.

**Acceptance Criteria**:
- [ ] `<Composer />` no longer holds internal state for the textarea value.
- [ ] Sending a message clears the textarea (parent calls `setComposerValue("")`).
- [ ] All existing chat tests pass after the refactor.

---

### Unit 8: `<ComposerVerbs />` chip rail

**File**: `packages/ui/src/components/composer-verbs.tsx` (new)

```typescript
export interface ComposerVerbsProps {
  /** Active session's mode — drives which verbs render. */
  modeId: string | undefined;
  /**
   * Called when a chip is tapped. Receives the verb text (e.g. "explain ").
   * Note the trailing space: chips deliver "starter words", not finished prompts.
   */
  onPrefill: (text: string) => void;
}

export function ComposerVerbs({ modeId, onPrefill }: ComposerVerbsProps): JSX.Element | null;
```

**File**: `packages/ui/src/components/composer-verbs-meta.ts` (new)

```typescript
/**
 * Mode-aware verb sets. Tap a verb → the composer textarea is prefilled with the
 * verb + a trailing space, cursor positioned at the end so the student keeps typing.
 *
 * Verbs are starter words, not autosend. The student remains in control.
 */
export const VERBS_BY_MODE: Readonly<Record<string, ReadonlyArray<string>>> = {
  teach: ["explain", "quiz me on", "let me try", "show your work", "slower", "go deeper"],
  bootstrap: ["what should we cover", "add this", "remove that", "what's next"],
  // The exam, quiz, homework verbs land in Phase 16 alongside their modality bodies;
  // for now they fall back to the teach set if a session of those modes happens to
  // open in the chat surface.
};

export function getVerbsForMode(modeId: string | undefined): ReadonlyArray<string>;
```

**File**: `packages/ui/src/components/composer-verbs.module.css` (new)

```css
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  padding: 0.4rem 1rem 0.6rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg);
}

.chip {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  padding: 0.3rem 0.1rem;
  position: relative;
  transition: color 0.18s ease;
}

.chip::after {
  content: "";
  position: absolute;
  inset: auto 0 0.05rem 0;
  height: 1px;
  background: var(--color-border);
  transition: background-color 0.18s ease;
}

.chip:hover {
  color: var(--color-text);
}
.chip:hover::after {
  background-color: var(--color-accent);
}

.chip:disabled {
  opacity: 0.32;
  cursor: not-allowed;
}
```

**Implementation Notes**:
- The chip rail goes BETWEEN the message log and the composer, with a hairline divider.
- Render `null` when `modeId` is undefined (no session yet) — no chip rail in the empty state.
- The verbs fall back to the `teach` set for modes not yet in `VERBS_BY_MODE` (Phase 16 will fill the rest). Use a small `getVerbsForMode` helper.
- Tapping a chip calls `onPrefill(verb + " ")` — the trailing space is the contract.

**Acceptance Criteria**:
- [ ] `<ComposerVerbs />` renders one chip per verb returned by `getVerbsForMode(modeId)`.
- [ ] Tapping a chip calls `onPrefill` with the verb + trailing space exactly once.
- [ ] Renders `null` when `modeId` is undefined.
- [ ] Visually: row of mono uppercase labels with hairline underlines; no buttons-shaped buttons.

---

### Unit 9: Wire `<ComposerVerbs />` into chat

**File**: `packages/ui/src/routes/chat.tsx` (modify existing)

Add the chip rail above the composer. Wire prefill into the controlled value lifted in
Unit 7.

```tsx
<ComposerVerbs
  modeId={session?.modeId}
  onPrefill={(seed) => {
    setComposerValue((prev) => (prev ? `${prev} ${seed}` : seed));
    composerTextareaRef.current?.focus();
  }}
/>
<Composer
  value={composerValue}
  onChange={setComposerValue}
  onSend={async (msg) => {
    setComposerValue("");
    await handleSend(msg);
  }}
  disabled={!session || isStreaming || starting || examLockdown || needsAuth}
/>
```

**Implementation Notes**:
- If the textarea already has content, append the chip text with a separating space so existing input isn't clobbered.
- After prefill, focus moves to the textarea for typing-without-clicking.
- Composer needs a `ref` forwarded down to the underlying `<textarea>` to support the focus call. Use `forwardRef` or a callback ref prop.

**Acceptance Criteria**:
- [ ] Chip rail appears above the composer when a session is active.
- [ ] Tapping a chip seeds the textarea correctly (with space-separation if not empty) and focuses it.
- [ ] Prefilling does NOT autosend.

---

### Unit 10: Eased streaming hook

**File**: `packages/ui/src/hooks/use-eased-stream.ts` (new)

Wraps a raw streaming string and returns a paced version. Used by `useStreamedSend`
(Unit 11) to smooth out token rhythm.

```typescript
export interface UseEasedStreamOptions {
  /**
   * Target characters-per-second for steady-state release. The hook adapts
   * upward when the buffer grows large (the model is well ahead) so total
   * stream time stays close to raw — the easing only affects perceived rhythm.
   * Default: 80 cps (~comfortable reading rate for streamed prose).
   */
  charsPerSecond?: number;
  /**
   * If buffer exceeds this many characters, accelerate release linearly so the
   * displayed text catches up. Prevents permanent lag for long messages.
   * Default: 400 chars.
   */
  catchUpAt?: number;
  /**
   * If true, eases off (returns raw immediately). Used to disable the easing in
   * tests or low-end environments. Default: false.
   */
  disabled?: boolean;
}

/**
 * Returns a paced version of `raw` whose displayed length grows toward
 * `raw.length` at ~`charsPerSecond` characters per second, accelerating when
 * the gap exceeds `catchUpAt`.
 *
 * Implementation: rAF-driven release loop. Internal state holds `displayedLen`;
 * each frame computes how many chars to release based on time delta and current
 * lag. When `raw` resets (e.g. between messages), `displayedLen` resets too.
 *
 * Total effective stream time stays close to the raw stream — this changes
 * rhythm, not duration.
 */
export function useEasedStream(
  raw: string,
  options?: UseEasedStreamOptions,
): string;
```

**Implementation Notes**:
- Use `useRef` for `displayedLen` and the rAF handle so renders don't reset state.
- Each `useEffect` watching `raw.length`:
  - If `raw.length < displayedLen.current` (raw reset), set `displayedLen.current = 0` and trigger re-render.
  - If rAF loop isn't running, schedule one.
- The rAF loop body:
  - Compute elapsed time since last frame.
  - Base release: `charsPerSecond * elapsed / 1000`.
  - Catch-up multiplier: `1 + Math.max(0, lag - catchUpAt) / catchUpAt`.
  - `displayedLen.current = Math.min(raw.length, displayedLen.current + base * multiplier)`.
  - Trigger re-render via a counter `useState`.
  - If `displayedLen.current < raw.length`, schedule next frame.
- Return `raw.slice(0, Math.floor(displayedLen.current))`.
- `disabled: true` → return `raw` directly.

**Acceptance Criteria**:
- [ ] When `raw` grows from "" to "hello world" all in one tick, the returned string grows over time at ~80 cps until it equals "hello world".
- [ ] When `raw` is set back to "" or to a shorter prefix, the displayed string resets immediately.
- [ ] If buffer lag exceeds 400 chars, release rate accelerates to catch up.
- [ ] `disabled: true` returns `raw` synchronously (verifies the bypass).
- [ ] Cleanup cancels any pending rAF on unmount.

---

### Unit 11: Wire `useEasedStream` into `useStreamedSend`

**File**: `packages/ui/src/hooks/use-streamed-send.ts` (modify existing)

Today `useStreamedSend` updates message content directly as `model_message` events
arrive. With the easing hook, the flow becomes:

```
event arrives → finalContent += event.content (raw, in ref/state)
              → message[id].rawContent = finalContent
              → consumer of message uses useEasedStream(rawContent)
                to render the paced version
```

Two implementation options:

1. **Component-level easing**: store `rawContent` on the message; the component that
   renders the message (likely `<MessageBubble>`) calls `useEasedStream(message.rawContent)`.
2. **Hook-level easing**: `useStreamedSend` itself eases per-message and emits the
   paced content as `message.content`.

**Pick option 1.** It keeps the easing layer at the rendering boundary (the bubble that
shows the text), so the same hook is trivially composable into other surfaces (Phase 16
modality bodies will reuse it). It also keeps `useStreamedSend` data-only.

Concrete changes:
- Add a new `rawContent: string` field to `ChatMessage`.
- In `useStreamedSend`, append to `rawContent` (not `content`); set `content = rawContent`
  initially (so consumers that don't ease still work).
- In `<MessageBubble>` (`packages/ui/src/components/message.tsx`), if the message is
  streaming, render `useEasedStream(message.rawContent)` instead of `message.content`.

**Implementation Notes**:
- Easing only applies while `streaming === true`. Once the message is done, the bubble
  shows the full content directly (the `useEasedStream` hook should still settle to the
  full string, but once `streaming` flips false the bubble doesn't need the hook).
- Add a small unit test that drops a 500-char chunk into a fresh stream and verifies the
  bubble's text grows over time.

**Acceptance Criteria**:
- [ ] During a model response, the message bubble's text grows at the eased rate, not in instant token-jumps.
- [ ] Once streaming ends, the bubble shows the full content (no missing characters).
- [ ] Total perceived stream time is within ~10% of raw stream time (the hook isn't slowing things down meaningfully).
- [ ] All existing chat-route and use-streamed-send tests still pass.

---

### Unit 12: Modal alignment

**Files**:
- `packages/ui/src/components/unlock-modal.tsx` and `unlock-modal.module.css`
- `packages/ui/src/components/claude-auth-modal.tsx` and `claude-auth-modal.module.css`

Light pass — make these visually align with the editorial system without restructuring.

Required changes:
- Modal title (`h2.title`) uses `font-family: var(--font-display); font-style: italic;` instead of the default sans.
- Add an ornament glyph at the top of each modal:
  - `UnlockModal` → `⁂` (configure-adjacent)
  - `ClaudeAuthModal` → `§` (teach-adjacent — chat is the entry point)
- Replace any "Wrong code, try again" / generic error literals with `COPY.error.generic("unlock the configurator")` etc.
- Reuse the same kicker pattern: a tiny mono uppercase label above the title.

**Acceptance Criteria**:
- [ ] Both modals use `--font-display` for their titles.
- [ ] Both modals show an ornament glyph above the kicker.
- [ ] All modal copy goes through `COPY` rather than inline string literals.

---

## Implementation Order

Resolves dependencies bottom-up. Each unit independently buildable and testable.

1. **Unit 1** — verify global tokens.
2. **Unit 2** — `<RouteHeader />` + CSS module.
3. **Unit 3** — `route-meta.ts` registry.
4. **Unit 4** — apply `<RouteHeader />` to all non-chat routes.
5. **Unit 5** — `lib/copy.ts` module.
6. **Unit 6** — sweep replacing inline copy.
7. **Unit 7** — `<Composer />` controlled-value refactor.
8. **Unit 8** — `<ComposerVerbs />` + verb metadata.
9. **Unit 9** — wire chips into chat route.
10. **Unit 10** — `useEasedStream` hook.
11. **Unit 11** — wire easing into the message bubble.
12. **Unit 12** — modal alignment pass.

Stop points where partial implementation is still useful:
- After **Unit 6**: every route has the editorial header; copy is consistent. No composer or streaming changes.
- After **Unit 9**: tutor-verb chips work in chat.
- After **Unit 11**: streaming feels deliberate.
- After **Unit 12**: modals match.

---

## Testing

### Unit 2 (`<RouteHeader />`) — `packages/ui/src/__tests__/route-header.test.tsx`
- Renders the ornament, kicker, title, deck, actions.
- Tint defaults to `--tint-route` (graphite).
- Inline `style={{ "--tint-route": "..." }}` override works (verify via computed style or DOM inspection).
- Optional `deck` is omitted when not passed.
- Optional `actions` is omitted when not passed.

### Unit 3 (`route-meta.ts`) — `packages/ui/src/__tests__/route-meta.test.ts`
- `getRouteMeta` returns the right entry for each known key.
- `ROUTE_META` covers every existing non-chat route (snapshot or hardcoded list).

### Unit 4 (route headers in routes) — extend each route's existing test file
- For each route, assert that the `RouteHeader` kicker text appears in the rendered DOM.

### Unit 5 (copy module) — `packages/ui/src/__tests__/copy.test.ts`
- `COPY.empty.documents` is a non-empty string.
- `COPY.error.generic("save your changes")` returns a string containing "save your changes".

### Unit 6 (copy sweep) — verify via grep + existing route tests
- Tests that previously asserted on literal "Loading…" / "No items" pass after the sweep (update assertions as needed).

### Unit 8 (`<ComposerVerbs />`) — `packages/ui/src/__tests__/composer-verbs.test.tsx`
- Renders a chip for each verb in `getVerbsForMode("teach")`.
- Tapping a chip calls `onPrefill` exactly once with the verb + trailing space.
- Renders `null` when `modeId` is undefined.
- Falls back to the `teach` verb set for modes not in `VERBS_BY_MODE`.

### Unit 9 (chat-route integration) — extend `packages/ui/src/__tests__/chat-route.test.tsx`
- After session start, the chip rail renders above the composer.
- Clicking "explain" prefills the composer with `"explain "`.
- Sending the message clears the composer.

### Unit 10 (`useEasedStream`) — `packages/ui/src/__tests__/use-eased-stream.test.tsx`
- With raw growing from "" to "hello", the returned string grows incrementally over time (use vitest fake timers + `act` to advance frames).
- Resetting raw to "" resets the displayed string immediately.
- `disabled: true` returns raw synchronously.
- Cleanup cancels pending rAF on unmount (no warnings, no continued state updates).

### Unit 11 (eased streaming integration) — extend `packages/ui/src/__tests__/use-streamed-send.test.tsx`
- During a streaming message, the bubble's displayed text grows over multiple frames rather than appearing all-at-once.
- After streaming completes, the bubble shows the full content with no truncation.

### Unit 12 (modal alignment) — extend `packages/ui/src/__tests__/claude-auth-modal.test.tsx` (UnlockModal has no test today; not a regression to skip)
- Modal title element uses `font-family` containing the display serif fallback (assert via `getComputedStyle` or class presence).
- Ornament glyph renders.

---

## Verification Checklist

```bash
# After each unit lands:
pnpm --filter @praxis/ui test
pnpm --filter @praxis/ui typecheck
npx biome check packages/ui/src/components/route-header.tsx \
  packages/ui/src/components/route-header.module.css \
  packages/ui/src/components/route-meta.ts \
  packages/ui/src/components/composer-verbs.tsx \
  packages/ui/src/components/composer-verbs.module.css \
  packages/ui/src/components/composer-verbs-meta.ts \
  packages/ui/src/components/composer.tsx \
  packages/ui/src/hooks/use-eased-stream.ts \
  packages/ui/src/hooks/use-streamed-send.ts \
  packages/ui/src/lib/copy.ts \
  packages/ui/src/styles/global.css \
  packages/ui/src/routes/*.tsx
```

Manual smoke (after Unit 11):

1. `pnpm dev` → all routes show their editorial header. Type fonts and ornaments visible.
2. Open chat → tap "explain" chip → textarea has `"explain "` with cursor at end.
3. Send a message; the streaming response arrives smoothly, not in token-machine-gun bursts.
4. Visit `/courses` with no courses → see the editorial empty-state copy from `COPY.empty.courses`.
5. Visit `/settings` → save button works; saving shows the editorial loading copy briefly.

---

## Risks and Open Questions

1. **System serif quality varies by OS.** Iowan Old Style is macOS-only; Sitka Text is Windows-only; Linux falls through to Charter / Source Serif / Georgia. We've designed the fallback chain carefully, but on bare Linux installs without Charter or Source Serif, the experience drops to Georgia which is functional but less expressive. Acceptable for v1; if user reports surface, we can ship a single bundled `Source Serif 4` font as `font-src 'self'` (CSP-clean) at the cost of ~200KB.

2. **Eased streaming + slow networks.** If the network is slow enough that the model's tokens arrive at less than the eased rate, the catch-up logic doesn't fire and the displayed text just matches the raw rate. Confirm during smoke that this degrades gracefully (no buffer accumulation, no visual stutter).

3. **Composer ref forwarding.** Lifting the textarea ref out of `<Composer />` (Unit 9 needs `composerTextareaRef.current?.focus()`) is a small refactor risk. If `forwardRef` is awkward with the current Composer shape, the alternative is to expose a `focusCounter` prop the parent increments — composer effects on it. Either way the fact must be reachable.

4. **Tests asserting on old strings.** Several existing UI tests assert exact string matches (`"Loading…"`, `"Session error: …"`, etc.). Unit 6's sweep will break those — update assertions to match the new editorial copy. Implementer should run `pnpm --filter @praxis/ui test` after each route's sweep and fix at the same time.
