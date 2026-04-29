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
- Tools: retrieval (from textbook), `plot_function`, `render_diagram`, `render_latex`, `pull_pedagogy_strategy`, `record_misconception`, course navigation.
- No grading tools. No exam tools.
- Style: lecture-leaning *and* Socratic — adapts based on procedural memory (what works for *this* student).

### `quiz`

Short-form retrieval practice during or between lessons.

- Multiple-choice and short-answer, time-boxed.
- Items selected by adaptive router from the recent concept set, weighted by mastery uncertainty.
- Always includes interleaved items from earlier concepts.
- Tools: `grade_math`, `grade_short_answer`, `update_mastery`, `record_misconception`.
- Feedback is immediate but doesn't reveal the answer until the student commits.

### `homework`

Longer practice, often across multiple concepts. Submitted in one batch.

- Items include problems, free-response, explanation prompts.
- Submission via typing or upload (handwritten work via vision OCR + verification round-trip).
- Tools: full grading suite + workspace integration (notes flow into homework reflection).
- Feedback delayed until full submission; per-item feedback after.

### `exam`

Gated assessment. Higher stakes; outcome affects gate state.

- Strict tool subset: only validated grading tools, no `model-derived` tier (rubric agents excluded; explicit rubrics required).
- No mid-exam help; the tutor doesn't provide hints during the exam.
- Items mix Bloom's levels.
- Submission produces a `Grade` artifact; gate evaluation runs at exam end.

### `study-skills`

The metacognition coach's dedicated mode. Teaches and practices the principles-taught list above.

- Prompt fragments emphasize: explain the technique → demonstrate → have student practice → reflect.
- Tools: workspace tools (Cornell, Feynman, concept-map editors), pedagogy-pack content retrieval, scheduling for spaced review.
- Often spans across courses — study skills generalize.

### `bootstrap`

A pre-curricular mode for authoring a new course from uploaded materials. Available without lock; intended for student self-onboard (UX path 2 in `UX.md`) and for the parent / teacher's first course before lock-gated `configure` is set up.

- Prompt fragments: bootstrap-specific role + tools.
- Tools: `course.list_documents`, `course.propose_draft`, `course.show_draft`, `course.edit_draft`, `course.confirm_draft`, `course.discard_draft`, plus `retrieve_from_textbook` for ad-hoc lookup while authoring.
- The agent runs the conversation: proposes a draft, walks the student through it, applies edits one at a time, persists on confirmation.
- Phase 11's `configure` mode subsumes bootstrap (lock-gated, with full gate / prompt / memory editors layered on).

### `configure`

Lock-gated. Parent/teacher (or self-directed learner) authors and tunes.

- Same agent loop, different audience.
- Tools: course mutators, gate editors, prompt customizers, memory inspectors.
- The configurator is the agent's user; the agent helps them author by talking.

**Modes layer the metacognition coach's voice on top.** In `teach`, `quiz`, `homework`, and `exam`, prompt fragments include metacognitive prompts at appropriate triggers (pre-reading: "what do you expect?"; post-error: "what assumption tripped this?"; session-end: "what's one thing you'd review tomorrow?"). The metacognition coach is woven through, not sequestered to one mode.

## Adaptive routing

The system reads the student model and decides what to teach next. Routing happens at three points: session bootstrap (pick mode + scope), within a lesson (pick next item / next concept), at session end (re-evaluate gates, schedule review).

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

**Defaults:**

- **Strong-edge prerequisites**: strict gating. Student must reach `mastery >= 0.7` (configurable) on prerequisites before the next concept unlocks.
- **Weak-edge prerequisites**: soft gating. The system tells the student about the dependency but doesn't lock.
- **Topic-exploration mode** (configurable per-course): all soft gating; mastery-driven routing still happens but doesn't refuse.

**Override:** configurators can override any gate state with a documented reason (stored in `GateState.kind: "overridden"`). Useful for honors students racing ahead, or for resuming after the system's mastery score lags reality.

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
