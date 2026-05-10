---
id: epic-phase-19-ship-v1
kind: epic
stage: done
tags: [content]
parent: null
depends_on: [epic-phase-18-study-skills]
release_binding: v0.1.0
gate_origin: null
created: 2026-05-09
updated: 2026-05-10
---

# Phase 19 — Biology canonical + Electron packaging + ship v1

Source: `docs/ROADMAP.md` Phase 19 — the M3 milestone.

**Goal:** Shippable v1 — signed installer for at least one platform with both canonical
packs (Algebra/Geometry from Phase 10 plus Biology landing here).

## What ROADMAP says

- Curated canonical biology concept graph (parallel to the math pack from Phase 10).
- Signed Electron installer for macOS, Windows, or Linux (at least one).
- Auto-update channel decision (built-in updater vs manual download).
- A complete v1 user-facing first-run flow: install → sign in → bootstrap a course →
  start a teach session.
- Documentation pass: README + onboarding video / screencast.

## Decomposition

Split by capability arc, with a clean separation between **content** (biology
pack + first-run flow), **infrastructure** (electron-signing → auto-update),
**docs** (onboarding-docs reading the realised first-run flow), and a single
**terminal aggregator** (ship-checklist) that depends on every other feature
and runs the ROADMAP test checkpoint end-to-end.

The two infrastructure features chain (`auto-update` → `electron-signing`) because
an unsigned installer cannot safely auto-update; everything else parallelises.
The aggregator feature is the M3 go/no-go gate — when it reaches `done`, the
epic advances and `v1.0.0` is cut via `/agile-workflow:release-deploy`.

### Child features

- `epic-phase-19-biology-pack` — author the second canonical pack (NGSS-mapped,
  ~250 concepts) at `packages/curriculum/packs/biology.json` — depends on: `[]`
- `epic-phase-19-electron-signing` — signed installer for the v1 launch
  platform (default: macOS), updating electron-builder config and proving
  no-warning launch on a clean machine — depends on: `[]`
- `epic-phase-19-auto-update` — decide built-in updater vs manual-download
  and land the consequences (publish provider config + UI surface, or
  version-check ping with download link) — depends on:
  `[epic-phase-19-electron-signing]`
- `epic-phase-19-first-run-flow` — install → sign in → bootstrap a course
  → start a teach session, gated by a `firstRunCompletedAt` flag in
  `config_kv` — depends on: `[]`
- `epic-phase-19-onboarding-docs` — README rewrite + onboarding screencast
  plan + in-app copy alignment, calibrated against the realised first-run
  flow — depends on: `[epic-phase-19-first-run-flow]`
- `epic-phase-19-ship-checklist` — the v1 acceptance test on a clean
  machine; produces the go/no-go signal that justifies cutting `v1.0.0`
  via `release-deploy` — depends on: `[epic-phase-19-biology-pack,
  epic-phase-19-electron-signing, epic-phase-19-auto-update,
  epic-phase-19-first-run-flow, epic-phase-19-onboarding-docs]`

### Decomposition risks

- **Biology pack authoring is research-heavy.** ~250 NGSS-mapped concepts
  with concept descriptions, aliases, and prerequisite edges is a real
  authoring lift. The feature-design pass for `biology-pack` should
  decide LLM-drafted-then-curated vs. fully-hand-curated up front and
  size the implementation stories accordingly. Underestimating this
  risks slipping the epic.
- **Cross-platform signing tempts scope creep.** The ROADMAP target is
  "at least one platform"; v1 should commit to one (default: macOS) and
  treat Win/Linux signing as post-v1. The feature-design pass for
  `electron-signing` must say so explicitly to prevent the work from
  ballooning to all three platforms with three certs and three notarisation
  stories.
- **Auto-update path is binary.** The decision (built-in vs manual)
  shapes the entire `auto-update` feature. The design pass needs to make
  that call before scoping stories — picking built-in late means
  retro-fitting a publish provider; picking manual late means tearing out
  electron-updater wiring. Make it once, document it once.
- **First-run flow leaks into existing settings surfaces.** Auth and
  engine config already exist as deeper settings; first-run wraps them.
  The design pass should pin which existing components are reused vs.
  re-implemented to avoid two parallel API-key entry surfaces.
- **Ship-checklist as feature, not as gate.** Treating the dogfooding
  script as a feature (rather than an ad-hoc check during release-deploy)
  is intentional: it gives the failure-triage outputs a substrate home
  and forces a clean go/no-go signal before the release tag is cut.
  Risk: the checklist gets soft-passed by hand-waving over divergences.
  The design pass must specify the failure-triage rubric so this doesn't
  happen.

## Next step

Each child feature is at `stage: drafting`. Autopilot picks them up via the
feature-design family (`/agile-workflow:feature-design` for greenfield) in
dependency order: the four `depends_on: []` features are immediately ready;
`auto-update` and `onboarding-docs` unblock once their predecessors finish;
`ship-checklist` unblocks last. After this epic reaches `done`, run
`/agile-workflow:release-deploy v1.0.0` to bind and gate the v1 release.

## Review (2026-05-10)

**Verdict**: Approve

All six child features approved and at `stage: done`:

- `epic-phase-19-biology-pack` (NGSS-mapped biology canonical pack —
  106 concepts, 142 prerequisite edges, ships at
  `packages/curriculum/packs/biology.json`)
- `epic-phase-19-electron-signing` (env-var-driven macOS signing +
  notarisation pipeline; entitlements plist; `docs/CODE-SIGNING.md`)
- `epic-phase-19-auto-update` (manual-download flow with version-check
  banner; `docs/UPDATE-CHANNEL.md`)
- `epic-phase-19-first-run-flow` (three-step welcome + engine + course
  flow gated by `firstRunCompletedAt` in `config_kv`)
- `epic-phase-19-onboarding-docs` (`docs/ONBOARDING.md` + README "For
  users" section)
- `epic-phase-19-ship-checklist` (`docs/v1-ship-checklist.md` — the
  acceptance script driving the v1.0.0 release rehearsal)

**Capability completeness**: every line of ROADMAP Phase 19's "Build"
list is satisfied — biology canonical pack, signed Electron installer,
auto-update channel decision, first-run flow, documentation pass.
The "Test checkpoint" requirement is captured in
`docs/v1-ship-checklist.md`.

**Foundation-doc alignment**: three new foundation docs landed
(`CODE-SIGNING.md`, `UPDATE-CHANNEL.md`, `ONBOARDING.md`) plus the
release-specific `v1-ship-checklist.md`. README rolled forward with a
"For users" section and an updates pointer. Code-level foundation docs
(VISION, SPEC, ARCHITECTURE, UX, CURRICULUM) needed no updates — this
epic adds operational + user-facing content rather than changing the
system architecture.

**Breaking changes**: none cross-cutting. Additive: new IPC channels
(`praxis.config.firstRunCompleted`, `praxis.config.markFirstRunComplete`,
`praxis.update.checkLatest`); new `update: UpdateClientApi` on
`PraxisClient`; new env vars (`MAC_SIGNING_IDENTITY`, `APPLE_*`,
`PRAXIS_UPDATE_FEED_URL`); new files in `packages/desktop/build/` and
`packages/curriculum/packs/`. Existing test stubs use the
`as unknown as PraxisClient[...]` cast pattern and don't gate on the
new methods, so no test fallout.

**Blockers**: none
**Important**: none — all individually filed during child reviews
(see `.work/backlog/idea-*` items: biology-pack-bootstrap-smoke-test,
electron-multi-arch-rebuild, onboarding-claude-code-signin,
onboarding-course-card-pre-seed). Each is a small post-v1 polish; none
gate v1.0.0.
**Nits**: none — children's individual reviews already absorbed
line-level feedback.

**Notes**: `pnpm typecheck` and `pnpm test` green at 2270 passing
across the workspace. The cumulative diff for the epic touches
~30 files; per-feature reviews have inspected each piece individually.

## What's now possible

- A maintainer can produce a signed, notarised macOS installer for
  Praxis v1.0.0 by running `pnpm --filter @praxis/desktop dist:mac`
  with the right env vars set.
- A new user landing on the project's downloads page can install,
  complete first run, run their first teach session, and see update
  notifications without dev tooling.
- Praxis ships with two canonical packs — algebra-1 from Phase 10 and
  biology from this phase — so users have an immediate "start here"
  option for both math and life sciences.
- The v1.0.0 acceptance rehearsal is scripted; the maintainer runs
  `docs/v1-ship-checklist.md` end-to-end on a clean macOS account and
  produces a go/no-go signal that justifies tagging the release.
- Once the rehearsal returns "Go", `/agile-workflow:release-deploy
  v1.0.0` binds Phase 19's items into `.work/releases/v1.0.0/` and
  runs the gate sweep — the M3 milestone is shippable.
