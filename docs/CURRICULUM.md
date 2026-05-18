# CURRICULUM

How Praxis teaches. This document captures the pedagogical commitments that drive the framework — the principles applied behind the scenes, the principles taught explicitly to the student, and how modes, gates, and adaptive routing operationalize them.

## Pedagogical stance

Praxis exists to make learning happen, not to make help feel good. Help that bypasses struggle produces nothing durable. Help that scaffolds the right amount of struggle — at the edge of the student's competence, with retrieval forced and feedback grounded — produces understanding that lasts and transfers.

Three commitments shape every mode and every tool:

1. **Verification, not vibes.** The tutor doesn't tell the student they're right because they sound right. Every grade is grounded in deterministic computation, retrieval, or an explicit rubric.
2. **Productive struggle, not handholding.** Friction is teaching's tool. Praxis withholds answers until effort is established, even when withholding is uncomfortable. Hints are scaffolded, not given whole.
3. **Metacognition is content.** *How* to learn is itself a curriculum. Source-awareness, retrieval practice, spaced review, structured note-taking, and Feynman explanation are taught as first-class skills, not assumed.

These are defended at the prompt level (mode prompts explicitly reject "just give me the answer" patterns), the tool level (no `solve_for_me` tool exists), and the gate level (mastery is earned through retrieval and assessment, not through time-on-task).

## Principles applied

These are the techniques the system uses *under the hood* — the student doesn't need to name them.

**Retrieval practice.** Testing as learning, not just measuring. Praxis routinely asks the student to recall before re-reading. Quiz items mid-lesson, not only end-of-unit. Recall produces stronger memory than re-reading even when re-reading feels more productive (Roediger & Karpicke, 2006).

**Spaced repetition.** Reviewing at expanding intervals, scheduled by an FSRS-style algorithm. Concepts get re-surfaced as flashcards or quick-quiz items just before predicted forgetting. Mastery decays in the student model with time-since-practice and triggers review.

**Interleaving.** Mixing topics rather than blocking them. After two lessons on linear equations, the system mixes in problems requiring earlier concepts (factoring, substitution) instead of drilling linear-only. Harder in the moment, better for transfer (Rohrer & Taylor, 2007).

**Dual coding.** Pairing verbal explanation with visual representation — diagrams, plots, animations, equation rendering. Tools include `plot_function`, `render_diagram`, and `render_latex`. The tutor reaches for visual when explaining novel concepts. **Bidirectional**: the student can also reason visually back, sketching with tldraw or Apple Pencil; the tutor reads both the structured JSON and the rendered image. Visual reasoning is treated as a legitimate channel, not a fallback.

**Elaborative interrogation.** Forcing "why?" answers, not just "what?". Quiz items include "explain why" prompts; the rubric grader rewards causal reasoning, not recitation.

**Worked examples → faded scaffolding → independent practice.** New concepts begin with a fully worked example, then partial scaffolds (some steps blanked), then unscaffolded problems. Mode prompts encode the progression; the adaptive router decides when to fade.

**Productive failure.** Letting the student struggle on a problem before scaffolding. The tutor waits a configurable interval ("don't help for 90 seconds unless asked"), prompts for an attempt, and only then provides scaffolds. Productive failure beats just-in-time help for transfer (Kapur, 2008).

**Bloom's progression.** Lessons sequence cognitive demand: remember → understand → apply → analyze → evaluate → create. Quiz items are tagged with Bloom's level; gates require demonstration at multiple levels, not just recall.

**Calibrated difficulty.** The adaptive router targets ~85% success rate per item — the empirically-supported sweet spot for learning (Wilson et al., 2019). Drops below trigger easier items; sustained 100% triggers a difficulty bump.

## Principles taught

These are the techniques Praxis explicitly teaches the student. The metacognition coach treats them as curriculum.

**Source authority.** Where does this fact come from? Is it from your textbook, your teacher's slides, the tutor's general knowledge, or the open web? The tutor signals its sources visibly; the metacognition coach asks the student to do the same in their own writing.

**Retrieval over re-reading.** The student is shown that re-reading feels productive but produces less retention than retrieval. The system makes retrieval the default study mode in the workspace.

**Spaced review.** The student learns to schedule reviews and the math behind why; the system builds review schedules for them and shows the schedule.

**Cornell-style note-taking.** Notes split into key questions / details / summary. The workspace supports the format; the coach prompts for it.

**Feynman explanation.** Explain it as though to someone who's never seen it. The workspace has a Feynman mode that prompts for plain-language explanation, then asks Socratic follow-ups to expose gaps.

**Concept mapping.** Drawing relationships between ideas as a spatial artifact (nodes, edges, clusters). The workspace has a real concept-map editor (tldraw with stylus support); students draw freely and link drawing nodes to canonical concepts. The system compares the student's map to the canonical concept graph and surfaces *productive disagreements* — "you drew Photosynthesis → Cellular Respiration as a direct dependency; the textbook frames them as parallel — let's explore that." This is one of the strongest opportunities for metacognitive teaching: it forces the student to externalize their mental model and confront the gap between it and the canonical structure.

**Visual reasoning.** Knowing when to draw vs. when to write. Sketching diagrams, free-body diagrams, function graphs, geometry constructions, and chemistry structures changes how the brain works the problem; for spatial / geometric / structural problems, visual reasoning often outperforms verbal. The student is taught when sketching helps and when it doesn't, with stylus / pen / pencil supported as primary input. The tutor models the choice — "this would be easier to see than to describe; let me sketch it" — and invites the student to do the same.

**Productive struggle as a habit.** The student learns to recognize struggle-that-helps from struggle-that-stalls and to ask for scaffolds when stuck — not before. The coach surfaces this metacognitive distinction explicitly.

**Goal-setting and self-monitoring.** The student learns to read the progress map, set short-term goals, and reflect on outcomes. Session-end prompts ask for a one-sentence reflection that gets stored alongside the episodic log.

The full content for each technique lives in the **pedagogy pack** (see below). The set above is the v1 minimum.

## Modes and their pedagogical role

The framework defines six v1 modes. Each is a configuration: prompt fragments, tools available, UI surface, and artifact scope.

### `teach`

The interactive lecture. Concept introduction, scaffolding, worked examples, fading.

- Prompt fragments emphasize: present a concept → ground in textbook → motivate with example → check understanding → fade scaffolding.
- Tools: `grade_math`, `code_sandbox`, `retrieve_from_documents`, course-navigation tools (`course.what_can_i_teach`, `course.start_lesson`, `course.current_concept`, `course.mark_studied`), `update_mastery`, `record_misconception`, `assignment.create`, 9 note/flashcard tools (`note.*`, `flashcard.*`), `sketch.read`, inline quick checks (`quick_check.single_choice`, `quick_check.multi_select`, `quick_check.short_answer`, `quick_check.matching`, `quick_check.confidence`), `pedagogy.list_metacognitive_prompts`. See `packages/curriculum/src/modes/teach.ts` for the canonical list.
- No exam tools. No assessment-taking tools (those live in quiz/homework/exam modes).
- Style: lecture-leaning *and* Socratic — adapts based on procedural memory (what works for *this* student).

### `quiz`

Short-form retrieval practice during or between lessons. Items rendered as a structured `<AssignmentCard>` inline in the chat. Agent voice: lively scaffolding; offers hints sparingly during work; narrates per-item feedback warmly after submission.

- Tools: `assignment.show`, `assignment.read_grade`, `course.what_can_i_teach`, `course.current_concept`, `retrieve_from_documents`, `grade_math`, `code_sandbox`, `update_mastery`, `record_misconception`, `pedagogy.list_metacognitive_prompts`
- `workRubric`: rare. Reserve for the 1-2 multi-step items per quiz where partial credit adds value.
- Approach feedback layer: ON for items without a rubric/workRubric (fallback enrichment)
- Submission: chat composer remains active throughout

### `homework`

Longer practice across multiple concepts, submitted in one batch. Agent voice: helpful clarifier; answers item-meaning questions but does not give answers; full feedback delayed until submission.

- Tools: same as `quiz`
- `workRubric`: common. Items rewarding process get partial credit on shown work.
- Approach feedback layer: ON for items without a rubric/workRubric (fallback)
- Submission: chat composer remains active throughout

### `exam`

Gated assessment. Strict tool subset, no help during the exam.

- Tools: `assignment.show`, `assignment.read_grade`, `sketch.read`, `clarification`, `pedagogy.list_metacognitive_prompts`. The `clarification` tool lets the agent rephrase a confusing prompt without revealing method or answer. `pedagogy.list_metacognitive_prompts` is permitted because it returns read-only metadata (reflection prompts), not method or answer help — consistent with the verification stance. See `packages/curriculum/src/modes/exam.ts` for the canonical list.
- Approach feedback layer: OFF (verification stance — no post-hoc feedback enrichment)
- **Free-response items require an explicit `rubric`** (validated at item-create). Rubric agent scores per-criterion (integer 0-10) with written rationales; total computed deterministically as weighted sum. Verification stance preserved through pre-committed criteria + per-criterion auditability + deterministic aggregation.
- `workRubric`: judgment-call per item. `primaryWeight` defaults to 1.0 (deterministic-only) unless explicitly authored otherwise.
- Submission: chat composer DISABLED until the student submits; re-enabled for post-submission feedback narration

### `study-skills`

The metacognition coach's dedicated mode. Teaches and practices the principles-taught list above.

- Prompt fragments emphasize: explain the technique → demonstrate → have student practice → reflect.
- Tools: pedagogy-pack reads (`pedagogy.list_strategies`, `pedagogy.get_strategy`, `pedagogy.list_techniques`, `pedagogy.get_technique`, `pedagogy.list_metacognitive_prompts`), concept-graph navigation (`course.what_can_i_teach`), workspace tools (5 `note.*` + 4 `flashcard.*`), inline quick checks (`quick_check.single_choice`, `quick_check.multi_select`, `quick_check.short_answer`, `quick_check.confidence`). See `packages/curriculum/src/modes/study-skills.ts` for the canonical list.
- Often spans across courses — study skills generalize.

### `course-create`

A pre-curricular mode for authoring a new course from uploaded materials. Available without lock; intended for student self-onboard (UX path 2 in `UX.md`) and for the parent / teacher's first course before lock-gated `configure` is set up.

- Prompt fragments: course-create-specific role + tools.
- Tools: `course.list_library_documents`, `course.attach_document`, `course.list_canonical_packs`, `course.use_canonical_pack`, `course.start_drafting`, `course.show_draft`, `course.edit_draft`, `course.confirm_draft`, `course.discard_draft`, `course.list_drafts`, `retrieve_from_documents`. The single-shot `course.propose_draft` is gone (Phase 16 replaced it with the agentic `course.start_drafting` entry point). See `packages/curriculum/src/modes/course-create.ts` for the canonical list.
- `course.start_drafting` runs a multi-turn drafter agent that reads documents via `document.outline` / `document.list_sections` / `document.read_pages` / `retrieve_from_documents` and writes unit/lesson/assessment drafts via `course.draft_*` tools. `persistDraft` materialises units + lessons + assessment shells in one transaction on confirmation.
- Phase 11's `configure` mode subsumes course-create (lock-gated, with full gate / prompt / memory editors layered on).

### `configure`

Lock-gated. Parent/teacher (or self-directed learner) authors and tunes.

- Same agent loop, different audience.
- `uiSurface: "configure"`, `requiredRole: "configurator"`.
- Session start is gated by `LockService.isUnlocked()` in `SessionServiceImpl`.
- Tools (Phase 11 — 25 total): course-create tools + `course.edit`, `lesson.{create,edit,delete}`, `gate.{create,edit,delete,override}`, `prompt.{override_fragment,clear_fragment,set_style}`, `memory.{reset_concept,clear_misconception,export,delete_all}`.
- Phase 12 adds 9 note + flashcard tools to `teach` mode: `note.{create,update,show,list,from_session_summary}`, `flashcard.{create,from_note,review,review_next}`. Total teach tools: 34 (25 + 9).
- Prompt fragments: preamble, `role.configure` (customizable), principles, `tools.configure` (not customizable), course-context, constraints, postamble.
- Every write goes through `AuthoringServiceImpl`, which appends a `configurator_actions` audit row.
- The configurator is the agent's user; the agent helps them author by talking.

**Modes layer the metacognition coach's voice on top.** In `teach`, `quiz`, `homework`, and `exam`, prompt fragments include metacognitive prompts at appropriate triggers (pre-reading: "what do you expect?"; post-error: "what assumption tripped this?"; session-end: "what's one thing you'd review tomorrow?"). The metacognition coach is woven through, not sequestered to one mode.

## Course structure (Phase 16)

Phase 16 adds **units** as a grouping layer between courses and lessons. A course drafted with `course.start_drafting` has: course → units → lessons → lesson_assessments. Each `Unit` groups an ordered list of lessons and optionally has a summative assessment (unit exam or midterm) at its end. Each `LessonAssessment` binds an assignment shell to a specific lesson with `timing` (before / after / interleaved) and `purpose` (readiness / practice / checkpoint). The aggregate scaffold is captured in `Course.assessmentPlan` (an `AssessmentPlan`).

Courses created before Phase 16 have no units and no `assessmentPlan`; the UI defaults to a flat-lesson view when `course.assessmentPlan` is absent.

## Assessment loop (Phase 16)

The teach-mode tutor authors assignments via `assignment.create`, which records a `parentSessionId` on the assignment linking back to the active teach session. The renderer picks up an `ActivityItem` with `metadata.kind === "assignment.issued"` and auto-opens a child tab in the right modality (quiz / homework / exam) via `useAssignmentIssuedSpawn` — without stealing focus from the teach tab. When the student submits in the child session, `AssignmentServiceImpl` calls `SessionService.notifySession()`, which injects a `system_note` event carrying the grade summary into the parent teach session's stream. The tutor receives the note and narrates per-item feedback on its next turn. The loop: teach session authors → child session submits → teach session narrates.

## Adaptive memory

### Bayesian Knowledge Tracing (BKT)

Praxis tracks concept mastery using a four-parameter Bayesian Knowledge Tracing model. Default parameter values:

| Parameter | Symbol | Default | Meaning |
|-----------|--------|---------|---------|
| Prior knowledge | pL0 | 0.10 | Probability the student knows the concept before any evidence |
| Learn rate | pT | 0.05 | Probability of learning the concept after one correct practice |
| Guess rate | pG | 0.20 | Probability of a correct answer despite not knowing |
| Slip rate | pS | 0.10 | Probability of an incorrect answer despite knowing |

Mastery probability is updated after each signal and written to `student_mastery` via `applySignal()`. Effective mastery applies exponential decay at read time: `effectivePKnown = pKnown × exp(-elapsedDays / decayDays)` with a 14-day default (configurable via `ThresholdConfig.decayDays`).

### Active-path tools

Two tools allow the agent to emit explicit mastery and misconception signals during a teaching session:

**`update_mastery`** — tier `"deterministic"`. Call when grading tools alone cannot capture the quality of the student's response (e.g., a genuine misconception vs. a one-off slip). Writes a `MasterySignal` via `MemoryServiceImpl.applySignal()` and returns the updated `pKnown` and `effectivePKnown`. Signal kinds: `correct`, `incorrect`, `slip`, `hint_requested`, `timeout`, `exam_pass`, `exam_fail`.

**`record_misconception`** — tier `"grounded"`. Call when the agent observes a persistent wrong model (e.g., the student consistently adds exponents when multiplying). Writes or deduplicates a misconception via `MemoryServiceImpl.recordMisconception()` and returns whether the record was merged with an existing entry.

Both tools require at least one `evidenceEventId` pointing to an episodic event for traceability. The `MasteryIndexer` also runs after each session to re-process all episodic events, ensuring the student model stays consistent even if a real-time tool call is missed.

## Adaptive routing

The system reads the student model and decides what to teach next. Routing happens at three points: session start (pick mode + scope), within a lesson (pick next item / next concept), at session end (re-evaluate gates, schedule review).

**Inputs to the router:**

- Concept mastery (semantic memory) — what does the student know, with what uncertainty?
- Active misconceptions (misconception memory) — what wrong models need remediation?
- Strategy preferences (procedural memory) — what teaches *this* student well?
- Affective signals (affective memory) — are they engaged, frustrated, confident?
- Course position — what gates are open, what's next prerequisite-wise?
- Time-since-practice — what's decaying and needs review?

**Routing decisions:**

- **Concept selection**: prefer concepts at the frontier of mastery (uncertainty highest), constrained to currently-unlocked content. Insert review items by spaced-repetition schedule.
- **Item difficulty**: target ~85% success rate. Drop difficulty after frustration spikes; raise after sustained ease.
- **Strategy selection**: pick teaching strategy by procedural preferences. Default to worked examples for novel material; Socratic only for concepts with established mastery foundations.
- **Mode transition suggestion**: after N concepts taught and mastery > threshold, suggest a quiz. After a unit, suggest exam. After persistent misconception, surface in `study-skills` for explicit remediation.

The router is implemented as logic in `@praxis/curriculum`, **not** as the agent's responsibility — the agent receives a brief that already reflects routing decisions. (The agent can override by calling `course.suggest_alternative()` if it judges the route wrong, but that's the exception.)

### Phase 10 router implementation (`suggestNext`)

The `suggestNext` pure function in `packages/curriculum/src/router/router.ts` implements the concept-selection decision as of Phase 10. It takes a `RouterInput` (snapshot + mastery/uncertainty/lastPracticed maps + `now` + `decayDays`) and returns a `RouterSuggestion` with three fields:

- **`primary`** — the single concept to teach now, with a `reason`:
  - `next-in-order`: current lesson has an un-studied concept; pick the first one.
  - `frontier`: all current-lesson concepts are studied but not mastered; pick the highest uncertainty × (1 − mastery) score.
  - `null` (all-complete): every concept in the current lesson is at or above `masteredThreshold`.
- **`reviews`** — earlier concepts whose mastery has decayed below `reviewThreshold` (sorted lowest-mastery-first, capped at `maxReviews`). These are companion suggestions for the tutor to weave in.
- **`interleaves`** — earlier concepts at high mastery that haven't been practiced in `interleaveMinDays` days, sorted oldest-practiced-first. Used for retention-oriented interleaving.

Reviews and interleaves are mutually exclusive per concept. The function is **pure** — no DB access, no `Date.now()`, so it can run in tests at microsecond speed.

The `course.current_concept` tool calls `suggestNext` and forwards its output to the agent via an additive output schema (Phase 10 adds `reason`, `masteryNow`, `uncertainty`, `reviews[]`, `interleaves[]` without breaking Phase 6 callers).

### Canonical pack routing (Phase 10)

When a course is created from a canonical pack (`course.use_canonical_pack`), the pack's concept graph becomes the course's backbone. Concepts are grouped into lessons of ~7 at import time; the router then operates exactly as it does for extracted courses. The drafter is told to call `course.list_canonical_packs` first when a student names a known subject, and to offer the canonical pack as an alternative to document extraction.

## Knowledge graph design

The concept graph is the spine of Praxis's mastery model. The graph schema is core; canonical and extracted graphs both conform.

**Concept identity.** Concepts have stable IDs within a graph and embeddings for cross-graph linking. The same concept ("linear function") in the CCSS canonical graph and in a textbook's extracted graph are linkable via embedding similarity above a threshold, optionally confirmed by a configurator.

**Edge semantics.** A prerequisite edge from A to B means "B is hard to learn without A." Strength is `0..1`: weak edges (~0.3) suggest A helps but isn't required; strong edges (~0.9) say A is required. The router treats strong edges as gates, weak edges as soft suggestions.

**Granularity.** Concepts are the unit of mastery — a single concept is what gets a mastery score. Granularity matters: too coarse and routing becomes blunt; too fine and the mastery model fragments. v1 default is "what a 30–60 minute lesson covers." Pedagogy pack provides granularity guidance per subject.

**Extraction.** Extracted graphs come from a small extractor agent that reads textbook chunks (post-Marker) and proposes concept nodes + prerequisite edges. v1 requires human confirmation before any extracted graph goes live (configurator reviews and edits in the gate editor UI). Auto-application is a future relaxation.

**Canonical graphs at launch.** Two subjects ship with canonical graphs:

- **Middle/high school math** (Algebra 1 + Geometry + Algebra 2 baseline, mapped to Common Core).
- **High school biology** (NGSS-mapped, vocabulary-rich, retrieval-practice-friendly).

Other subjects use extracted graphs with a "best guess" badge until canonical packs ship.

## Gating philosophy

Gates exist to enforce prerequisite competence and motivate progression — *not* to prevent exploration.

**When gating helps:**

- Math: linear equations before quadratic; limits before derivatives. Strict gates.
- Foreign language: vocabulary basics before reading comprehension. Strict gates.
- Skill-building courses where each concept genuinely requires the prior.

**When gating hurts:**

- Topical exploration ("teach me about evolution") where motivation is curiosity. Soft gates only — the system warns about prerequisites but doesn't refuse.
- Cross-disciplinary work where multiple paths lead in.

**Defaults (v1 — Phase 9):**

- **Gates are course-local in v1.** Gate evaluation is scoped to one course. Cross-course mastery already flows through shared concept IDs (Phase 7 mastery is per-(studentId, conceptId)); the gate-criteria part of cross-course gating is deferred to Phase 11 as a non-breaking discriminated-union extension (`external-mastery` variant).
- **Strict gating only in v1.** The course-create default produces strict gates. Soft gates (warn but don't refuse) are a future configurable; Phase 9 ships strict only.
- **Unlock-only transitions in v1.** A gate that has been unlocked stays unlocked even if mastery later decays below threshold. Re-locking creates a frustrating UX that needs careful UX work; deferred to Phase 14 alongside spaced-review nudges.
- **Session-end evaluation.** Gates re-evaluate at session boundaries, not mid-session. Mid-session unlocks are explicitly not a v1 feature (per ARCHITECTURE.md). The evaluator runs in `SessionService.end()` after indexers.
- **Strong-edge prerequisites**: strict gating. Student must reach `mastery >= 0.7` (configurable) on prerequisites before the next concept unlocks.
- **Weak-edge prerequisites**: soft gating. The system tells the student about the dependency but doesn't lock. (v1 ships strict only — soft gates deferred.)
- **Topic-exploration mode** (configurable per-course): all soft gating; mastery-driven routing still happens but doesn't refuse.

**Override:** configurators can override any gate state with a documented reason (stored in `GateState.kind: "overridden"`). Useful for honors students racing ahead, or for resuming after the system's mastery score lags reality. Phase 9 evaluator handles `overridden` as "treat as unlocked, never re-evaluate".

**Visible to the student:** the progress map shows locked content as locked, with the prerequisite chain visible. Forward visibility is motivating — the student sees the path, not just the next step.

## Pedagogy pack structure

The pedagogy pack is the curated, versioned content that the framework uses for both *applied* and *taught* principles. Loaded at boot, identifiable by version, signed for integrity.

**Contents:**

- **Teaching strategies** — `worked-examples`, `socratic`, `elaborative-interrogation`, `analogy-bridging`, `productive-failure-gauntlet`, etc. Each has a name, description, applicability tags, prompt fragment that adopts the strategy, and citations.
- **Study techniques** — `cornell-notes`, `feynman-explanation`, `spaced-repetition`, `concept-mapping`, `dual-coding`, `interleaving-self-test`, etc. Each includes UI affordances required and instructional curriculum for teaching the technique.
- **Metacognitive prompts** — short prompts triggered at pre-reading / post-reading / pre-quiz / post-error / session-end. Each is a template the framework injects.
- **Bloom's-tagged item templates** — for quiz/exam authoring, item templates tagged by cognitive demand level.
- **Misconception remediation strategies** — for common misconceptions per subject, the pack includes a remediation strategy keyed to `Misconception.errorForm`.

**Curation.** v1 pack is curated by the project maintainers, drawing from the cognitive-science literature (Roediger, Karpicke, Kapur, Bjork, Sweller, Wilson, Rohrer, and others). Citations are required for any strategy claim.

**Updates.** Packs version semver. The framework declares a compatible range (e.g., `^1.0`); breaking pack changes require a major bump. Updates ship via signed downloads, verified before ingestion.

**Custom packs.** Configurators can author custom packs for specialized contexts (e.g., a subject-specific pedagogy pack for music theory, or a culturally-adapted pack for a specific student population). The pack format is the contract; provenance is whoever signs it.

## Assessment item design

### When to use which item kind

Each item kind has a distinct cognitive purpose. The right choice of kind shapes both what you measure and how the student's thinking is engaged.

**`single-choice`** — recall and quick recognition. Useful when the answer is unambiguous and speed of retrieval is the point. Best for vocabulary, definitions, fact-checking, and yes/no judgment. The easiest to author; the hardest to misinterpret. Use it where nuance is not the target.

**`multi-select`** — discriminating between related concepts. "Select all that apply" forces the student to evaluate each option independently rather than stopping at the first plausible answer. Jaccard partial-credit grading rewards partial knowledge: a student who identifies three of four correct options gets partial, not zero. Use when the domain has a family of related true statements and conflating them is the common error.

**`numerical`** — quantitative reasoning with unit discipline. The tolerance band distinguishes conceptual understanding from arithmetic precision; sig-fig enforcement is appropriate when precision is itself the learning target (science labs, engineering contexts). The units field closes off "dimensionally meaningless" answers that happen to have the right digit. Use wherever a number is the answer and order-of-magnitude or unit confusions are the misconception to probe.

**`matching`** — vocabulary with definitions, equations with verbal descriptions, axioms with theorems, historical events with dates, chemical elements with symbols. Two-column pairing is cognitively economical: the student works within a closed set, which reduces cognitive load while still requiring discrimination. Use when the correct answer exists in a finite universe visible in the item.

**`ordering`** — proofs, derivations, algorithms, historical chronology, lab procedures. The student must assemble steps, not just recognize them. Use when sequence is the learning target — a student who knows the individual steps but can't order them doesn't yet have procedural fluency.

**`two-tier`** — misconception detection. The first tier is a standard factual question; the second tier asks the student to select the reason for their answer. Force Concept Inventory style: the reason options are calibrated distractors — each plausible-sounding wrong reason corresponds to a named misconception. A student who picks the right answer for the wrong reason (tier-1 correct, tier-2 wrong) is at greater risk than the student who got tier-1 wrong but reasoned correctly. Every non-null entry in `misconceptionByReasonIndex` automatically seeds Phase 7's misconception memory when selected, closing the loop between assessment and remediation.

**`single-choice` or `multi-select` + `requireReasoning: true`** — surfaces "right answer, wrong reason" and "wrong answer, sound reasoning." The choice grade gives fast deterministic feedback on the answer; the reasoning rubric reveals the quality of the underlying thinking. Use when the *thinking* matters as much as the outcome — in early instruction on a concept, when consolidating understanding, or when a student's wrong answers show a pattern that a pure grade can't expose.

**`short-answer`** and **`free-response`** — open-ended answers where there is no closed set of options. `short-answer` expects a short typed string matched against accepted answers. `free-response` is long-form prose, rubric-graded by the rubric agent. Use `short-answer` for definitions, term fill-ins, or constrained recall. Use `free-response` when argumentation, explanation depth, or synthesis is the target.

**`math`** and **`code`** — when symbolic correctness or executable correctness is the criterion. Sympy validates math; the sandbox runs code against tests. Neither can be "partially right" by luck; they're the appropriate choice when the verification must be deterministic and the answer domain is formal.

### Quick checks vs. assignments: formative and summative surfaces

The framework offers two surfaces for putting questions to the student. Choosing the right one for the moment matters more than which item kind is used.

**Quick checks** (`quick_check.*`) are formative: single-question, inline in the chat thread, ephemeral. The student answers without leaving the conversation; the tutor sees the response in the same turn and reacts. No grade is persisted to the assignment table; the exchange lives in the episodic transcript as a tool call and its result, nothing more. Use quick checks for "did that land?" — mid-explanation probes, checking understanding after a worked example, testing a prerequisite before introducing a new concept, gauging confidence before a harder problem. The low friction is deliberate: a quick check should feel like a tap on the shoulder, not a context switch.

**Assignments** (`assignment.create`) are summative-ish: lesson-scoped, multi-item, gradeable, retake-able, gate-able. The student takes them as a deliberate separate task in their own tab; the tutor receives a system note when they submit; the grade is persisted and contributes to mastery signals and gate evaluation. Use assignments for homework sets, quizzes after a lesson's concepts are taught, and unit exams. The deliberate, separated nature of assignment work is itself pedagogically meaningful — it marks a transition from learning to consolidation or from consolidation to assessment.

The default disposition for formative work is quick check. Reserve `assignment.create` for things the student should do as their own deliberate practice, not as part of the flow of a teach session. Over-assigning (turning every check-for-understanding into a graded artifact) erodes the distinction between learning and measurement — and erodes the student's trust in the conversational tutor relationship.

---

## Research grounding (selected)

Specific empirical findings that shape the v1 pack:

- **Testing effect**: retrieval practice produces stronger long-term retention than re-reading or rehearsal (Roediger & Karpicke, 2006).
- **Spacing effect**: distributed practice outperforms massed practice, especially for retention beyond 24 hours (Cepeda et al., 2006).
- **Interleaving**: interleaved practice reduces in-session accuracy but raises long-term performance and transfer (Rohrer & Taylor, 2007).
- **Productive failure**: students who attempt problems before instruction outperform those who receive instruction first, especially on transfer items (Kapur, 2008).
- **85% rule**: optimal training difficulty hovers near 85% success — too easy is wasted; too hard is demoralizing (Wilson et al., 2019).
- **Worked example effect**: novice learners benefit from studying worked examples before independent problem-solving; the benefit fades with expertise (Sweller, 1988; Renkl, 2014).
- **Dual coding**: information presented in both verbal and visual form is retained better than either alone (Paivio, 1971; Mayer, 2009).
- **Metacognitive prompting**: brief prompts before/after study activities improve self-regulation and learning (Schraw et al., 2006).

The pedagogy pack ships with citations attached to each strategy and technique; updates require citation review.
