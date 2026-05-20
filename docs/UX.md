# UX

The user-facing surfaces of Praxis. `ARCHITECTURE.md` describes what the UI is (a Vite + React + TanStack Router SPA talking to `@praxis/core` over a transport); this document describes what it *does* and what it *feels like* to use.

The UI has two top-level surfaces: **student** (the learning experience) and **configure** (authoring and tuning). They share the same SPA; the lock code controls which is accessible. The chrome is a top horizontal running head (`<TopNav>`) with `<StatusStrip>` mounted directly beneath it at the router root — a near-invisible surface that floats ambient background work (ingestion, indexing, grading) without blocking navigation. The standalone `<ActivityRail>` component is retained in the codebase but unused.

## Surface map

```
                    ┌──────────────────────┐
                    │      Lock state      │
                    │  unlocked  /  locked │
                    └───────────┬──────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                                   ▼
        Student mode                       Configure mode
        ───────────────                    ──────────────────
        ▸ Library (front door)             ▸ Course authoring
            packs · courses · sessions     ▸ Gate editor (React Flow)
            documents · archive            ▸ Prompt customization
        ▸ Tutor workspace (tabs)            ▸ Memory inspector
            tab body shape per mode:       ▸ Engine / config settings
              teach       → chat
              course-create → canvas + outline
              quiz        → flashcard rhythm
              homework    → paginated set
              exam        → proctored
              study-skills→ coach reflection
        ▸ Workspace (notes)
        ▸ Concept map (tldraw)
        ▸ Progress map
```

In the unlocked state, both surfaces are accessible through a single navigation. Setting a lock code hides the configure surface behind a lock gate and keeps the student surface open.

## Editorial language

Praxis is a literary review, not a chat app. The visual system is editorial: typographic, restrained, anti-notification. Established in the Phase 13 editorial-foundation work and inherited by every subsequent surface.

**Typography.** A system serif with strong italics — Iowan Old Style → Sitka Text → Charter → Source Serif → Georgia, in fallback order — for display and emphasis; a monospace (JetBrains Mono → SF Mono → Consolas) for kickers, labels, and structural metadata. No remote font fetch (CSP forbids), no bundled font assets. No Inter, no Roboto, no Geist — the standard AI-app trio that signals "generated." The pairing — italic display serif over uppercase mono kicker — is the recurring typographic motif, drawn from scholarly journals.

**Ornaments.** Real typographic marks (§, ¶, †, ‡, ❦, ⁂, ·) replace icons or emoji as section markers. They render perfectly in any system serif and carry centuries of editorial meaning.

**Mode tints.** Each mode has a whisper-faint accent used only for hairline rules, ornament fills, and 4% gradient washes. The tints distinguish modes without shouting:

| Mode | Tint | Glyph |
|---|---|---|
| teach | warm amber | § |
| course-create | sage | ¶ |
| quiz | slate | ‡ |
| homework | indigo | ❦ |
| exam | crimson | † |
| configure | graphite | ⁂ |
| study-skills | muted teal | ‖ |

**Layout.** Asymmetric, with hanging ornaments and editorial decks — like the opening of a literary essay. Dropped initials, sectional rules, generous trapped white space. Cards exist only where they earn their place; tables-of-contents are preferred for listings.

**Copy.** Invitational and quiet. Empty states read as invitations ("There are no documents yet. Bring me something to teach you."); errors are framed without alarm; loading is a slow italic ellipsis, not a spinner.

**What the system refuses.** Notifications. Streak counters. Badges. Dopamine-tap surfaces. Engagement metrics shown to the student. Excessive animation. Color used as alarm. A tutor's job is to keep the student focused; the product never competes for that focus. This is not a feature backlog item to triage — it's a constraint on what gets built at all.

**Design-system contract.** The editorial language is codified at `.mockups/design-system/` as the source of truth that every UI mock and every production component links: `tokens.css` (color, type, spacing, radii — the Studio Quiet palette), `components.css` (the two-tier component contract — shared primitives at tier 1: editorial marks (`editorial`, `editorial-kicker`, `editorial-deck`, `ornament`), section heads, `route-header`, `btn`, `field`/`input`/`textarea`/`select`/`checkbox`, `card`, `empty-state`, `error-message`, `loading-state`, `modal`, `dropdown`, `tabs`, `badge`, `pill`, `skeleton`, `progress`, `step-dots`; selected domain widgets at tier 2: the composer family (`composer` + `composer-verbs` + `composer-sketch-button` + `composer-input`), `assignment-item-card`, `assignment-card`, `prompt-block`, `concept-link-overlay`, `claude-auth-modal`), and `motion.css` (named easing curves, Doherty-coupled durations, designed pauses, reduced-motion fallbacks — locked to the Productive attitude). Production code reaches these via the editorial CSS utility (`composes: editorial from global`) and the editorial React primitives in `@praxis/ui/components/`. Raw color or spacing values in CSS modules are drift; the contract is the only place they're authored.

## Onboarding flows

Praxis supports three onboarding paths. They share the same backend machinery — the difference is seed context.

### 1. Parent / teacher deliberate authoring

**Who**: a parent setting up Praxis for their child, or a teacher building a course for a class.

**Flow**:

1. **First-run greeting** in configure mode. Agent greets, asks for context (who's the student, what subject, what's the goal).
2. **Subject selection** — pick a canonical subject pack (Math, Biology) or "custom subject."
3. **Material upload (optional but encouraged)** — drag in textbook PDFs, syllabus, lesson notes. Ingestion runs in the background; progress surfaces on the status strip without blocking other use.
4. **Course shape conversation** — agent and configurator co-author lesson sequence. Agent suggests; configurator confirms or edits via chat or via the structured editor visible alongside. Courses drafted from materials now have a unit structure (units → lessons → lesson assessments) rather than a flat lesson list.
5. **Threshold and gate setup** — configurator picks defaults or customizes. Sensible defaults from the canonical pack.
6. **Teaching style selection** — knobs for Socratic ↔ lecture, terse ↔ verbose, formal ↔ casual. Live preview of a sample exchange.
7. **Lock code (optional)** — configurator can set a lock now or leave unlocked.
8. **Hand-off** — UI switches to student mode. The student arrives to a configured tutor.

**Time target**: under 2 hours of guided configuration for a complete course.

### 2. Student self-onboards their school class

**Who**: a student who wants Praxis to support what's happening in their actual school class.

**Flow**:

1. **Greeting** — agent asks what class they're in.
2. **Material upload** — student drags in syllabus + textbook + class notes.
3. **Course create** — student opens a course-create session; the agent calls `course.start_drafting`, which runs a multi-turn agentic loop reading documents via outline / section / page tools and building a draft with units, lessons, and assessment shells. Progress surfaces on the status strip.
4. **Confirmation** — UI shows the draft course (lesson sequence, concept graph, suggested gates). Student reviews and edits. Agent walks through it conversationally if asked.
5. **First session** — student starts a `teach` session on the first concept.

**Time target**: under 30 minutes from upload to a usable tutor session.

**Important UX detail**: extraction is presented as *Praxis's best guess*, not as truth. The "best guess" badge stays on extracted graphs until a configurator confirms them. Visible to the student so they understand the source.

### 3. Self-directed learner

**Who**: an adult or older student learning something they've chosen, with no school class as anchor.

**Flow**:

1. **Greeting** — agent asks what they want to learn.
2. **Source selection** — student says "I have these books" (upload) or "what should I read?" (agent suggests references, possibly external).
3. **Goal-setting** — agent helps shape a learning goal: depth (overview / working knowledge / mastery), timeline (a weekend / a month / open-ended), motivation (curiosity / project / certification prep).
4. **Course shape** — agent proposes a course outline based on goal and materials. Conversational confirmation.
5. **Optional gating** — for self-directed learners, gating defaults to soft. They can opt into strict gating if they want the discipline.
6. **First session** — same as path 2.

## Lock-code flow

The lock is the **only** auth gate in the local-first deployment. It exists to keep the student out of configuration, not to authenticate identities.

**Setting a lock**:

1. From configure mode, the configurator selects "Set lock code."
2. UI prompts for a 4–8 digit code, twice for confirmation.
3. Lock is stored locally (hashed; salt is the install ID).
4. After setting, the configure surface remains available for the current session. On next launch, it requires the code.

**Lifting the lock at runtime**:

1. From the student surface, the configurator taps the lock icon in the corner.
2. UI prompts for the code.
3. On success, configure surface becomes accessible until next launch (or until manually re-locked).

**Lost lock**:

1. Recovery requires either (a) the original code or (b) a documented "factory reset" that wipes the install — there is no remote recovery in local-first.
2. Hosted deployments use account auth; lost lock is recoverable via the account, but configuration is also gated by a per-student lock independent of the account.

**Important**: the lock is a UX gate, not a security boundary. A determined adversary with file-system access can bypass it. The threat model is "kid trying to game the system," not "attacker."

## Student surface — Library

The front door. The **Workbench** posture — "where do I pick up?" rather than
"what exists?" The library is a priority-ordered action surface, not a catalogue.

```
┌─────────────────────────────────────────────────────────────┐
│   Good morning. There's three things ready for you.         │
├──────────────────────────────┬──────────────────────────────┤
│  WHAT'S NEXT                 │  LATELY                      │
│                              │                              │
│  ▶ Resume Algebra I          │  teach · algebra · fractions │
│    Lesson 4 · fractions      │  yesterday                   │
│                              │                              │
│  ✦ Review 12 cards           │  course create · calculus    │
│    Low-mastery · 3 concepts  │  Tue 2pm                     │
│                              │                              │
│  ✓ Quick check               │  quiz · algebra-3            │
│    Algebra I · Unit 2        │  Mon 9am                     │
│                              │                              │
├──────────────────────────────┴──────────────────────────────┤
│  [📦 Packs · 3]  [⬡ Concept maps · 5]  [+ Create a course] │
└─────────────────────────────────────────────────────────────┘
```

**Affordances:**

- **What's-next queue.** Left column shows priority-ordered recommendations from
  `RecommendationService` (resume session, review due cards, practice low-mastery
  concept, resume draft, quick check). Each row has a CTA that opens a session tab.
- **Lately timeline.** Right column shows chronological recent sessions grouped by
  age (Today / Yesterday / N days ago). Clicking reopens the session in a tab.
- **Footer cards.** Packs, Concept maps, and Documents counts with quick-access links.
  A "+ Create a course" highlighted card appears when the student has documents but
  no fitting course — entry point to the 5-step course-create flow.
- **Greeting line.** Names the count of ready things using natural language ("There's
  three things ready for you."). Adapts to empty state and time of day.
- **Tab-opening primary actions.** Every item's primary action opens a new tab in the
  chat workspace, never replaces the current one.
- **Recent sessions are browsable.** Reopening a closed session reopens its tab.
  Archived sessions remain accessible via the lately timeline.

## Student surface — Tutor workspace

Every session lives inside the Tutor workspace (nav label "Tutor", route `/chat`). The body's shape is determined by the active tab's mode. Each tab's title is generated from `Mode.displayName` — e.g. "teach · algebra fractions" or "course design · new course". Tabs land in Phase 14; per-modality bodies in Phase 16.

### Tab strip

The tab strip lives in the **running head** (`<TopNav tabsSlot>`), not inside the `/chat` route body. It is visible on every surface, not just the Tutor workspace. Open tabs render as italic deck-line typography to the right of the primary surface nav:

```
  Praxis   § Library  ¶ Workspace  …   OPEN  ● algebra · teach  ·  ● calc-intro · course-create  ·  ● quiz-3 · quiz  +
                                                ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
                                                (active tab: mode-tint hairline underline)
```

- **Typography**: italic serif, 13 px (`font: italic 13px / 1 var(--font-serif)`). Middle-dot (`·`) separators between adjacent tabs. A `OPEN` mono kicker precedes the group.
- **Ornament**: a small coloured CSS dot (`5 × 5 px`, `border-radius: 50%`, `background: var(--mode-tint)`) — not a Unicode glyph. Each mode's tint colour fills the dot.
- **Active state**: the active tab's title goes to `--color-text-primary` and receives a `border-bottom: 1px solid var(--mode-tint, var(--color-accent))` hairline underline.
- Each tab is a live session of any mode. Multiple sessions run simultaneously; switching is instant.
- The `+` button (mono, right of the strip) opens a quick session picker (mode + course + optional assignment).
- Closing a tab (× button, visible on hover/active) archives the session — it stays in Library's archive and is reopenable.
- Open tabs survive app restart. The workspace restores exactly where you left off.
- **Parent-child decoration**: child session tabs show a `from {parentMode}` mono pill to the right of the title. The parent tab shows a brief pulse dot (CSS keyframe animation) when a child session emits a `system_note` callback.

### Per-modality bodies

The body of an active tab takes its shape from the mode. The agent is present in every mode, but its presence and the surface it shapes are different in each.

#### teach (chat)

The familiar conversational chat. Streamed messages with KaTeX, code blocks, citations, sketch input. Composer with mode-aware tutor-verb chips above the textarea: *explain · quiz me on · let me try · show your work · slower · go deeper*. This is the default modality; everything that worked in earlier phases continues to work.

```
┌───────────────────────────────────────────────────────────┐
│  §  MODE                                                  │
│     teach                                                 │
│     — a guided lesson                                     │
│ ────────────────────────────────────────────────────────  │
│                                                           │
│   Tutor: Last time you worked through y = mx + b.         │
│          Today: solving for x when m and b are given.     │
│                                                           │
│          Try this one first:                              │
│                                                           │
│          Solve for x:  3x + 5 = 20                        │
│                                                           │
│          Take a minute. I'll wait.                        │
│                                                           │
│   ────────────────────────────────────────────────────    │
│   EXPLAIN  ·  QUIZ ME ON  ·  LET ME TRY  ·  SLOWER        │
│   ┌───────────────────────────────────────────────────┐   │
│   │  ▌                                                │   │
│   └───────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

#### course-create (canvas + outline)

A nearly-blank canvas with a single open prompt. As the student and agent talk through what to cover, the outline of the course-being-built appears in a side rail and grows visibly. Conversation in the body builds structure on the side. The student watches the course take shape.

#### quiz (flashcard rhythm)

One item at a time; the center column shows the current item card with a ghost preview of the next item below it. A **mode-rule banner** at the top of the center column explains the policy in-surface: no tutor scaffolding during the quiz — the tutor is held for after-quiz narration. No long chat scroll; review feels rhythmic.

**Right rail** — a 280 px item-status grid: one numbered dot per item, color-coded by state (upcoming / current / answered / skipped). An item-kinds summary and a progress line (`N answered · M skipped · K ahead`) appear below the dot grid.

**Confidence band** — rendered below the answer area on each item card via `AssignmentItemCard`. The student rates `1`–`4` before moving on; this lets the system distinguish "I knew it" from "I guessed."

**Navigation** — "Submit answer" advances to the next unanswered item; "Skip for now" parks the current item. When all items are answered or skipped, a "Ready to submit" gate appears with a final submit button. Feedback on each item appears only after the full quiz is submitted; the tutor then narrates the misses in the linked teach session.

```
┌─────────────────────────────────────────┬────────────────────┐
│  ‡  quiz · algebra-3         item 3/12  │  Items             │
│ ──────────────────────────────────────  │  ● ● ▶ ○ ○ ○ ○ ○  │
│                                         │  ○ ○ ○ ○           │
│  ┌ This is quiz mode. No tutor          │  3 answered ·      │
│  │ scaffolding during the quiz —        │  9 ahead           │
│  └ tutor returns after you submit. ───  │                    │
│                                         │  Item kinds        │
│    What is the derivative of ln(x)?     │  ‡ 8 single-choice │
│                                         │  ‡ 4 numerical     │
│    [ answer input ]                     │                    │
│                                         │  Quiz mode ·       │
│    confidence:  1  2  3  4              │  no time limit     │
│                                         │                    │
│    [Skip for now]  [Submit answer ↵]    │                    │
│                                         │                    │
│  ┌ item 4/12 · next ─────────────────   │                    │
│  │  Solve for …                         │                    │
│  └───────────────────────────────────   │                    │
└─────────────────────────────────────────┴────────────────────┘
```

#### homework (paginated problem set)

Per-problem workspace combining sketch + typed input + a chat side-rail. Auto-saves on each navigation. Per-problem feedback after submission of the whole set. The chat side-rail is for asking the tutor to explain a concept — never to solve the problem for you.

#### exam (proctored)

Full-tab proctored layout. Timer in the kicker. Problem-by-problem nav. Sketched and/or typed answers. **The AI agent is restricted to a single capability — clarifying ambiguous wording.** No `explain`, no `let_me_try`, no method help, no hints. Like a teacher proctoring an exam: present, helpful only on the meta question. The restriction is enforced server-side via a tool-registry constraint, not just by prompt.

```
┌───────────────────────────────────────────────────────────┐
│  †  EXAM            19:42 remaining     question 4 of 8   │
│ ─────────────────────────────────────────────────────  ── │
│                                                           │
│   4.  Solve for x:                                        │
│                                                           │
│           3x + 5 = 20                                     │
│                                                           │
│       answer  [               ]                           │
│       work    [ ✏ sketch ]                                │
│                                                           │
│ ── ask for clarification ─── [< prev]   [next >]   [end]  │
└───────────────────────────────────────────────────────────┘
```

#### configure (split-pane authoring)

Largely as today: chat on the left, structured editor on the right. The editorial polish in Phase 13 brings it into visual alignment with the rest of the app, but the structure remains.

### Cross-modality affordances

These hold inside every tab body, regardless of mode:

- **Streamed messages** — model output streams character-by-character via the transport, with eased pacing (Phase 13) so it reads as someone *thinking and writing*. Tool calls appear as inline status ("checking with sympy…") with results rendered when ready.
- **Embedded artifacts** — math expressions render via KaTeX; plots render inline; code blocks with syntax highlighting.
- **Sketch input** — inline tldraw. Stylus / Apple Pencil / Wacom supported via pressure-sensitive Pointer Events. Tutor reads both the tldraw snapshot JSON and the rendered image.
- **Source signaling** — citations are clickable chips ("from your textbook, p.47"); clicking opens the source in a side panel.
- **Productive-failure indicator** — when the tutor is waiting for an attempt, a soft visual indicator shows the wait window without explicit countdown pressure (suspended in exam mode, where time pressure is the explicit point).
- **Hint requests** — discrete "I'm stuck" affordance available in teach / homework / quiz; absent in exam (the exam agent doesn't hint).
- **Auto-spawn** — when the teach-mode tutor calls `assignment.create`, `useAssignmentIssuedSpawn` picks up the `ActivityItem` with `metadata.kind === "assignment.issued"` and automatically opens a child tab in the right modality (quiz / homework / exam) without stealing focus from the teach tab. The student finishes the assignment in the child tab; the tutor is notified via `system_note` when they submit.

**What the workspace doesn't do:**

- No "give me the answer" button anywhere.
- No retry-on-graded-item without confirmation; once submitted, it's submitted.
- No notifications, badges, or streak surfaces.

**Future (v1.x): tutor shared canvas.** The tutor draws on the same tldraw surface alongside the student — for geometry, function graphs, free-body diagrams, anything visual. Requires UX work for "the tutor is drawing now" affordance and turn-taking semantics. Out of scope for v1.

## Student surface — Progress map

Out-of-conversation view. Visible from a persistent rail or a top-level tab.

```
                    Algebra 1
    ┌────────────────────────────────────────────────────┐
    │                                                    │
    │   ● Linear Equations  ────  ● Solving for x        │
    │     mastered (0.85)         in progress (0.62)     │
    │                                  │                 │
    │                                  ▼                 │
    │                             ○ Word Problems        │
    │                              locked                │
    │                              (needs 0.7 on left)   │
    │                                                    │
    │   ● Slope ──────────  ○ y = mx + b ──── ○ Graphing │
    │     mastered           locked              locked  │
    │                                                    │
    │   ▢ Quiz: linear basics (recommended)              │
    │   ▢ Review: Slope (due in 2 days)                  │
    │                                                    │
    └────────────────────────────────────────────────────┘
```

**Key affordances:**

- **Concept nodes** colored by mastery: green = mastered, yellow = in progress, gray = locked.
- **Mastery scores** visible (a calibrated 0–1 reading). The metacognition coach asks the student to *predict* their mastery before showing it — calibration is itself a metacognitive skill.
- **Edge lines** represent prerequisite relationships. Strong edges solid; weak edges dashed.
- **Locked content** is *visible but not accessible*. Hovering shows the prerequisites needed to unlock.
- **Recommendations** in a sidebar — quizzes, reviews, lessons the adaptive router suggests. The student can take or defer.
- **Unlock notifications** — when a session ends and a gate opens, the next session's opening shows a celebratory but not gamified surface ("you've unlocked Word Problems"). One screen, then move on.

## Student surface — Workspace

A dedicated note-taking and study surface. Accessible during a session (alongside chat) or standalone (for review and self-study).

```
┌─────────────────────────────────────────────────────────────┐
│   Notes — Linear Equations                  [Cornell ▾]     │
├─────────────────────────────────────────────────────────────┤
│   Key questions          │   Details                        │
│   ──────────────         │   ──────────                     │
│   What is a linear       │   • Form: y = mx + b             │
│   equation?              │   • m = slope, b = y-intercept   │
│                          │   • All x's have power 1         │
│                          │                                  │
│   How do I solve for x?  │   • Isolate x using inverse ops  │
│                          │   • Reverse order of operations  │
│                          │   • Example: 3x + 5 = 20         │
│                          │     → 3x = 15 → x = 5            │
│                          │                                  │
│  ────────────────────────┴────────────────────────────────  │
│   Summary                                                   │
│   ────                                                      │
│   A linear equation is a relationship where x has power 1.  │
│   To solve, isolate x by undoing operations in reverse.     │
│                                                             │
│  💡 Coach: Try a Feynman explanation? [start]              │
└─────────────────────────────────────────────────────────────┘
```

**Format options** (selectable per note):

- **Cornell** — the default. Three-region layout for questions / details / summary.
- **Feynman** — single text area with a coach-driven follow-up panel.
- **Outline** — hierarchical bullet list for structural note-takers.
- **Free** — plain text for resistance to the system's preferences.
- **Sketch** — full canvas (tldraw) for visual notes, diagrams, geometry, hand-drawn graphs, free-body diagrams, chemistry structures, history maps. Stylus-friendly with pressure sensitivity. Persisted as a `Note` with `format: "sketch"`.

**Cross-cutting:**

- Notes link to concepts and lessons. Reading a note shows what it links to; reading a lesson shows what notes touch it.
- The metacognition coach can review notes ("would you like me to ask you Socratic follow-ups on this?") but never edits them.
- Flashcards can be generated from notes (`make flashcards from this section`) — the student confirms each before adding.
- All workspace content is searchable globally.

## Student surface — Concept map

A first-class spatial editor for student-authored concept maps. Sibling to the workspace; opens to its own surface.

```
┌─────────────────────────────────────────────────────────────┐
│   Concept Map — Cell Biology                     [Save]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│      [Cell Membrane] ──── controls ───→ [Transport]         │
│            │                                                │
│            └── contains ──→ [Proteins] ───→ [Enzymes]       │
│                                                             │
│            ▢ Suggested: connect [Mitochondria]?             │
│                                                             │
│  ───                                                        │
│  ⚠ Coach: You drew [Photosynthesis] → [Respiration].        │
│      Your textbook frames them as parallel processes        │
│      that share intermediates. Want to discuss?             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Affordances:**

- **tldraw canvas** — freeform shapes, arrows, text labels, sticky notes. Stylus-friendly with pressure sensitivity. Infinite canvas (students can sprawl as their understanding grows).
- **Concept linking** — when the student types a label that matches a canonical concept, the UI prompts to link the drawing node to the concept (improves comparison fidelity). Linked nodes get a subtle visual marker.
- **Canonical hints (toggleable, off by default)** — ghosted suggested connections from the canonical concept graph that the student hasn't drawn. Off by default for productive struggle; on for review.
- **Coach commentary** — the metacognition coach compares the student's map to the canonical graph and surfaces *productive disagreements*. Triggered by the student or at session-end review. The framing is exploratory ("let's discuss") rather than corrective ("you're wrong").
- **Versioned over time** — saving creates a new version. The student can see how their concept map evolved as they learned.

Concept maps live as `ConceptMapDrawing` artifacts and persist alongside the course. Editable across sessions. Comparing the student's map against the canonical graph is one of the highest-leverage metacognitive teaching moments — it forces externalization and confrontation of the gap.

## Answer submission — cross-cutting

Submission is no longer its own surface; it's an affordance that lives inside the homework, quiz, and exam modality bodies. The mechanics are the same in each, so they're documented once here.

**Three input paths** for submitting work:

1. **Type** — direct text/LaTeX input.
2. **Sketch** — inline tldraw canvas. Stylus-friendly. The tutor reads both the snapshot JSON and the rendered image; the JSON when shape primitives carry meaning, the image otherwise. Higher `needs-human-review` rate than typed input but expected.
3. **Upload photo** — for paper-and-pencil work. Vision OCR via the engine adapter.

**Upload / sketch flow** (handwritten or drawn work):

1. Student takes a photo, uploads a file, or sketches inline.
2. UI shows the input and runs vision OCR via the engine adapter.
3. Extracted LaTeX is rendered inline ("we read your work as `2x - 7 = 11; 2x = 18; x = 9`"). Student confirms or corrects.
4. On confirmation, the verification round-trip runs (re-render, sympy validate). If mismatch, UI asks for clarification.
5. If everything checks out, the answer is submitted.

**Per-item feedback** appears after the full assignment is submitted (homework / quiz) or at exam end (exam doesn't show feedback per-item until completion). Feedback explains *why*, with citations to the textbook where applicable, not just right/wrong.

**Mode-specific differences:**

- In **quiz** the rhythm is one-item-at-a-time; "Submit answer" confirms the current item and advances to the next; `1`–`4` rates confidence per item; a final submit gate sends the full set and unlocks tutor feedback.
- In **homework** submission is per-problem with auto-save; the chat side-rail is available for explanation but won't solve the problem.
- In **exam** submission is per-problem with no live feedback; the agent is restricted to clarifying ambiguous wording (no method help, no hints).

## Inline quick-check cards

Quick checks are formative probes the tutor calls mid-explanation without spawning an assignment tab. Each one renders inline in the chat thread as a `<QuickCheckCard>` — a system-tagged message bubble, visually distinct from ordinary chat messages and from the graded assignment surface.

**Visual treatment.** The card sits in the message flow between chat bubbles. It carries a thin hairline border and a discreet `tutor asked ·` kicker above the prompt text, rendered in the uppercase mono typeface that signals structural metadata throughout the editorial system. No modal, no overlay, no tab change — the conversation continues around it.

**Card anatomy.** From top to bottom: the kicker tag, the prompt text set in the standard body type, the item-specific input control (radio buttons, checkboxes, pair columns, etc.), and a `submit` button. The submit button is disabled until the input is valid. For `requireReasoning` items, a textarea labeled `explain your thinking` appears below the choice control and must be non-empty before submission is permitted.

**Locked state.** Once the student submits, the card locks: all controls become inert and the submit button is replaced with a quiet `answered` marker. When the tool was authored with a `correctIndex` (or equivalent), the locked card overlays correctness feedback in the editorial palette — correct answers with a `°` ornament, incorrect with an `·` ornament, never with color alone. The tutor's next message in the thread immediately follows and narrates the response.

**Persistence across tab switches.** Because the chat tab body uses `display:none` rather than unmounting during tab switches (per the `tab-body-isolation` pattern), a pending card survives navigation. If the student switches away and back, the card is still there waiting. A closed tab whose session is still active similarly preserves the card; abandonment only occurs if the session itself ends.

**Multiple in-flight checks.** If the tutor issues more than one quick check before the student answers (unusual but possible), each renders its own card in order, top-to-bottom by call arrival. The student answers them in whatever order they choose.

**What stays out of episodic.** The synthetic system message that holds the card never reaches the episodic log. The `tool_call` event and the `tool_result` event that bracket the card do appear in episodic — the transcript shows that the tutor asked a question and the student answered, in the normal event flow.

## Structured question cards (course-create / configure)

`ask_student_question` is the course-create / configure cousin of the quick-check card — a structured-choice prompt the agent uses mid-flow to clarify intent without yielding the turn. Visually identical chassis to `<QuickCheckCard>` (kicker tag, prompt body, choice control, submit button), but the kicker reads `tutor asked` in configure-mode contexts and the card always carries a `choice required` semantic — the agent's next step depends on the answer, so there is no "skip" affordance. Rendered as `<StructuredQuestionCard>` (`packages/ui/src/components/structured-question-card.tsx`).

Locked-state treatment mirrors quick-check: controls become inert on submission and the submit button is replaced with a quiet `answered` marker. Because these questions don't carry a `correctIndex` (they're disambiguation, not assessment), the locked card omits correctness feedback — only the chosen answer is shown.

Persistence across tab switches and abandonment semantics are identical to quick-check (the same tool-bridge IPC family applies). The chat-thread placement and "stays out of episodic" rules also apply.

---

## Item kind UX patterns

The nine item kinds share a common outer wrapper (`<AssignmentItemCard>`) but each has a distinct input control. The same per-kind body components power both the assignment surface and `<QuickCheckCard>`.

**single-choice.** A vertical radio column. Selected state: the chosen option fills with the mode tint at 8% and gains a hairline border. Submitted locked state: correct option marked with a `°` ornament; incorrect selected option marked with `·`. No partial credit.

**multi-select.** A vertical checkbox column. Partial-credit feedback is per-option: after submission each option shows its individual status — selected-and-correct, selected-and-wrong, or missed-correct — so the student sees exactly where partial knowledge ended.

**numerical.** Two inline inputs: a numeric value field and, when `expectedUnits` is set, a text units field beside it. A sig-fig hint line ("round to N significant figures") appears below the value input when `significantFigures` is set on the item. Both fields are required for submission when units are expected.

**matching.** Two columns — left items and right items — in a card with adequate horizontal clearance. Primary interaction is drag-and-drop: the student drags a left-column item and drops it onto a right-column item; an SVG line appears connecting the pair. Lines redraw on scroll or resize. A "use keyboard" affordance in the card corner switches to a pick-from-dropdown fallback: each left item gains a select control listing all right items. Devices with no pointer events (touch-only) and sessions where `prefers-reduced-motion` is set default to the dropdown mode automatically. Both modes produce the same `{ leftId, rightId }[]` response payload.

**ordering.** A vertical list shown in shuffled order. Primary interaction is drag-and-drop: the student drags rows up and down to reorder. Each row also carries a pair of up / down buttons that serve as the keyboard fallback — full keyboard operability with no mouse required. Submitted locked state shows the student's order with correct-position items marked `°` and misplaced items marked `·`.

**two-tier.** Two stacked question blocks. Tier-1 renders as a standard radio column; tier-2 is hidden until the student selects a tier-1 option — this is deliberate, so the student commits to an answer before seeing the distractor reasons. After tier-1 selection, tier-2 reveals with its own radio column. The submit button is disabled until both tiers are answered (and, if `requireReasoning` is set, the reasoning textarea is non-empty).

**requireReasoning modifier.** When set on a `single-choice`, `multi-select`, or `two-tier` item, a textarea labeled `explain your thinking` appears directly below the choice control. It is required for submission: the submit button stays disabled while the textarea is empty. The reasoning text travels in `AssignmentResponse.work`, the same field used by `workRubric` items; the grader can tell them apart because `requireReasoning` lives on the item schema.

**Editorial conventions throughout.** All item kind labels, button text, and ornament characters follow the editorial language established in Phase 13: lowercase, typographic ornaments (`°`, `·`, `⌖`) for status signaling, no color-only status (always paired with ornament or label), no emoji.

---

## Configure surface — Course authoring

Lock-gated. The configurator and the agent co-build a course.

```
┌─────────────────────────────────────────────────────────────┐
│   Configure: Math 8 (Sara)                                  │
├─────────────────────────────────────────────────────────────┤
│  Conversation                       │   Course outline      │
│  ─────────────                      │   ───────────────     │
│  Agent: I've imported the textbook  │   ▸ Unit 1: Numbers  │
│         and identified 47 concepts. │     ▸ Lesson 1.1     │
│         I've drafted a 12-week      │     ▸ Lesson 1.2     │
│         outline. Want to review?    │   ▸ Unit 2: Algebra  │
│                                     │     ▸ Lesson 2.1     │
│  You:  Show me Unit 1.              │     ...              │
│                                     │                       │
│  Agent: [Structured view at right.  │   [Edit  Add  Move]   │
│         Reorder, add, or remove     │                       │
│         lessons. Tell me when you   │                       │
│         want to talk about gates.]  │                       │
│  ▌                                  │                       │
└─────────────────────────────────────────────────────────────┘
```

The split-pane: **chat** on the left for conversation; **structured editor** on the right showing the artifact. Edits in either propagate; the agent narrates significant changes.

## Configure surface — Gate editor

Visual editor for the gate graph. Powered by **React Flow** with custom React node components per gate type.

```
┌─────────────────────────────────────────────────────────────┐
│   Gates — Math 8                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│         [Gate: Linear Eqs] ─── strength: 0.9 ──→            │
│              ↓ unlocks                                       │
│         [Gate: Solving for x]   threshold: mastery >= 0.7   │
│              ↓ unlocks                                       │
│         [Gate: Word Problems]   threshold: exam pass 0.7    │
│                                                             │
│  Selected: Gate: Solving for x                              │
│  ┌───────────────────────────────────────┐                  │
│  │ Prerequisites:  Linear Eqs (0.9)      │                  │
│  │ Criteria:       mastery >= [0.7  ]    │                  │
│  │ Decay days:     [14  ]                │                  │
│  │ Allow retake:   [✓]                   │                  │
│  │ Override:       [Set override...]     │                  │
│  └───────────────────────────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Affordances**:

- **React Flow canvas** — drag a gate node to reposition; drag from a gate's output handle to another gate's input to add a prerequisite edge; double-click a gate for the inspector.
- **Custom node components** per gate type — concept-mastery gates, exam gates, AND/OR composite gates each render with their type-appropriate UI.
- **Soft / strict toggle on each edge** — visual indicator (solid vs. dashed) and explicit setting.
- **Override** with required reason — captured in `GateState.kind: "overridden"`.

## Configure surface — Prompt customization

Surfaces the prompt-composition system as a two-section config tab.

```
┌─────────────────────────────────────────────────────────────┐
│   Teaching Style                                            │
│   Adjust how the tutor communicates. Changes apply          │
│   globally across sessions.                                 │
│   ─────────────────────────────────────────────────────     │
│   Guidance style   Lecture ◀────●──────────────▶ Socratic   │
│   Verbosity        Terse   ◀──────────●──────▶ Verbose      │
│   Tone             Casual  ◀────────────●────▶ Formal       │
│                    [ Save style ]                           │
├─────────────────────────────────────────────────────────────┤
│   Prompt blocks                                             │
│   Every slot in the composed prompt, listed in render       │
│   order. Toggle between editable blocks and assembled       │
│   output.                                                   │
│   ─────────────────────────────────────────────────────     │
│   Mode: [ teach ▾ ]          [ Blocks ] [ Composed ]        │
│                                                             │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ global prompt          user-global      [ edit ]     │  │
│   ├──────────────────────────────────────────────────────┤  │
│   │ preamble               preamble  edited [ edit ]     │  │
│   │   "You are a patient…"                  [ diff ]     │  │
│   ├──────────────────────────────────────────────────────┤  │
│   │ graded grounding  principles  locked                  │  │
│   │   (read-only — non-customizable fragment)            │  │
│   ├──────────────────────────────────────────────────────┤  │
│   │  …one block per fragment in FRAGMENT_ORDER…          │  │
│   ├──────────────────────────────────────────────────────┤  │
│   │ teach append           user-append      [ edit ]     │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                             │
│   — Composed view shows the assembled prompt with each      │
│     segment colour-coded by source (default / override /    │
│     global / append / additional).                          │
└─────────────────────────────────────────────────────────────┘
```

**Section 1 — Teaching Style**: Three global sliders (Guidance style Lecture↔Socratic, Verbosity Terse↔Verbose, Tone Casual↔Formal) saved via `author.setStyleSliders`. Apply across all modes and sessions.

**Section 2 — Prompt blocks**: A unified block-stack (`PromptBlockStack`) that shows every fragment slot in `FRAGMENT_ORDER` for the selected mode.

- **Mode picker** — dropdown driven by `Mode.displayName`; changing it reloads the per-mode user-append block while the global block persists.
- **Block list** — one `PromptBlock` per slot, ordered by `FRAGMENT_ORDER`. Synthetic singleton blocks for the cross-mode global layer (`user-global`) and the per-mode append layer (`user-append`) are inserted at their correct positions in the order.
- **Lock indicator** — non-customizable fragments (`PromptFragment.customizable === false`) render as locked; they show their text read-only with a "locked" badge. The edit button is absent.
- **Edit affordance** — customizable blocks show an "edit" button that opens an inline textarea. Only one block may be in edit-mode at a time. "save" / "cancel" controls commit or discard.
- **Override badge** — blocks carrying a user-supplied value show an "edited" badge. A "return to default" button appears alongside "edit" when an override is active.
- **Per-block diff** — customizable mode fragments expose a "diff" toggle that expands an inline side-by-side view: the fragment's unmodified default on the left, the current value on the right.
- **\[Blocks | Composed\] stack toggle** — switches the entire block area between the editable block list and the `AttributedPreviewPane` composed view. The composed view renders the fully assembled prompt as colour-coded segments via `composeSystemPromptWithAttribution` (per-segment source attribution: default / override / global / append / additional). While a block is in edit-mode, the composed view updates live as the draft changes.

Some fragments are **NOT customizable** — the verification principle and graded-grounding hierarchy are non-negotiable. These slots are visible in the block list but locked against edits.

## Configure surface — Memory inspector

Read-mostly view into the student model.

```
┌─────────────────────────────────────────────────────────────┐
│   Memory — Sara                                             │
├─────────────────────────────────────────────────────────────┤
│   [ Student model ] [ Misconceptions ] [ Strategies ]       │
│   [ Affective ]     [ Episodic ]                            │
│                                                             │
│   Student model (snapshot)                                  │
│   ────────                                                  │
│   Concept                       Mastery   Last  Decay       │
│   ────────────────────────      ───────   ────  ────        │
│   Linear equations              0.85      2d    14d         │
│   Slope                         0.78      5d    14d         │
│   Solving for x                 0.62      1d    14d         │
│   y = mx + b                    0.54      3d    14d         │
│   Word problems                 0.31      7d    14d         │
│                                                             │
│   [ Reset concept... ]   [ Export memory ]   [ Delete... ]  │
└─────────────────────────────────────────────────────────────┘
```

**Tabs**:

- **Student model**: concept mastery table.
- **Misconceptions**: list of active misconceptions, each with evidence and remediation. Configurator can mark "manually-cleared" with a documented reason.
- **Strategies**: procedural preferences (what works for this student).
- **Affective**: engagement / frustration / confidence over time, with a rolling-window chart.
- **Episodic**: searchable transcript browser, scoped by session / time / mode / concept.

**Edit posture**: read-mostly. The configurator can reset specific concepts (rare, defensible), mark misconceptions cleared, or wipe memory entirely (with strong confirmation). Episodic is immutable — "delete" means delete-the-projection-and-mark-the-episodic-events-redacted, not rewrite history.

## Configure surface — Engine and config settings

Engine selection, deployment-related settings, telemetry preferences.

- **Engine**: dropdown — Claude Code (local) / Codex (local) / Direct (API key per provider). Each shows status (connected, error, etc.).
- **Pedagogy pack**: version selection, custom-pack upload.
- **Telemetry**: opt-in toggles for product analytics (off by default in local).
- **Storage**: shows where data is stored, "open data folder" affordance, export/import.

## Cross-cutting interaction patterns

**Tabs persist; sessions persist.** Multiple sessions of any mode run in parallel as tabs in the chat workspace. Closing a tab archives the session (browsable in Library). Open tabs survive restart. The student can leave a homework tab open mid-problem, switch to a teach tab to ask about a related concept, and return to the homework with the cursor where they left it. Mental context is preserved by the system, not held in the student's head.

**Mode is identity, not just a setting.** Each mode has its own ornament glyph, tint, and tab body shape. The student doesn't need to remember what mode they're in — the workspace shows it constantly through the tab strip and the modality body. Modes are discoverable, not buried in a settings menu.

**Streaming with intercept and easing.** All long-running operations (agent loops, ingestion, indexer runs) stream progress via the transport. The UI never blocks on a long operation — even ingestion of a 500-page textbook progresses visibly while the user does other things. Model-text streaming is eased (Phase 13): a small ring buffer + `requestAnimationFrame` release schedule + per-chunk fade-in. Reads as someone *thinking and writing*, not as raw token output.

**Citations are first-class.** Every fact the tutor states from the textbook is a clickable citation chip. Clicking opens the source in a side panel. The student learns to expect citations and notice when they're missing.

**Productive-struggle visibility.** When the tutor is waiting for the student to attempt a problem, the wait is visible but not pressuring (a soft pulse, not a countdown). When help is given after struggle, it's framed: "now that you've tried, here's a scaffold."

**Reversibility.** Most actions are reversible (notes, flashcard creation, mode switches). Irreversible actions (memory delete, exam submission) require explicit double-confirmation.

**Coach voice consistency.** The metacognition coach has a recognizable voice across modes — a slightly different register from the content tutor. Visually distinguished (a small icon or color shift) so the student knows when the system is teaching them about *learning* vs. teaching them *content*.

**Sketching as an input modality.** Sketch is *additive*, never required. Workspace, submission, chat, and concept-map surfaces all offer sketching alongside typing. The tutor reads sketched input as `{ json, image }` — JSON when shape primitives are used, image as the always-meaningful fallback (younger students draw freehand and the JSON carries little semantic content for them; the image is what carries meaning). Stylus, Apple Pencil, Wacom, and Surface Pen all work via the Pointer Events API. iPad in Safari with Apple Pencil works without a native app.

## Accessibility and inclusivity

- **Color-blind safe** mastery palette (don't rely on red/green alone).
- **Keyboard-navigable** end-to-end. The chat input takes focus by default; tab order is sensible.
- **Screen-reader friendly** structured artifacts (proper landmarks, semantic HTML, ARIA where needed).
- **Reduced-motion** respect — animations dampen if `prefers-reduced-motion`.
- **Font size** adjustable (CSS `rem`-based scaling with a settings slider).
- **Math accessibility** — KaTeX with MathML output; alternative text for plots and diagrams.
- **Drawing input alternatives** — every sketch surface provides a typed equivalent. Students who can't or prefer not to draw are never blocked by sketch-required affordances.
- **Stylus input** — supported on iPad (Apple Pencil), Wacom tablets (Mac/Windows), and any device using Pointer Events. Pressure sensitivity respected where supported.
- **Language** — UI strings are externalized for future localization. v1 ships English only.
- **Content review** — the canonical pedagogy pack and concept graphs ship with content review for cultural sensitivity (no examples that center one demographic at the expense of others).
