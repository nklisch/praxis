# Migration Report — agile-workflow bootstrap

**Date:** 2026-05-09
**Source shape:** workflow-plugin
**Destination:** `.work/` substrate (single commit)

## Foundation docs detected (preserved)

- `docs/VISION.md`
- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/CONTRACT.md`
- `docs/UX.md`
- `docs/CURRICULUM.md`
- `docs/ROADMAP.md`

All seven left untouched. Foundation docs roll forward through `scope` /
`design` / `implement`, never through `convert`.

## Items seeded

### Active epics — `.work/active/epics/`

| ID | Stage | Tags | depends_on |
|---|---|---|---|
| `epic-phase-18-study-skills` | drafting | `[content]` | `[]` |
| `epic-phase-19-ship-v1` | drafting | `[content]` | `[epic-phase-18-study-skills]` |

Phases 1–17 are not seeded as epics because they shipped before bootstrap;
their work lives in `releases/v0/` instead.

### Active features — `.work/active/features/`

| ID | Stage | Tags | depends_on |
|---|---|---|---|
| `feature-claude-cli-sdk-refactor` | review | `[refactor]` | `[]` |

All 8 implementation units of this design have landed as commits; remaining
work is the test suite for native session-resume + the parser/schemas tests
that complete the design's "What ships" list. Working-tree changes at
bootstrap time match this remaining surface.

### Retro-release `v0` — `.work/releases/v0/`

24 features bound to `release_binding: v0`, plus the synthesized release
item itself.

**Phase designs (19):**
- `feature-phase-1-foundation`
- `feature-phase-2-engine-layer`
- `feature-phase-3-ui-shell`
- `feature-phase-4-verification-tools`
- `feature-phase-5-textbook-rag`
- `feature-phase-6-course-lesson-bootstrap`
- `feature-phase-7-adaptive-memory`
- `feature-phase-8-multi-mode-assessment`
- `feature-phase-9-gates-progress-map`
- `feature-phase-10-knowledge-graph-canonical-pack`
- `feature-phase-11-configure-mode-authoring`
- `feature-phase-12-workspace-notes-flashcards`
- `feature-phase-13-editorial-foundation`
- `feature-phase-14-tabs-and-library`
- `feature-phase-15a-sketch-foundation`
- `feature-phase-15b-concept-map`
- `feature-phase-16a-bootstrap-explorer`
- `feature-phase-16b-modalities-and-assessment-loop`
- `feature-phase-17-item-types-and-quick-checks`

**Non-phase chunks (4):**
- `feature-activity-rail`
- `feature-language-sandbox-registry`
- `feature-claude-auth`
- `feature-structured-logging-observability`

**Release item:**
- `release-v0` (`stage: released`)

Each feature carries a brief retro summary + pointer to the original design
file. The original design content stays in `docs/designs/` untouched.

### Backlog — `.work/backlog/`

Empty. The workflow-plugin source had no backlog files.

### Archive — `.work/archive/`

Empty. Per the conventions interview, shipped designs went to a synthesized
`v0` release rather than archive (preserves continuity for future
`depends_on:` chains across releases).

## Files left in place (review and delete if desired)

- `docs/designs/` — 24 design files preserved as history. The substrate
  now owns design content for all future work; these become read-only.
- `docs/refactors/` — 3 retro docs (`2026-04-post-phase-4.md`,
  `2026-04-post-phase-12.md`, `2026-05-post-phase-14-ui.md`) left in
  place. Future refactors live as items with `tags: [refactor]`.
- `docs/ROADMAP.md` — preserved as historical context. The substrate's
  active epics + retro-release v0 now hold the canonical state. Delete
  if desired; foundation-doc rolling-forward is the new pattern.

## Conventions chosen

| Setting | Value |
|---|---|
| Release mapping | `tag-based` |
| Tag taxonomy | `refactor, perf, content, ui, cleanup, docs` |
| Slug convention | kebab-case with parent-prefix for children |
| Stage overrides | none (master flow) |
| Gate order | `security → tests → cruft → docs → patterns` |

## Plugin artifacts written

- `.work/CONVENTIONS.md` — project conventions
- `.work/bin/work-view` — copied from
  `${CLAUDE_PLUGIN_ROOT}/scripts/work-view.sh`, executable
- `.claude/rules/agile-workflow.md` — auto-loaded navigation rules
  (`paths: ['.work/**', 'docs/**']`)
- `CLAUDE.md` — appended `<!-- agile-workflow:start -->` … `<!-- agile-workflow:end -->`
  section after the existing "Phase map" section

## Next steps

1. **Verify retro-release.** Spot-check 2–3 feature items in
   `.work/releases/v0/` against their original design docs.
2. **Land the SDK refactor.** Commit the pending parser/conversation/resume
   tests, then run `/agile-workflow:review` on
   `feature-claude-cli-sdk-refactor` to advance it `review → done`.
3. **Decide whether to bind the SDK refactor to a real release.** Either
   bind to `v0.2.0` (next tagged release) and run `/agile-workflow:release-deploy`,
   or leave `release_binding: null` and let it archive on completion.
4. **Design Phase 18.** Run `/agile-workflow:design` against
   `epic-phase-18-study-skills` to decompose into features with
   `depends_on:` chains.
5. **Delete this report** (`MIGRATION_REPORT.md`) once the migration is
   verified — it lives at repo root, not in `docs/`, because it's transient.

## How to revert

The migration is a single git commit. If anything looks wrong:

```
git revert HEAD
```

Source files (foundation docs, design docs, source code) are untouched
across the board, so re-running `/agile-workflow:convert` after a revert is
safe.
