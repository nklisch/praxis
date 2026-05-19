---
id: gate-docs-status-strip-no-longer-planned
kind: story
stage: done
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: docs
created: 2026-05-18
updated: 2026-05-18
---

# `<StatusStrip>` is mounted; foundation docs still say "(planned)"

## Drift category
foundation-doc-assertion

## Location
- Doc: `CLAUDE.md:111`
- Doc: `docs/UX.md:5`
- Doc: `docs/ARCHITECTURE.md:13-16`
- Code: `packages/ui/src/router.tsx:65` (mounts `<StatusStrip>`),
  `packages/ui/src/components/status-strip.tsx` (implementation)

## Current doc text
CLAUDE.md:111
> The app chrome is `<TopNav>` (running head) with a `<StatusStrip>`
> (planned) directly beneath it ... (or, until that lands, the
> `useActivity()` hook directly).

UX.md:5
> a near-invisible status strip directly beneath it (`<StatusStrip>`,
> planned) ...

ARCHITECTURE.md:13-16
> <TopNav> + <StatusStrip> at router root
> (ambient background work via status strip beneath running head; rail
> component exists but is not mounted)

## Reality
`<StatusStrip>` is implemented and mounted at the router root.
`<ActivityRail>` still exists at `packages/ui/src/components/activity-rail.tsx`
but is unmounted.

## Required edit
- CLAUDE.md: drop the "(planned)" parenthetical and the "(or, until that
  lands, the `useActivity()` hook directly)" caveat. State that the strip
  is the live ambient-progress surface; producers render through it via
  the `ActivityRegistry` injected as `ServiceDeps.activity`.
- UX.md: drop "planned" qualifier.
- ARCHITECTURE.md: trim the parenthetical — `<StatusStrip>` is the live
  surface beneath `<TopNav>`; the standalone `<ActivityRail>` component is
  retained but unused.

Apply rolling-foundation: no "previously planned" prose, no "in v0.1.x"
notes. Replace assertions in place.

## Implementation notes (2026-05-18)

Three foundation docs updated in place (rolling-forward; no hedging prose added):

- **CLAUDE.md** (line 111, UI shell bullet): Dropped `(planned)` parenthetical and the `(or, until that lands, the \`useActivity()\` hook directly)` caveat. Now reads: `<StatusStrip>` is mounted directly beneath `<TopNav>` at the router root; long-running services inject `ActivityRegistry` via `ServiceDeps.activity` and producers render through the strip via `ActivityHandle`; the standalone `<ActivityRail>` component is retained but unused.

- **docs/UX.md** (line 5): Dropped `planned` qualifier from the status-strip description. Now reads: `<StatusStrip>` mounted directly beneath `<TopNav>` at the router root — a near-invisible surface surfacing ambient background work without blocking navigation; the standalone `<ActivityRail>` component is retained but unused.

- **docs/ARCHITECTURE.md** (lines 13–16, diagram annotation): Replaced the parenthetical describing the rail as unmounted with a precise annotation. Now reads: `<StatusStrip>` is the live ambient-progress surface beneath `<TopNav>`; `<ActivityRail>` is retained but unused.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: "(planned)" dropped from CLAUDE.md, UX.md, and ARCHITECTURE.md. All three docs verified — present tense, no hedging prose. CLAUDE.md now correctly states ActivityRail "retained but unused." Rolling-foundation discipline maintained.
