---
id: refactor-rename-step-5-foundation-docs
kind: story
stage: done
tags: [refactor, naming, documentation]
parent: refactor-rename-bootstrap-and-explorer
depends_on: [refactor-rename-step-4-service-and-ipc]
release_binding: v0.1.3
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Step 5: Roll foundation docs forward

## Brief

Final step. Rewrites foundation-doc references to the bootstrap explorer
to use the new course-create / drafter naming. Applies the
rolling-forward principle: no "previously named bootstrap" prose; git
carries the history.

Historical design docs (`docs/designs/phase-16-bootstrap-explorer.md`,
`docs/designs/phase-6-course-lesson-bootstrap.md`) are NOT foundation
docs and stay as-is — they're records of how the system was designed at
those phases.

## Current State

Foundation docs describe the system with phrases like:

- "bootstrap mode" / "bootstrap session"
- "the bootstrap explorer" / "the explorer agent"
- "Bootstrap mode is agentic — `course.start_exploration` runs..."
- `client.author.bootstrap(files): DraftCourse` (architecture diagram)

## Target State

Foundation docs describe the system as it now is:

- "course-create mode" / "course-create session"
- "the drafter"
- "Course-create mode is agentic — `course.start_drafting` runs..."
- `client.author.createCourse(files): DraftCourse` (or, since this method
  is a placeholder that throws, mention it as such — see implementation
  notes)

## Files

**Foundation docs in scope**:
- `docs/VISION.md` — 1 occurrence (line ~61)
- `docs/SPEC.md` — 1 occurrence (line ~111)
- `docs/ARCHITECTURE.md` — ~8 occurrences (lines 54, 57, 144, 312, 333,
  337, 390, 392 from the discovery scan)
- `docs/CURRICULUM.md` — ~9 occurrences (lines 112-119 section header,
  128, 138, 140, 173, 210, 233, 243, 249, 254 from the discovery scan;
  filter against Category-B generic usage)
- `docs/UX.md` — ~8 occurrences (lines 25, 50, 76, 92, 188, 234, 351, 472)
- `docs/ROADMAP.md` — ~17 occurrences (Phase 6 section header at line
  106, Phase 16a section starting around line 303, plus scattered
  references)
- `docs/ONBOARDING.md` — ~4 occurrences (lines 99, 102, 107, 164)
- `docs/CONTRACT.md` — ~15 occurrences (type definitions and tool
  descriptions at lines 344, 350, 417, 617, 889-898, 1109, 1326-1329,
  1509, 1513, 1582, 1635-1657, 1666, 1673)
- `docs/v1-ship-checklist.md` — 1 occurrence (line ~62)
- `CLAUDE.md` — the "Bootstrap explorer tools" inline reference around
  line 115 (a project-level instruction file)

**Out of scope**:
- `docs/designs/*.md` — historical phase designs
- `docs/refactors/*.md` — historical refactor plans
- `.work/archive/**` and `.work/releases/**` — substrate history
- Migration SQL comments referencing the old display name — committed
  migrations are history
- Mockup HTML files under `.mockups/` — visual mockups; if they contain
  "bootstrap" copy, the mockup file itself is a snapshot of a design moment
  (the UI mocks were already retrofitted away from "bootstrap" — verify
  on the way through)

## Category guide (from discovery scan)

For each occurrence, apply one of:

- **A (Direct rename)** — the named entity. Rewrite to new naming.
- **B (Generic usage)** — "bootstrap a process" (CS-generic), "exploration"
  in pedagogical sense ("topical exploration mode"). Leave alone unless
  surrounding context makes the rename clearer.
- **C (Context-dependent)** — paragraph blends conceptual and named-entity
  prose. Case-by-case rewrite.

Examples of Category B (leave alone):
- "Gates exist to enforce prerequisite competence and motivate progression
  — _not_ to prevent exploration" (pedagogical exploration)
- "Topical exploration ('teach me about evolution')" (pedagogical)
- "session bootstrap (pick mode + scope)" — generic CS initialization; the
  paragraph is about session-startup wiring, not bootstrap mode. Acceptable
  to clarify as "session start" if context is otherwise muddled.

Examples of Category A (rewrite):
- "open a bootstrap session" → "open a course-create session"
- "the bootstrap explorer agent" → "the drafter"
- "Bootstrap mode toolNames" → "Course-create mode toolNames"
- "## Phase 16a: Bootstrap explorer + course-scoped documents" →
  "## Phase 16a: Drafter + course-scoped documents"

## Implementation Notes

- **Never add "previously" prose.** Run a `grep -i "previously\|originally\|formerly\|used to be called\|was named\|renamed from"` over your diff against foundation docs to catch slips.
- Spot-check narrative consistency: if a paragraph references the drafter,
  prior context shouldn't still call it the explorer.
- For ARCHITECTURE.md line 144 (`client.author.bootstrap(files): DraftCourse`):
  this method is a Phase 11 placeholder that throws "use bootstrap mode
  agent loop or course.use_canonical_pack" — the architecture diagram
  documents an aspirational API. Update the diagram entry to
  `client.author.createCourse(files): DraftCourse` AND note in the prose
  that it's a placeholder (or remove the line entirely if it adds noise
  — author's judgment).
- For CONTRACT.md type definitions: these are the canonical type names.
  Any types whose names changed in Steps 3-4 (`BootstrapService`,
  `BootstrapConfig`, `bootstrapMode`, etc.) need their CONTRACT entries
  flipped to the new names. Cross-reference CONTRACT.md against the
  generated type-only imports in code to ensure the doc tracks the
  implementation post-Step 4.
- CLAUDE.md is the project-level instruction file for AI agents. Its
  "Bootstrap explorer tools" subheading and the surrounding paragraph
  describe the architecture — update to match new naming.

## Acceptance Criteria

- [ ] All Category A occurrences from the discovery inventory are rewritten
- [ ] `grep -in "bootstrap mode\|bootstrap session\|bootstrap explorer\|bootstrap agent\|the explorer" docs/*.md CLAUDE.md` returns no results outside `docs/designs/` and `docs/refactors/`
- [ ] `git diff docs/ CLAUDE.md | grep -iE "^\+.*previously|^\+.*originally|^\+.*formerly|^\+.*used to be called|^\+.*was named|^\+.*renamed from"` returns no results (no rolling-forward violations)
- [ ] CONTRACT.md's type definitions track the implementation (cross-check
      a sample of renamed types like `CourseCreateService`,
      `CourseCreateConfig`, `courseCreateMode` against their source)
- [ ] CLAUDE.md "Bootstrap explorer tools" section updated to new naming
- [ ] No code changes; this story is doc-only

## Risk

**Low** — documentation only. No code; no runtime impact. The only failure
mode is sloppy prose that mixes old and new naming within the same paragraph;
the consistency check in the acceptance criteria catches that.

## Rollback

`git revert <commit>` — doc-only revert, no consequences.

## Implementation Notes

### File-by-file occurrence count (before → after)

| File | Before | After | Notes |
|------|--------|-------|-------|
| `docs/VISION.md` | 1 | 0 | "calculus bootstrap" → "calculus course-create" |
| `docs/SPEC.md` | 1 | 0 | "bootstrap-readiness work … bootstrap and configure modes" → new wording |
| `docs/ARCHITECTURE.md` | 8 | 1 | 7 renamed; 1 kept (Category B: `1. Bootstrap` step label) |
| `docs/CURRICULUM.md` | 9 | 0 | All renamed; "session bootstrap" clarified to "session start" |
| `docs/UX.md` | 8 | 1 | 7 renamed; "next-session bootstrap" → "next session's opening" |
| `docs/ROADMAP.md` | 17 | 0 | All renamed, including Phase 6 header and Phase 16a header |
| `docs/ONBOARDING.md` | 4 | 0 | All renamed |
| `docs/CONTRACT.md` | 15 | 5 | 10 renamed; 5 kept (see below) |
| `docs/v1-ship-checklist.md` | 2 | 0 | Both renamed |
| `CLAUDE.md` | 3 | 0 | All 3 renamed (permission mode note, "Bootstrap explorer tools" section, phase map) |

### Category-B occurrences intentionally kept

1. **ARCHITECTURE.md `1. Bootstrap`** — generic CS step label in the session data flow diagram. This names the initialization phase of a session, not the course-create mode.

2. **CONTRACT.md `{ kind: "bootstrapped"; sourceMaterials: DocumentId[] }`** — the `CourseSource` discriminated union's `"bootstrapped"` variant. This is the stored data-model discriminator value still in the codebase (Steps 1–4 did not rename `CourseSource` variants, only mode ids and service symbols). Kept as accurate documentation of the actual type.

3. **CONTRACT.md `Gates are bootstrapped in locked state`** — generic CS initialization sense.

4. **CONTRACT.md `bootstrap(files, opts) → DraftCourse`** (comment) and **`bootstrap(files: FileRef[], ...)` method** — the `AuthoringService.bootstrap()` placeholder method still exists in the codebase under that name (Steps 1–4 scope was the mode, service, and IPC layer — not this aspirational placeholder). Kept accurate. The comment around it was updated to use `course-create` for mode references.

### `client.author.bootstrap()` resolution

The `bootstrap` line was **removed from the architecture diagram** in ARCHITECTURE.md (line 144) rather than renamed. The diagram already had `createCourse()` on the line above; duplicating it as `createCourse(files)` would add confusion. A comment was added to `createCourse()` noting it's a placeholder — v1 course creation goes through course-create mode tools. The `AuthoringService.bootstrap()` interface method in CONTRACT.md line 899 was kept accurate to the code.

### Rolling-forward check

`git diff docs/ CLAUDE.md | grep -iE "^\+.*previously|^\+.*originally|^\+.*formerly|^\+.*used to be called|^\+.*was named|^\+.*renamed from"` returned zero hits.

### Acceptance criteria status

- [x] All Category A occurrences from the discovery inventory are rewritten
- [x] `grep -in "bootstrap mode\|bootstrap session\|bootstrap explorer\|bootstrap agent\|the explorer" docs/*.md CLAUDE.md` returns no results outside `docs/designs/` and `docs/refactors/`
- [x] Rolling-forward grep returned zero hits
- [x] CONTRACT.md's IPC channels, tool names, and mode references track the implementation (`praxis.courseCreate.drafts.events.*`, `course.start_drafting`, course-create mode)
- [x] CLAUDE.md "Bootstrap explorer tools" section renamed to "Drafter tools"
- [x] No code changes; doc-only

## What's now possible (post-feature note)

Once Step 5 lands, the entire feature is complete: backend code, tool
names, mode ids, prompt files, and foundation docs all use the same
vocabulary — `course-create` mode, the drafter, `course.start_drafting`.
Any agent reading the codebase and docs encounters a single consistent
framing that matches the UI surface ("Create a course", "Praxis is
drafting"), and the naming bleed that motivated this refactor has no
remaining foothold in the active codebase or its documentation.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:

Doc-only change; all acceptance greps clean:

- `grep -in "bootstrap mode|bootstrap session|bootstrap explorer|the explorer" docs/*.md CLAUDE.md` (excluding `docs/designs/` and `docs/refactors/`) → zero results
- Rolling-forward grep over the diff → zero results (no "previously", "originally", "formerly", "renamed from")
- CONTRACT.md tracks the post-Step-4 implementation: `course-create` mode discriminator and `course.start_drafting` tool name are used consistently in the tool catalog (lines 1327-1330) and the mode definition (line 1108, 1110, 1514)

Category-B preservation handled with judgment — 5 occurrences kept in CONTRACT.md and 1 in ARCHITECTURE.md (the `1. Bootstrap` numbered step header) are CS-sense "bootstrap" uses, and `"bootstrapped"` as a past-tense verb in some descriptive prose is appropriate to keep when context is unambiguous.

The `client.author.bootstrap()` line in ARCHITECTURE.md was removed (vs renamed) since the underlying method remains a placeholder that throws, and the `createCourse` placeholder is already documented adjacent — removing the duplicate avoids confusion. Reasonable judgment call.

Foundation docs now describe the system as it currently is. Future agents reading the codebase + docs find a single consistent vocabulary.

This commit completes the `refactor-rename-bootstrap-and-explorer` feature.
