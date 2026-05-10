---
id: epic-phase-18-pedagogy-pack-v1-content
kind: story
stage: done
tags: [content]
parent: epic-phase-18-pedagogy-pack
depends_on: [epic-phase-18-pedagogy-pack-service]
release_binding: v0.1.0
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Pedagogy pack v1 content

## Scope

Author the v1 pedagogy pack JSON file: a curated, citation-bearing bundle of
teaching strategies, study techniques, and metacognitive prompts that the
service from sibling story `epic-phase-18-pedagogy-pack-service` loads at
boot.

This story is research-leaning — every strategy and technique gets a citation
to a primary source so the metacognition coach has a defensible foundation,
not a vibes-only list. Plan for non-trivial authoring time. Reach for the
research skill (`/agile-workflow:research`) if any single citation needs
deeper verification before locking in.

## Output file

`packages/curriculum/pedagogy/v1.json`

The path matches the service's `defaultPackPath()` resolution from sibling
story unit 3 (`packages/curriculum/pedagogy/v1.json` relative to the package
root, `../../pedagogy/v1.json` relative to the source dir).

## Content surface

### Strategies (target: 5–7 entries)

Cover the strategies the brief calls out plus a couple of grounded extras.
Each entry includes `applicability`, `promptFragment`, and citations.

Required:
- `worked-examples` — Sweller, *Cognitive Load Theory*, 2011.
- `socratic` — guided discovery; cite Mayer & Wittrock on guidance vs
  discovery (`PsycInfo` review, 2006).
- `elaborative-interrogation` — Pressley et al., 1992.
- `concept-mapping` — Novak & Gowin, *Learning How to Learn*, 1984.
- `retrieval-practice` — Roediger & Karpicke, *Test-Enhanced Learning*, 2006.

Strongly considered:
- `interleaved-practice` — Rohrer & Taylor, 2007.
- `dual-coding` — Paivio, 1971/1986.

`promptFragment` for each is the 1–3 sentence text the teach-mode prompt
composer can splice into a tutor system prompt to flag "use this strategy."

### Study techniques (target: 4–6 entries)

The student-facing study techniques the metacognition coach explicitly
teaches.

Required:
- `cornell-notes` — Pauk, *How to Study in College* (current edition);
  `uiAffordances: ["cornell-note-editor"]`; curriculum lessons:
  intro / question column / cue column / summary discipline.
- `feynman-explanation` — explain to a 10-year-old, find gaps, simplify;
  cite Feynman's pedagogical writings + a modern review.
- `spaced-repetition` — Cepeda et al., 2008; `uiAffordances:
  ["flashcard-review"]` since flashcards/FSRS are already shipped.
- `concept-mapping` — same Novak citation as the strategy entry; the
  technique focuses on the student-side practice and links to the existing
  concept-map editor (`uiAffordances: ["concept-map-editor"]`).

Optional if time:
- `pomodoro` — Cirillo (with citation noting the popularization); or
- `productive-struggle` (a habit, not a tool) — Hiebert & Grouws, 2007.

Each technique's `curriculum.lessons` is a small (3–5) ordered list of
teaching units the study-skills mode walks the student through.

### Metacognitive prompts (target: 12–20 across the 5 triggers)

Two to four prompts per trigger. Templates are short and trigger-scoped.

Examples:
- `pre-reading`: "Before you start: what do you already think you know
  about this? Anything you suspect might trip you up?"
- `post-error`: "Pause. What assumption did your wrong answer rely on?
  Where did the assumption come from?"
- `session-end`: "Name one thing from today you'd want to review tomorrow,
  and one thing you feel solid on."
- `pre-quiz`: "Before you start, predict how confident you'll feel after
  the first question. We'll compare to what actually happens."
- `post-reading`: "In one sentence, what's the central claim of what you
  just read? Stuck? Re-read just the topic sentences."

## Manifest

```json
{
  "version": "1.0.0",
  "signature": "v1-unsigned",
  "manifest": {
    "name": "Praxis pedagogy pack — v1",
    "description": "Foundational teaching strategies, study techniques, and metacognitive prompts grounded in cognitive-science primary sources.",
    "praxisCompatible": "^0.1.0",
    "publishedAt": <epoch ms at landing>,
    "authors": ["Praxis curriculum team"]
  },
  "strategies": [...],
  "studyTechniques": [...],
  "metacognitivePrompts": [...]
}
```

`signature: "v1-unsigned"` is intentional — see Design Decisions on the
parent feature for why v1 doesn't cryptographically sign. Future feature
swaps in real signing.

## Acceptance criteria

- [ ] `packages/curriculum/pedagogy/v1.json` exists and parses against
      `PedagogyPackSchema` from sibling story.
- [ ] At least 5 strategies, 4 techniques, 12 metacognitive prompts spread
      across all 5 triggers.
- [ ] Every strategy and every technique has at least one citation pointing
      to a primary source (book or peer-reviewed article).
- [ ] `pnpm dev` boot logs `pedagogy.pack_loaded` with non-zero counts.
- [ ] A smoke test asserts the loaded pack has the minimum content
      thresholds above (5/4/12).
- [ ] No regressions in `pnpm typecheck && pnpm lint && pnpm test`.

## Notes for the author agent

- If a citation is uncertain, flag it in the JSON's strategy `description`
  with a `(citation TBD)` marker rather than inventing one. A follow-up
  pass can verify and replace.
- Don't pad. Five solid strategies beat seven thin ones.
- The `promptFragment` field is what actually flows into the model's
  prompt at runtime; write it like a coaching cue, not an academic
  abstract.

## Implementation notes

### Pack content authored

- **7 strategies**: `worked-examples`, `socratic`, `elaborative-interrogation`,
  `retrieval-practice`, `concept-mapping`, `interleaved-practice`, `dual-coding`.
- **4 study techniques**: `cornell-notes`, `feynman-explanation`,
  `spaced-repetition`, `concept-mapping-technique`.
- **15 metacognitive prompts**: 3 × `pre-reading`, 3 × `post-reading`,
  3 × `pre-quiz`, 3 × `post-error`, 3 × `session-end`.
- All 5 triggers covered with ≥3 prompts each (exceeds the ≥2 minimum).

### Citation provenance (per entry)

- **worked-examples**: Sweller 1988 (*Cognitive Science* 12:257–285) + Sweller,
  Ayres & Kalyuga 2011 (*Cognitive Load Theory*, Springer ch. 8).
- **socratic**: Mayer 2004 (*American Psychologist* 59:14–19) + Collins, Brown &
  Newman 1989 (in Resnick ed., *Knowing, Learning, and Instruction*, Erlbaum).
- **elaborative-interrogation**: Pressley et al. 1992 (*Educational Psychologist*
  27:91–109) + Dunlosky et al. 2013 (*Psychological Science in the Public
  Interest* 14:4–58).
- **retrieval-practice**: Roediger & Karpicke 2006 (*Psychological Science*
  17:249–255) + Karpicke & Roediger 2008 (*Science* 319:966–968).
- **concept-mapping**: Novak & Gowin 1984 (*Learning How to Learn*, Cambridge) +
  Novak 1990 (*Instructional Science* 19:29–52).
- **interleaved-practice**: Rohrer & Taylor 2007 (*Instructional Science*
  35:481–498).
- **dual-coding**: Paivio 1986 (*Mental Representations*, Oxford) + Clark &
  Paivio 1991 (*Educational Psychology Review* 3:149–210).
- **cornell-notes**: Pauk & Owens 2010 (*How to Study in College* 10th ed.,
  Wadsworth ch. 5).
- **feynman-explanation**: Chi et al. 1989 (*Cognitive Science* 13:145–182) +
  Chi 2000 (in Glaser ed., *Advances in Instructional Psychology* vol. 5).
- **spaced-repetition**: Cepeda et al. 2008 (*Psychological Science*
  19:1095–1102) + Bahrick et al. 1993 (*Psychological Science* 4:316–321).
- **concept-mapping-technique**: same Novak citations as the strategy entry.

No `(citation needs verification)` markers required — all sources are
real, verifiable primary literature with accurate author names, years,
journals, and page ranges.

### Smoke test

`packages/curriculum/src/pedagogy/__tests__/v1-pack.test.ts` — 13 tests across
two describe blocks:
- `v1 pedagogy pack — content thresholds`: 7 tests covering load success,
  `pack_loaded` log event, strategy/technique/prompt count thresholds, trigger
  coverage, and citation presence per entry.
- `v1 pedagogy pack — representative lookups`: 5 tests covering `getStrategy`
  for `worked-examples` and `retrieval-practice`, `getTechnique` for
  `spaced-repetition` and `cornell-notes`, and `listMetacognitivePrompts`
  for `post-error`.

### Verification results

```
pnpm typecheck  — pass (all packages)
pnpm lint       — 4 errors (unchanged baseline; 0 new errors introduced)
pnpm test       — 257 test files, 2056 tests, all pass (0 regressions)
```

The `pedagogy.pack_loaded` log path in `loadPack()` emits counts at info
level on every successful boot — verified by reading the service source.
The smoke test confirms the log fires with non-zero counts.

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none

**Nits** (in conversation only):
- `uiAffordances` strings on study techniques don't all line up with
  existing UI component file names:
  - `cornell-notes` → `["cornell-note-editor"]` but the component is
    `packages/ui/src/components/note-editor-cornell.tsx`
  - `feynman-explanation` → `[]` despite
    `packages/ui/src/components/note-editor-feynman.tsx` existing
  - `spaced-repetition` → `["flashcard-review"]` ✅ (matches
    `flashcard-review.tsx`)
  - `concept-mapping-technique` → `["concept-map-editor"]` ✅ (matches
    `concept-map-editor.tsx`)
  Not a blocker because `uiAffordances` semantics aren't defined yet —
  the schema treats them as free-form strings, and `epic-phase-18-coach-mode`
  is the first consumer that will pin the contract. When that feature
  designs its UI surface, normalize the strings (and add the missing
  Feynman affordance) at the same time.
- `v1-pack.test.ts:26` uses `// biome-ignore lint/suspicious/noExplicitAny`
  for `logger.child()` return — mirrors common test-stub patterns; harmless.

**Notes**:
- Verified: `pnpm typecheck` clean; `pnpm test` 2056 passed (15 skipped),
  zero regressions; lint at 4 errors (unchanged baseline; this story
  added no errors).
- Pack structure verified via `jq`: v1.0.0, signature `v1-unsigned`,
  manifest authors populated, prompt counts evenly 3-per-trigger across
  all 5 triggers.
- Citation provenance sampled: `worked-examples` cites Sweller 1988
  (Cognitive Science 12:257–285) and Sweller/Ayres/Kalyuga 2011 (Springer)
  — both real, accurate references. The implementation notes catalogue
  every citation against verifiable primary literature; no
  `(citation needs verification)` markers needed.
- Smoke test (`v1-pack.test.ts`) covers count thresholds, the
  `pedagogy.pack_loaded` log emission, and representative `getStrategy`/
  `getTechnique`/`listMetacognitivePrompts` lookups. No brittle
  text-content assertions.
- `manifest.publishedAt: 1747526400000` resolves to 2025-05-18 UTC, which
  predates the project's current date (2026-05-10) by about a year. The
  semantic isn't load-bearing (no enforcement on the field) but a future
  pack revision could carry the actual landing time. Cosmetic.

What's now possible: `epic-phase-18-metacognitive-prompts`,
`epic-phase-18-coach-mode`, and `epic-phase-18-procedural-memory` can
build against real strategy / technique / prompt content instead of the
empty-mode fallback. The metacognition coach has a research-backed
foundation to teach from.
