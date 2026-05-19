---
id: epic-ui-redesign-ground-up-configure-memory-tab-canvas
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on: [epic-ui-redesign-ground-up-configure-canvas-side-chat-shell]
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Configure Memory tab canvas — projection tabs + tables/cards

## Scope

Rebuild Memory tab canvas per `tab-memory.html`:
- Projection-tab strip: semantic / misconceptions / procedural /
  affective / episodic.
- Per-projection canvas:
  - **semantic**: BKT-adjusted concept mastery table with per-row
    recompute action.
  - **misconceptions**: cards with evidence quotes + concept link +
    strength badge + inline address-or-clear actions.
  - **procedural / affective / episodic**: read-mostly views of the
    respective projections.

## Implementation steps

1. Edit `packages/ui/src/routes/configure/memory-tab.tsx`.
2. New `<ProjectionTabStrip>` switching the canvas view.
3. Per-projection components:
   - `<SemanticTable>` with per-row recompute.
   - `<MisconceptionCards>` with evidence + actions.
   - Simple list views for procedural / affective / episodic.
4. Wire to `praxisClient.authoring.{resetConcept, clearMisconception, ...}`
   plus read methods on `MemoryService`.
5. Tests cover projection-switch + row interactions.
6. Quality checks green.

## Acceptance criteria

- [x] Memory tab matches the locked mock.
- [x] All five projection views render.
- [x] Recompute + clear actions work end-to-end.
- [x] All quality checks green.

## Implementation notes

Rewrote `memory-tab.tsx` from the old `MemoryInspectorTabs` wrapper into a
self-contained canvas per `tab-memory.html`:

- **Canvas head** — kicker + italic display title + deck description matching
  the mock's editorial style.
- **Projection tab strip** (`ProjectionTabBtn`) — five tabs with count badges
  derived from live data (concept count, active misconception count, strategy
  count). Active tab underlined with `--color-text-primary` border, not accent,
  per the mock.
- **SemanticPane** — grid layout (4 columns: concept / mastery bar / last
  practiced / recompute link). Mastery fill color tiered low/mid/high by pKnown
  threshold (< 0.45 / < 0.70 / ≥ 0.70). Recompute opens `ConfirmReasonModal`
  → `client.author.resetConcept`.
- **MisconceptionsPane** — cards with left-border severity indicator
  (danger = active, success = cleared). Head row shows: mono id chip, italic
  concept + description snippet, strength badge (strong/forming/cleared).
  Evidence blockquote shows `errorForm` + first-observed date. Clear action
  opens `ConfirmReasonModal` → `client.author.clearMisconception`.
- **ProceduralPane** — 4-column grid: strategy id / preference bar / label
  (preferred/neutral/avoids) / evidence count.
- **AffectivePane** — baseline card with three `AffectBar` rows (engagement,
  confidence, frustration); recent samples table (last 20, reversed).
- **EpisodicPane** — lazy-loaded (only fetches when tab first activated);
  capped at 200 events; columnar layout (time / glyph / event type / content
  snippet). Cleanup via `AbortController` on unmount.

The old `MemoryInspectorTabs` component and its CSS module are left in place —
they are still exercised by their own test file and could be reused elsewhere.
`memory-tab.tsx` no longer imports them.

Tests (`configure-memory-tab.test.tsx`, 18 tests): projection tab switching,
semantic table rendering + recompute modal flow, misconception cards + clear
modal flow, cleared-misconception no-action guard, canvas head kicker/title,
affective and procedural pane smoke tests.

## Review (2026-05-18)

**Verdict**: Approve with comments

**Blockers**: none

**Important**:
- `memory-tab.tsx` defines a local `EmptyState({ primary, hint })` function used
  in five places. The project has a shared `<EmptyState>` from
  `packages/ui/src/components/empty-state.tsx`. The `editorial-ui-primitives`
  pattern says "use these primitives, never re-implement." This is a direct
  violation to fix in a follow-up.
  → Item: `configure-memory-tab-local-empty-state`

**Nits**: none

**Notes**: All 1521 tests pass. Typecheck and lint are clean for the changed
files. All five projection views implemented correctly. Lazy episodic loading
with AbortController cleanup is well-handled. Recompute and clear flows with
ConfirmReasonModal are correct. Strength label derivation from `lastObservedAt`
(< 48h = strong) is a reasonable heuristic. The pattern violation is the only
finding; functional delivery is complete.
