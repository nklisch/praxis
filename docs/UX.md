# UX

The user-facing surfaces of Praxis. `ARCHITECTURE.md` describes what the UI is (a Vite + React + TanStack Router SPA talking to `@praxis/core` over a transport); this document describes what it *does* and what it *feels like* to use.

The UI has two top-level surfaces: **student** (the learning experience) and **configure** (authoring and tuning). They share the same SPA; the lock code controls which is accessible.

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
        ▸ Chat (active session)            ▸ Course authoring
        ▸ Progress map                     ▸ Gate editor (React Flow)
        ▸ Workspace (notes/cards)          ▸ Prompt customization
        ▸ Concept map (tldraw)             ▸ Memory inspector
        ▸ Submission                       ▸ Engine / config settings
        ▸ Unlock notifications
```

In the unlocked state, both surfaces are accessible through a single navigation. Setting a lock code hides the configure surface behind a lock gate and keeps the student surface open.

## Onboarding flows

Praxis supports three onboarding paths. They share the same backend machinery — the difference is seed context.

### 1. Parent / teacher deliberate authoring

**Who**: a parent setting up Praxis for their child, or a teacher building a course for a class.

**Flow**:

1. **First-run greeting** in configure mode. Agent greets, asks for context (who's the student, what subject, what's the goal).
2. **Subject selection** — pick a canonical subject pack (Math, Biology) or "custom subject."
3. **Material upload (optional but encouraged)** — drag in textbook PDFs, syllabus, lesson notes. Ingestion runs in the background; UI shows progress.
4. **Course shape conversation** — agent and configurator co-author lesson sequence. Agent suggests; configurator confirms or edits via chat or via the structured editor visible alongside.
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
3. **Bootstrap** — single tool call (`course.bootstrap_from_materials(...)`) runs ingestion + concept extraction + draft course assembly. UI shows a progress indicator with explanatory steps ("reading textbook chapters", "identifying concepts", "ordering lessons").
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

## Student surface — Chat

The primary interaction surface during a session.

```
┌─────────────────────────────────────────────────────────────┐
│  ◀ Algebra 1 / Linear Equations / Lesson 3      🔒 [Lock]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Tutor: Let's pick up where we left off. Last session you   │
│         worked through y = mx + b. Today: solving for x     │
│         when m and b are given.                             │
│                                                             │
│         Try this one first:                                 │
│                                                             │
│         ┌─────────────────────────────┐                     │
│         │  Solve for x:  3x + 5 = 20  │                     │
│         └─────────────────────────────┘                     │
│                                                             │
│         Take a minute. I'll wait.                           │
│                                                             │
│  You:  ▌                                                    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  📎 Upload work    ✏️ Sketch              Submit ──── [Send]│
└─────────────────────────────────────────────────────────────┘
```

**Key affordances:**

- **Streamed messages** — model output streams character-by-character via the transport. Tool calls appear as inline status ("checking with sympy...") with results rendered when ready.
- **Embedded artifacts** — math expressions render via KaTeX; plots render inline; diagrams via mermaid or similar; code blocks with syntax highlighting.
- **Sketch input** — opens an inline tldraw canvas. Stylus / Apple Pencil / Wacom supported via pressure-sensitive Pointer Events. Tutor reads both the tldraw snapshot JSON and the rendered image; preferred path varies by how cleanly the student used shape primitives vs. freehand strokes.
- **Submission affordance** — when the tutor is asking for an answer, the input field gets a "submit answer" treatment that signals commitment (a graded item can't be edited after submission).
- **Source signaling** — when the tutor cites the textbook, the citation is a clickable chip showing "from your textbook, p.47"; clicking opens the source in a side panel.
- **Productive-failure indicator** — when the tutor is waiting for an attempt, a soft visual indicator shows the wait window without explicit countdown pressure.
- **Hint requests** — a discrete "I'm stuck" button surfaces only after the productive-failure window. Pressing it gets a scaffold, not an answer.

**What it doesn't do:**

- No "give me the answer" button. There is no path through the UI to bypass productive struggle.
- No retry-on-graded-item without confirmation; once submitted, it's submitted.

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
- **Unlock notifications** — when a session ends and a gate opens, the next-session bootstrap shows a celebratory but not gamified surface ("you've unlocked Word Problems"). One screen, then move on.

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

## Student surface — Submission

When the tutor assigns work for submission (homework, exam, longer assignment), the submission surface handles intake.

```
┌─────────────────────────────────────────────────────────────┐
│   Homework: Linear Equations Practice         5 of 10       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Solve for x:                                              │
│                                                             │
│       2x − 7 = 11                                           │
│                                                             │
│   ─────────────────                                         │
│                                                             │
│   Answer:  ▌                                                │
│                                                             │
│   ● Type your answer                                        │
│   ○ Sketch your work (tldraw, stylus-friendly)              │
│   ○ Upload a photo of your work                             │
│                                                             │
│   Show your work (optional but recommended):                │
│   ┌──────────────────────────────────────┐                  │
│   │                                      │                  │
│   └──────────────────────────────────────┘                  │
│                                                             │
│  [< Previous]                          [Skip]   [Submit >]  │
└─────────────────────────────────────────────────────────────┘
```

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

Surfaces the prompt-composition system as a config UI.

```
┌─────────────────────────────────────────────────────────────┐
│   Prompt customization                                      │
├─────────────────────────────────────────────────────────────┤
│   Mode: teach                                               │
│   ─────────                                                 │
│                                                             │
│   ▸ preamble (default, customizable)                        │
│   ▸ role: tutor identity (overridable)                      │
│      Default: "You are a patient, curious tutor..."         │
│      Override: ▌ (empty)                                    │
│   ▸ principles: graded grounding (NOT customizable)         │
│   ▸ tools: per mode (auto-generated)                        │
│   ▸ context: course state (auto-generated)                  │
│   ▸ constraints: productive struggle (customizable)         │
│      Default: "Wait at least 90 seconds before scaffolding" │
│      Override: [Wait at least  60  seconds...]              │
│   ▸ postamble (customizable)                                │
│                                                             │
│   Style sliders                                             │
│   ─────────                                                 │
│   Socratic ◀────●─────────────▶ Lecture                     │
│   Terse    ◀──────────●─────▶ Verbose                       │
│   Formal   ◀──●─────────────▶ Casual                        │
│                                                             │
│   [Live preview of a sample exchange]                       │
└─────────────────────────────────────────────────────────────┘
```

Some fragments are **NOT customizable** — the verification principle and graded-grounding hierarchy are non-negotiable. Sliders adjust style; freeform fields override specific fragments.

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

**Streaming with intercept.** All long-running operations (agent loops, ingestion, indexer runs) stream progress via the transport. The UI never blocks on a long operation — even ingestion of a 500-page textbook progresses visibly while the user does other things.

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
