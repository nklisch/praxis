---
id: epic-phase-19-ship-checklist
kind: feature
stage: review
tags: []
parent: epic-phase-19-ship-v1
depends_on:
  - epic-phase-19-biology-pack
  - epic-phase-19-electron-signing
  - epic-phase-19-auto-update
  - epic-phase-19-first-run-flow
  - epic-phase-19-onboarding-docs
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Ship checklist (v1.0.0)

## Brief

The terminal feature in Phase 19 — the v1 acceptance test, end-to-end, on
a clean machine, against the signed installer. ROADMAP names this as the
Phase 19 test checkpoint: "Build signed installer. Install on clean
machine. Self-onboard with real syllabus + textbook. Session, sketch math,
submit homework, pass exam, unlock, notes, flashcards. All works without
dev tools." This feature is where that test is run, where the findings
become substrate items, and where v1.0.0 either gets cut or gets sent
back for fixes.

What this feature covers:

- A formal `docs/v1-ship-checklist.md` (or equivalent location — design
  pass picks) capturing the exact acceptance script: install steps,
  per-mode flows to exercise, expected outputs, known-acceptable
  divergences. This is the dogfooding script.
- An execution pass: build the signed installer, install on a clean
  account or VM that has none of the dev paths set, walk the script
  end-to-end, log every divergence as a substrate item with appropriate
  tags (bugs as stories at `stage: implementing`, observations as
  backlog items).
- A go / no-go decision recorded in this feature's body. If go,
  `epic-phase-19-ship-v1` advances and the v1.0.0 release is cut via
  `/agile-workflow:release-deploy`. If no-go, the blocking findings get
  unblocked first.
- Verification that all six canonical user paths work without dev tools:
  bootstrap a course (canonical pack and syllabus paths), teach session,
  sketch math, submit homework, pass an exam, gate unlock, notes,
  flashcards.

What this feature does NOT cover:

- The actual fixes for any failures uncovered — those become their own
  stories and resolve through the normal flow. This feature is the
  detector and the gate, not the fixer.
- Cutting the release — that's `/agile-workflow:release-deploy` running
  against `v1.0.0` with this epic bound. This feature produces the
  go-signal that justifies running release-deploy.

## Epic context

- Parent epic: `epic-phase-19-ship-v1`
- Position in epic: terminal aggregator. Depends on every other Phase 19
  feature because the checklist exercises everything together. When this
  feature reaches `done`, the epic is ready to advance and v1 is
  shippable.

## Foundation references

- `docs/ROADMAP.md` — Phase 19 test checkpoint (the script).
- `docs/SPEC.md` — the canonical capability list against which the
  checklist is calibrated.
- The other five Phase 19 features — collectively define what the
  checklist actually tests.

## Design decisions

- **Doc location: `docs/v1-ship-checklist.md`.** Foundation-doc style;
  joins `docs/CODE-SIGNING.md`, `docs/UPDATE-CHANNEL.md`,
  `docs/ONBOARDING.md` as the v1-ship operational set. Filename is
  version-specific (`v1-ship-checklist`) because future versions get
  their own checklist informed by what changed.
- **Format: a numbered acceptance script + per-step expected output +
  failure-triage rubric.** Not a generic "QA test plan" — specific
  enough that the maintainer can dogfood the build on a clean machine
  in ~60 minutes.
- **Failure-triage rubric: three-tier classification.**
  - **Block-ship**: capability-breaking divergence (e.g., teach session
    crashes, signed installer fails Gatekeeper, canonical pack fails
    to import). Halts v1.0.0 release; substrate item filed with
    `tags: [bug]` at `stage: implementing`.
  - **Important-but-shippable**: visible imperfection that's not
    capability-breaking (e.g., copy typo, minor layout glitch). v1.0.0
    ships; substrate item filed in `.work/backlog/`.
  - **Cosmetic**: not worth filing. Inline note only.
- **Go/no-go signal lives in the feature body's review section.**
  When the maintainer runs the checklist, they record results inline
  (or in a sibling working doc) and the review skill captures the
  go/no-go decision in the standard `## Review` section. If go,
  `release-deploy v1.0.0` runs next; if no-go, the blocking findings
  become substrate items and the feature returns to `implementing`
  until they're cleared.
- **No code changes.** The script is documentation; the verification
  is human-only on a clean machine. Per the design family's principles,
  the doc IS the work.
- **No child stories.** Single deliverable, single artefact.

## Architectural choice

**Single doc + foundation-style language.** The checklist is the
bound execution script for the v1 ship rehearsal. The maintainer reads
it from top to bottom, ticks each box on a paper notepad or markdown
copy, and produces a go/no-go signal at the end. No tooling, no
spreadsheet, no third-party test management.

Alternatives considered:

- *Markdown checkbox file the maintainer commits per-run.* Rejected:
  the doc is the source of truth; per-run results belong in the
  feature's review record, not in a separate file that drifts.
- *A scripted automation that walks the app via Playwright or
  similar.* Rejected for v1: automation here is rich-but-fragile,
  and the rehearsal value is human dogfooding (catches subjective
  "feels wrong" defects automation misses).

## Implementation Units

### Unit 1 (only unit): `docs/v1-ship-checklist.md`
**File**: `docs/v1-ship-checklist.md` (new)

The full v1 ship rehearsal script. Outline:

1. **What this covers** — the v1.0.0 acceptance test, end-to-end on a
   clean machine, against the signed Praxis installer.
2. **Prerequisites for running the checklist** — clean macOS account
   (or VM); signed `.dmg` produced via `pnpm --filter @praxis/desktop
   dist:mac` with cert env vars set; placeholder URLs in
   `docs/ONBOARDING.md` filled in; the maintainer has API keys ready
   for at least one direct provider plus Claude Code CLI auth ready.
3. **Stage 1 — Install + launch** (3 steps):
   - 1.1 Copy the `.dmg` to a clean macOS account, mount, drag Praxis
     to /Applications, eject. Expect no Gatekeeper warning, no
     "downloaded from internet" prompt that requires explicit
     approval.
   - 1.2 `xcrun stapler validate` returns "validate action worked".
   - 1.3 Launch Praxis. App opens; first-run flow appears.
4. **Stage 2 — First-run flow** (3 steps):
   - 2.1 Welcome step renders. Click Continue.
   - 2.2 Engine step. Pick direct.anthropic; enter API key; click
     Continue. Engine config persisted (verified by re-launching
     after stage 4 — config restored).
   - 2.3 Course step. Click "Algebra (canonical)" — bootstrap
     session opens.
5. **Stage 3 — Teach + sketch + assignment** (5 steps):
   - 3.1 In bootstrap session, ask: "Use the canonical algebra-1
     pack to create my course." Course created; lessons populated.
   - 3.2 Switch to teach mode (or follow agent's prompt). Ask agent
     to teach linear equations.
   - 3.3 Open the sketch composer. Sketch `2x + 5 = 11` and steps.
     Submit. Sympy verifies; agent gives feedback.
   - 3.4 Agent issues a quick-check or assignment. Submit a wrong
     answer first, then a right one. Confirm grading + feedback are
     reasonable.
   - 3.5 Ask agent: "What should I work on next?" Agent uses adaptive
     router; suggests a sensible concept.
6. **Stage 4 — Persistence** (3 steps):
   - 4.1 Quit Praxis cleanly. Re-launch.
   - 4.2 Confirm: course intact, mastery scores intact, sessions
     listed in tab strip.
   - 4.3 Open the existing session. Conversation history restored.
7. **Stage 5 — Notes + flashcards** (4 steps):
   - 5.1 In a teach session, ask agent to extract a note from the
     last lesson. Note appears in the workspace tab.
   - 5.2 Generate flashcards from the note. Flashcards appear in the
     review queue.
   - 5.3 Run a flashcard review. FSRS scheduling updates the next-due
     timestamps as expected.
   - 5.4 Edit a note manually. Changes persist across launch.
8. **Stage 6 — Exam + gate unlock** (3 steps):
   - 6.1 Trigger an exam from a course. Exam mode launches with the
     reduced toolset.
   - 6.2 Submit the exam. Pass threshold met → gate unlocks.
   - 6.3 Confirm next gated content is now accessible.
9. **Stage 7 — Update channel** (2 steps):
   - 7.1 With `PRAXIS_UPDATE_FEED_URL` unset, confirm no banner
     appears (no spurious checks).
   - 7.2 With `PRAXIS_UPDATE_FEED_URL` pointing at a synthetic feed
     advertising v9.9.9, relaunch — banner appears with download link.
     Click dismiss; banner stays hidden.
10. **Failure-triage rubric** — three classifications and what to do
    with each.
11. **Go/no-go decision** — recorded in the feature's review section
    after the run completes.
12. **Pre-publish checklist** — discrete tasks before tagging
    v1.0.0:
    - Replace `<DOWNLOADS_URL>` placeholder in `docs/ONBOARDING.md`.
    - Replace screenshot placeholders in `docs/ONBOARDING.md`.
    - Confirm `MAC_SIGNING_IDENTITY` cert is current (not expired).
    - Decide whether to ship with `PRAXIS_UPDATE_FEED_URL` set
      (recommended yes — pointing at a placeholder feed announcing
      v1.0.0 itself, so the system is exercised).
13. **Known acceptable divergences** — things that are expected and
    NOT defects:
    - Windows / Linux installers are unsigned; warnings expected.
    - Ollama support requires a local Ollama server; not exercised in
      the macOS-only checklist.
    - Multi-arch macOS support is post-v1; only the host arch is
      tested.

**Implementation Notes**:

- Foundation-doc tone: prescriptive present-tense.
- Each step has an explicit "Expected" line so divergences are
  visible.
- Cross-references the other v1-ship docs (`CODE-SIGNING`,
  `UPDATE-CHANNEL`, `ONBOARDING`).
- The "Pre-publish checklist" subsection captures the small
  maintainer-only mechanical tasks that don't fit anywhere else.

**Acceptance Criteria**:

- [ ] File exists at `docs/v1-ship-checklist.md`.
- [ ] All 7 verification stages present with discrete steps.
- [ ] Failure-triage rubric explicit (3 tiers).
- [ ] Pre-publish maintainer checklist included.
- [ ] Cross-references CODE-SIGNING / UPDATE-CHANNEL / ONBOARDING.

## Implementation Order

1. Unit 1 (the doc).

After: read the doc end-to-end. The maintainer-execution of the
checklist itself is post-implementation; this feature ships when the
script is written and reviewed, not when the rehearsal is complete.
The review step captures that distinction.

## Testing

Documentation feature; no automated tests. The existing `pnpm test`
suite acts as a regression guard against any unrelated changes that
sneak in during implementation.

## Risks

- **Checklist drift over time.** As Praxis evolves, the v1 script
  becomes inaccurate for v2+ verifications. Mitigation: each major
  release version cuts a new `docs/v<N>-ship-checklist.md`; old ones
  archive into `.work/releases/<version>/` alongside the bound items.
- **Maintainer skips the checklist for "small" releases.** Acceptable
  — v1 is the bar; minor releases can use a shortened script. The
  failure-triage rubric still applies.
- **Subjective "feels wrong" defects slip past human dogfooding.**
  Acceptable for v1; the audience is small enough that the project's
  feedback loop catches them post-launch. Post-v1 work could add
  Playwright-driven smoke tests for the most-visible regressions.

## No child stories

Single doc, single agent, single stride.

## Implementation notes

- **Files changed**:
  - `docs/v1-ship-checklist.md` (new) — Unit 1.
- **Tests added**: none (documentation feature).
- **Discrepancies from design**: none. The doc covers all 7 stages plus
  the failure-triage rubric, the go/no-go decision section, the
  pre-publish maintainer tasks, and the known-acceptable-divergences
  list — exactly as designed.
- **Adjacent issues parked**: none.
- **Foundation-doc tone**: present-tense prescriptive; mirrors
  `docs/CODE-SIGNING.md`, `docs/UPDATE-CHANNEL.md`,
  `docs/ONBOARDING.md`. Cross-references all three.
- **No code changes** — `pnpm test` would be a no-op verification
  since no test surface is touched.
