---
id: epic-release-v0.1.0-readiness
kind: epic
stage: done
tags: []
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# v0.1.0 release readiness — drain all 5 gate origins

## Brief

The `v0.1.0` release-deploy run reached `stage: quality-gate` on 2026-05-10
and surfaced 45 findings across the four item-producing gates (security,
tests, cruft, docs) plus 4 patterns codified by the patterns gate. The
release will not ship until all 45 gate items reach `stage: done`. This
epic organizes them so they can be drained as a coherent unit instead of
scattered top-level stories.

The substance of each finding lives in the individual story bodies. The
epic and its 4 child features are pure organization — the work was
already designed by the gate audits.

## Decomposition

Four features, one per gate origin. Each feature's children are the
existing gate stories, re-parented to the feature.

- **`feature-release-v0.1.0-security-findings`** — 4 active stories
  (1 High `update-feed-url-scheme-validation`, 3 Medium) +
  3 backlog Lows. Bound to v0.1.0 via the gate's `release_binding`.
- **`feature-release-v0.1.0-test-findings`** — 3 active stories
  (1 High `onboarding-config-persistence`, 2 Medium) + 5 backlog Lows.
- **`feature-release-v0.1.0-cruft-findings`** — 6 High active stories
  (all mechanical Biome-detected fixes; 1-3 line edits each) + 1
  backlog Low.
- **`feature-release-v0.1.0-doc-findings`** — 23 High active stories
  spanning foundation-doc drift, README staleness, CHANGELOG
  backfill, repo-skill staleness, and 9 pattern-skill citations.

## Why an epic for what could be a single drain pass

- **Single readiness gate**: one epic stage:done is the substrate's
  signal that v0.1.0 readiness is satisfied (all 4 child features done,
  all 45 stories done).
- **Per-gate scoping**: a future operator can run
  `/agile-workflow:autopilot feature-release-v0.1.0-cruft-findings` to
  drain just the mechanical cleanup pass, separately from the more
  thoughtful security + docs work. Without features, every drain is
  all-or-nothing.
- **Cleaner kanban**: 45 top-level stories on a board hide the structure
  ("are these all related? is this normal?"). 4 grouped features under
  one epic reads as the operational reality ("we're draining the v0.1.0
  release gates").

## Stage rationale

This epic and its child features are at `stage: implementing` directly,
skipping `drafting`. Justification: every child story already has a full
body (severity, location, evidence, suggested fix) written by its gate
audit; there is no design work to do. The design family
(`/agile-workflow:epic-design`, `/agile-workflow:feature-design`) would
redesign work that is already specified — wasteful and risks divergence
from the gate's evidence. The orchestrator can pick this up at
implementing today.

## Source

Direct user request via `/scope all gated tasks` after `/agile-workflow:release-deploy`
halted at readiness for `v0.1.0`. See `.work/active/release-v0.1.0.md`
for the bind set, the gate-run summaries, and the readiness state table.

## Children

(See the four `feature-release-v0.1.0-*-findings` files; each child
feature lists its bound stories.)

---

## Review (2026-05-10)

**Verdict: Approve. Epic delivered as briefed; advancing to done.**

All 4 child features at `stage: done`:
- `feature-release-v0.1.0-security-findings` — 4 active findings closed (1 High + 3 Medium); 3 Lows parked.
- `feature-release-v0.1.0-test-findings` — 3 active findings closed (1 High + 2 Medium); 5 Lows parked.
- `feature-release-v0.1.0-cruft-findings` — 6 active findings closed (all High mechanical); 1 Low parked.
- `feature-release-v0.1.0-doc-findings` — 23 active findings closed (foundation-doc roll-forward, pattern-skill citations, CHANGELOG backfill, CONTRACT.md additive sections).

Per the epic-review heuristic in `/agile-workflow:review`: per-line lenses don't apply here (each child was reviewed individually). Aggregate lenses:

- **Capability completeness**: the v0.1.0 release-readiness scope is complete. Every gate-produced active finding from the 4 item-producing gates has been addressed.
- **Foundation-doc alignment**: ARCHITECTURE / CURRICULUM / UX / SPEC / CONTRACT / README / CLAUDE / patterns are all rolled forward to the v0.1.0 present. No "previously" prose introduced anywhere.
- **Breaking changes**: none. The IPC handler lock-gate is the only behavioral shift visible to consumers; matches the documented `praxis.author.*` pattern.
- **Cross-cutting concerns**: 12 new tests landed (2365 → 2377 passing). The mid-drain test fix at `f8795df` resolved the only regression introduced (UX.md scope-stretch's mode-meta entry duplicated a label).

9 backlog children remain bound to v0.1.0 for traceability (3 sec Lows + 5 tests Lows + 1 cruft Low). They do not block this epic's `done` status. To exclude them from the readiness check that gates `release-deploy v0.1.0` ship, edit each backlog file's frontmatter to remove the `release_binding: v0.1.0` line.

## What's now possible

The v0.1.0 readiness epic is complete. Re-run `/agile-workflow:release-deploy v0.1.0` to resume from Phase 5.5 (changelog draft prepends `## v0.1.0` to the now-existing CHANGELOG.md) → Phase 6 (tag-based ship via `git tag v0.1.0 && git push`) → Phase 7 (move all bound items to `.work/releases/v0.1.0/`) → Phase 8 (release file → `stage: released`).
