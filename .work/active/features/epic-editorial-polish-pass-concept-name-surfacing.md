---
id: epic-editorial-polish-pass-concept-name-surfacing
kind: feature
stage: review
tags: [ui, configure, editorial]
parent: epic-editorial-polish-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Concept name surfacing — show names everywhere a concept appears in editing UIs

## Brief

The gates editor and the course editor both surface concept IDs to the
user where they should display the concept's human-readable name.
Anchor verification confirmed the divergence: the **gates editor**
uses a React Flow `ConceptNode` custom node for graph visualization
(`gates-tab.tsx`), while the **course editor** renders concepts as a
comma-separated text input inside the `LessonEditor` (`lesson-editor.tsx`
lines 112–127). These are two separate rendering paths — fixing one
doesn't fix the other.

This feature **standardizes on showing concept names everywhere a
concept appears in editing UIs**, with the raw ID available on hover
or as secondary text. Both render paths get touched: ConceptNode in the
gates editor (which currently shows the ID prominently and needs to
swap to name + secondary ID), and the LessonEditor's text-input field
(which today is a CSV of IDs — needs to become a picker that displays
names while still storing IDs).

The gates editor also has a layout problem: concepts are crammed into a
single horizontal line that's barely legible. This feature reorganizes
that layout (wrap, stack, group by unit/lesson, or a denser-but-
readable component — exact shape at feature-design) and adds a
zoom/expand affordance so an author can actually reason about which
concepts are involved.

## Epic context

- Parent epic: `epic-editorial-polish-pass`
- Position in epic: independent — touches the configurator tab panels.
  Runs in parallel.

## Scope absorbed from backlog

- `idea-gates-editor-show-concept-names-not-ids` — show concept names
  (not IDs) everywhere a concept appears in editing UIs; reorganize
  the gates editor layout for readability + add expand affordance.

## Foundation references

- `docs/CURRICULUM.md` — concept / knowledge-graph model
- `CLAUDE.md` — pattern `editorial-ui-primitives`, `use-resource-hook`

## Anchors (current implementation)

- Gates editor route —
  `packages/ui/src/routes/configure/gates-tab.tsx` (uses ConceptNode
  React Flow custom node, imported at line 8; `buildGraph` populates
  `ConceptNodeData.name = conceptId` at line 215 — that is the bug)
- Concept node component —
  `packages/ui/src/components/concept-node.tsx` (already exposes a
  `name` field on `ConceptNodeData` — the data plumbing is what's
  wrong, not the component shape; will extend with a secondary id)
- Course editor route —
  `packages/ui/src/routes/configure/course-tab.tsx` (already loads
  full concepts via `getCourseSummary` into local state and passes
  `availableConcepts: Array<{ id; name }>` down to `LessonEditor`)
- Lesson editor (concept CSV input) —
  `packages/ui/src/components/lesson-editor.tsx:107-142` (textarea +
  `conceptHints` chip strip — full multi-select replacement)
- Concept lookup — `client.artifacts.concepts(courseId)` IPC channel
  in `packages/client/src/services/artifacts-client.ts:107` returns
  full `ConceptRow[]` (id, name, description, aliases, standardsTags)
  in one round-trip; backed by
  `packages/core/src/services/artifacts-service.ts:384`. **Already
  exists** — the "batched lookup" is course-scoped, not per-id

## Pre-design decisions (2026-05-14)

- **LessonEditor concept input**: replace the comma-separated text
  input with a multi-select picker. Authors search and see by
  concept name; the underlying field still stores IDs.
- **ConceptNode (gates editor)**: swap to name-prominent + ID as
  secondary text (small / muted). Hover or expand affordance shows
  the full ID for debugging.
- **Gates layout reorganization**: feature-design picks the exact
  shape. Hard requirement: all concepts in a gate are readable
  without horizontal scrolling at the default panel width.
- **Zoom / expand affordance**: a single button on each gate to
  expand into a larger reading view (modal or inline pop-out —
  feature-design picks based on editorial primitives).

---

## Design decisions

- **Hook design — course-scoped fetch, in-memory map, no per-id IPC**:
  the existing `client.artifacts.concepts(courseId)` already returns
  the full concept list for a course in one round-trip. Adding a
  per-id IPC would be over-engineering. The hook wraps that one call
  and returns a stable `getName(id) => string` lookup, with `loading`
  and `error` from `useResource`. Rationale: simplest thing that
  works, zero new IPC surface, matches existing
  `use-resource-hook` pattern.
- **Picker primitive — built in-house, not a library**: Praxis has no
  combobox library and the editorial system is opinionated. A 60-line
  in-house picker (input + filtered dropdown + selected chips) matches
  `editorial-ui-primitives` aesthetics and avoids dragging in
  Downshift/Headless UI. Rationale: deliberate consistency over
  generic library; small enough to own.
- **ConceptNode secondary line — visible by default, not on-hover**:
  show id below the name in `--color-text-muted` at ~0.6rem. Authors
  scanning a graph for a specific id shouldn't have to hover every
  node. The id remains copy-selectable. The hover affordance is for
  the *full* id in a `title=` tooltip (in case the rendered id is
  ellipsized).
- **Gates layout — vertical lesson list, NOT a React Flow rewrite**:
  the React Flow graph stays as the *visual map*, but a parallel
  vertical "Lessons & gates" reading view becomes the new default for
  reading concept content. Reasoning: React Flow's horizontal dagre
  layout is fundamentally why concepts cram into one line.
  Replacing it would be a multi-week project; adding a sibling
  reading view that's clearly the editing surface (graph becomes a
  decorative overview) is one story. The reading view groups concepts
  by lesson, each lesson collapsible, concepts as wrapped chips with
  names + muted ids.
- **Zoom/expand affordance — inline expand, NOT modal**: each gate
  row in the reading view has a chevron that toggles inline
  expansion to a wider reading layout (concept chips become full
  cards with name + id + description). Modal felt like the wrong
  vehicle because authors typically want to compare gates
  side-by-side; expanding inline preserves context. Uses no new
  primitive — pure CSS state on the gate row component.

## Architectural choice

**Chosen**: A small batched-lookup hook layered over the existing
`client.artifacts.concepts(courseId)` IPC, plus two component-level
swaps (data wiring in `gates-tab.tsx`, full picker in
`lesson-editor.tsx`), plus a new vertical reading-view component
parallel to the React Flow canvas in `gates-tab.tsx`.

**Why over alternatives**:
- *Per-id IPC + cache layer*: rejected — `concepts(courseId)` already
  returns the full set in one query. Adding `getConceptById(id)` would
  be N round-trips where 1 works.
- *Wholesale React Flow replacement*: rejected — multi-week scope; the
  graph view is still useful as an overview; a parallel reading view
  delivers the readability win in one story.
- *Generic combobox library (Downshift / Headless UI)*: rejected —
  60-line in-house picker matches the editorial system and avoids new
  deps. Praxis has no precedent for combobox libraries.

## Implementation Units

### Unit 1: `useConceptNames` hook
**File**: `packages/ui/src/hooks/use-concept-names.ts`
**Story**: `epic-editorial-polish-pass-concept-name-surfacing-hook`

```typescript
import type { ConceptId, CourseId } from "@praxis/core/types";

export interface ConceptLookup {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly aliases: ReadonlyArray<string>;
}

export interface UseConceptNamesResult {
  /** Full concept rows for the course, in stable order. */
  concepts: ReadonlyArray<ConceptLookup>;
  /** O(1) lookup by id. Returns null if unknown (still-loading or removed). */
  getById: (id: string) => ConceptLookup | null;
  /** Convenience: name with id fallback for unknown ids. */
  getName: (id: string) => string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useConceptNames(
  courseId: CourseId | undefined,
): UseConceptNamesResult;
```

**Implementation Notes**:
- Wraps `useResource(() => client.artifacts.concepts(courseId))`.
- Builds a `Map<string, ConceptLookup>` from the loaded array,
  memoized on the array identity.
- `getName(id)` returns `map.get(id)?.name ?? id` — id fallback
  preserves debuggability when names haven't loaded or a stale id
  lingers.
- `getById(id)` returns the row or `null`.
- When `courseId` is `undefined`, returns `concepts: []`,
  `getName: (id) => id`, `getById: () => null`, `loading: false`.

**Acceptance Criteria**:
- [ ] Returns `concepts` array reflecting `client.artifacts.concepts(courseId)`.
- [ ] `getName(knownId)` returns the concept's name.
- [ ] `getName(unknownId)` returns `unknownId` (fallback).
- [ ] `getById(unknownId)` returns `null`.
- [ ] Changing `courseId` triggers a refetch.
- [ ] `undefined` courseId resolves to empty state without IPC.
- [ ] Unit-tested with the `fake-client` helper (`tests/helpers`).

---

### Unit 2: ConceptNode name + secondary id surfacing
**File**: `packages/ui/src/components/concept-node.tsx` + module CSS
**File**: `packages/ui/src/routes/configure/gates-tab.tsx` (data wiring)
**Story**: `epic-editorial-polish-pass-concept-name-surfacing-concept-node`

Extend `ConceptNodeData` with a secondary id field; update `buildGraph`
in `gates-tab.tsx` to populate `name` from the concept lookup instead
of the id.

```typescript
// concept-node.tsx
export interface ConceptNodeData extends Record<string, unknown> {
  /** Concept display name. Falls back to id if unknown. */
  name: string;
  /** Raw concept id, shown as muted secondary text + on hover. */
  conceptId: string;
  mastery: number;
  studied: boolean;
  locked: boolean;
}

// ConceptNodeDisplay renders:
//   <span class="name">{data.name}</span>
//   <span class="conceptId" title={data.conceptId}>{data.conceptId}</span>
//   ... existing score / lock icon
```

```typescript
// gates-tab.tsx — buildGraph
function buildGraph(
  lessons: Lesson[],
  gates: GateView[],
  getName: (id: string) => string,
): { nodes: ConceptFlowNode[]; edges: Edge[] };

// Inside the for-loop:
const data: ConceptNodeData = {
  name: getName(conceptId),
  conceptId,
  mastery: 0,
  studied: false,
  locked,
};
```

**Implementation Notes**:
- `useConceptNames(selectedCourseId)` is called at the top of
  `GatesTab`; `getName` is passed into `buildGraph` (added to the
  `useMemo` deps).
- CSS: new `.conceptId` rule below `.name` in
  `concept-node.module.css` — `font-size: 0.6rem;
  color: var(--color-text-muted); font-family: var(--font-mono);`
- `title` attribute on the secondary span shows the full id even
  if truncated by `max-width`.
- Update `concept-node.test.tsx` to assert both name and id render
  and that `title` carries the full id.

**Acceptance Criteria**:
- [ ] `ConceptNodeDisplay` renders both `name` and `conceptId`.
- [ ] In the rendered DOM, the name is visually prominent (larger
  font) and the id is muted (smaller, `--color-text-muted`).
- [ ] `gates-tab.tsx` `buildGraph` populates `name` from
  `getName(conceptId)`, not from the raw id.
- [ ] When the concept lookup is still loading, the node shows
  the id (fallback) — the graph is never blank or broken.
- [ ] Existing `concept-node.test.tsx` tones (mastered, in-progress,
  not-started, locked) all still pass.

---

### Unit 3: LessonEditor multi-select concept picker
**File**: `packages/ui/src/components/lesson-editor.tsx` (rewrite the
concept field block, lines 107-142) + module CSS
**File**: `packages/ui/src/components/concept-picker.tsx` (new)
**File**: `packages/ui/src/components/concept-picker.module.css` (new)
**Story**: `epic-editorial-polish-pass-concept-name-surfacing-picker`

```typescript
// concept-picker.tsx
export interface ConceptPickerOption {
  id: string;
  name: string;
  aliases?: ReadonlyArray<string>;
}

export interface ConceptPickerProps {
  selectedIds: ReadonlyArray<string>;
  options: ReadonlyArray<ConceptPickerOption>;
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Editorial multi-select picker for concepts.
 *
 * - Search input filters `options` by name OR any alias (case-insensitive
 *   substring; aliases are nice-to-have, not load-bearing).
 * - Selected items render as chips above the input. Each chip is
 *   `{name} ✕` with the raw id as a `title=` tooltip.
 * - Dropdown opens on focus; arrow keys + Enter to select; Esc closes.
 * - Stores IDs only; consumer maps to names via the option list.
 */
export function ConceptPicker(props: ConceptPickerProps): JSX.Element;
```

**Implementation Notes**:
- Built in-house, ~60-100 LoC. No new package dependency.
- Search match: `option.name.toLowerCase().includes(q)` OR
  `option.aliases?.some(a => a.toLowerCase().includes(q))`.
- Already-selected options are visually de-emphasized in the
  dropdown (greyed + `aria-disabled`) and skipped on Enter.
- Click outside or Esc closes the dropdown.
- A11y: `role="combobox"` on the input, `role="listbox"` on the
  dropdown, `role="option"` per item, `aria-activedescendant` for
  keyboard nav, chips are `<button>` with `aria-label="Remove {name}"`.
- LessonEditor passes `selectedIds={parsedConceptIds}`,
  `options={availableConcepts}` (which already has `{id, name}`
  shape — extend `course-tab.tsx` to also pass `aliases` from the
  loaded concepts).
- Replace `conceptIdsText` state and the `<textarea>` block with
  `selectedConceptIds: string[]` state and `<ConceptPicker>`.
- `course-tab.tsx`: extend the `concepts` state from
  `Array<{id; name}>` to `Array<{id; name; aliases: string[]}>` and
  forward through to `<LessonEditor availableConcepts={...} />`.
- Update `lesson-editor.test.tsx` to drive the picker (`getByRole
  "combobox"`, type, select option, assert `updateLesson` patch
  contains the right `conceptIds`).

**Acceptance Criteria**:
- [ ] No textarea or CSV parsing in `LessonEditor`.
- [ ] Typing in the picker filters by name and alias.
- [ ] Selecting an option adds an id to the selection and a chip
  appears above the input.
- [ ] Clicking the chip's ✕ removes the id from the selection.
- [ ] Saving submits `conceptIds: ConceptId[]` matching the chip
  order.
- [ ] Keyboard nav: arrow up/down moves highlight, Enter selects,
  Esc closes, Tab moves focus out without selecting.
- [ ] Already-selected options are visibly de-emphasized in the
  dropdown and not re-selectable.
- [ ] `lesson-editor.test.tsx` updated; concept-picker has its own
  unit test file with the above behaviors.

---

### Unit 4: Gates reading view + inline expand
**File**: `packages/ui/src/components/gates-reading-view.tsx` (new)
**File**: `packages/ui/src/components/gates-reading-view.module.css` (new)
**File**: `packages/ui/src/routes/configure/gates-tab.tsx` (layout
restructure — graph becomes overview, reading view becomes primary
content area)
**File**: `packages/ui/src/routes/configure/gates-tab.module.css`
**Story**: `epic-editorial-polish-pass-concept-name-surfacing-gates-reading-view`

```typescript
// gates-reading-view.tsx
export interface GatesReadingViewProps {
  lessons: ReadonlyArray<Lesson>;
  gateViews: ReadonlyArray<GateView>;
  gates: ReadonlyArray<Gate>;
  /** Resolve a concept id to its display row. */
  getConcept: (id: string) => { name: string; description: string } | null;
  /** Currently selected gate (for inspector pairing). */
  selectedGateId: GateId | null;
  /** Click on a gate row → opens the inspector. */
  onSelectGate: (gate: Gate) => void;
}

/**
 * Vertical lessons-and-gates reading view that sits alongside the
 * React Flow graph in the gates tab. Each lesson is a row containing
 * the lesson title and a wrapped chip grid of its concepts (name +
 * muted id). Between lessons, the gate guarding the next lesson
 * renders as a collapsible row with state, criteria, and an inline
 * expand chevron that reveals the full concept cards.
 */
export function GatesReadingView(props: GatesReadingViewProps): JSX.Element;
```

**Layout shape**:
```
┌──────────────────────────────────────────────────┐
│ Lesson 1: Introduction to Variables               │
│   [chip: Variable | var-x-1] [chip: Constant | …] │
│   [chip: Expression | expr-y-2]                   │
├──────────────────────────────────────────────────┤
│ ▸ Gate 1 → Mastery ≥ 70% on 3 concepts  [Locked]  │
├──────────────────────────────────────────────────┤
│ Lesson 2: Linear Equations                        │
│   [chip: Slope] [chip: Intercept] …               │
└──────────────────────────────────────────────────┘
```

When the gate chevron is expanded:
```
┌──────────────────────────────────────────────────┐
│ ▾ Gate 1 → Mastery ≥ 70% on 3 concepts  [Locked]  │
│   Required concepts:                              │
│   ╭─ Variable ─────────────╮ ╭─ Constant ───────╮ │
│   │ id: var-x-1            │ │ id: const-k-1    │ │
│   │ A named placeholder…   │ │ A fixed value…   │ │
│   ╰────────────────────────╯ ╰──────────────────╯ │
└──────────────────────────────────────────────────┘
```

**Implementation Notes**:
- Layout in `gates-tab.tsx`: chat pane (left) is unchanged. The right
  pane splits vertically: a slim React Flow graph (top, fixed
  ~40% height, kept for the "see the whole structure" overview) and
  the reading view (bottom, scrollable, primary reading surface).
  Inspector slides in over the reading view when a gate is selected
  (same `GateInspector` component).
- Chips wrap (`flex-wrap`) so all concepts fit without horizontal
  scroll at the default panel width — the hard requirement is met
  structurally by wrap, not by truncation.
- Gate row expanded state: local `useState<Set<GateId>>` of expanded
  ids. Toggle via chevron button. No persistence (per-session UI
  state is fine here).
- `getConcept` is provided by `gates-tab.tsx` from
  `useConceptNames(selectedCourseId)` — same lookup powering the
  graph.
- For mastery-threshold gates: the expanded view lists the concepts
  named in `gate.successCriteria.conceptIds`. For other criteria
  kinds, it shows the formatted criteria text and skips the concept
  list.
- Gate inspector `prerequisites` list (currently rendering raw IDs
  at `gate-inspector.tsx:156`) gets the same fix in this story —
  pass `getConcept` down and render names.
- Unit tests: render with fixture lessons + gates + a stub
  `getConcept`; assert that concept names render in chips, that the
  expand chevron toggles, and that clicking a gate row calls
  `onSelectGate`.

**Acceptance Criteria**:
- [ ] Concepts in each lesson display as wrapped chips with the
  concept name primary and the id secondary/muted.
- [ ] No horizontal scrollbar appears at the default configurator
  panel width with up to 12 concepts per lesson.
- [ ] Each gate row shows its `summaryText` and a state badge.
- [ ] Clicking the chevron on a gate row expands it inline to show
  the full concept cards (name + id + first sentence of
  description); clicking again collapses.
- [ ] Clicking the gate row body (not the chevron) opens the
  `GateInspector` for that gate.
- [ ] The existing React Flow graph remains visible above the
  reading view as an overview; clicking a node still opens its
  inspector.
- [ ] `GateInspector.prerequisites` list renders names, not raw
  ids, with the id as muted secondary text.
- [ ] Unit-tested rendering, chevron toggle, and `onSelectGate`
  callback.

---

## Implementation Order

1. **Unit 1** — `useConceptNames` hook (no deps; foundation).
2. **Unit 2** — ConceptNode + gates-tab buildGraph wiring (depends
   on Unit 1).
3. **Unit 3** — LessonEditor picker (depends on Unit 1 indirectly via
   `course-tab.tsx` already loading concepts; the hook itself isn't
   used here because the picker takes `options` directly — but the
   hook lands first to set the pattern).
4. **Unit 4** — Gates reading view + inline expand + inspector
   prereq-name fix (depends on Unit 1 and Unit 2).

Units 2 and 3 can run in parallel after Unit 1 lands; Unit 4
follows Unit 2 because it shares the gates-tab layout file.

## Testing

### Unit tests

- **`use-concept-names.test.ts`** (Unit 1): mock `client.artifacts.concepts`,
  drive through `renderHook`, assert lookup behavior, fallback for
  unknown ids, refetch on courseId change, undefined-courseId
  short-circuit.
- **`concept-node.test.tsx`** (Unit 2 — extend existing): add cases
  for the new `conceptId` field rendering, the muted styling
  presence, the `title` tooltip.
- **`concept-picker.test.tsx`** (Unit 3, new): search filtering by
  name and alias, keyboard nav, selection, chip removal, already-
  selected de-emphasis, click-outside close.
- **`lesson-editor.test.tsx`** (Unit 3 — extend existing): replace
  textarea-driven tests with picker-driven tests; same save / delete
  assertions.
- **`gates-reading-view.test.tsx`** (Unit 4, new): render with
  fixture data, assert chip layout, chevron expand/collapse,
  `onSelectGate` callback. `gate-inspector.test.tsx` doesn't exist
  yet; if added in Unit 4 it can be minimal — just the prereq-name
  rendering case.

### Integration

The four units integrate at `gates-tab.tsx` (hook → buildGraph →
reading view → inspector) and at `course-tab.tsx` (hook-shape
informs the picker's `options` plumbing). A `gates-tab.test.tsx`
isn't in scope here unless we discover a regression; the
existing manual smoke test (open Configure → Gates with a seeded
course) is the integration check.

### Test data

Use the existing `makeFakeClient` helper. Add a `makeConceptRow`
factory in `tests/helpers/concept-fixtures.ts` (new) returning
`{id, graphId, name, description, aliases, standardsTags}` — used
by all three new test files.

## Risks

- **Risk: course-tab.tsx already passes `availableConcepts` shape to
  LessonEditor — the picker introduces a new shape.** Mitigation: the
  picker's `ConceptPickerOption` is a superset of the current
  `{id; name}`; widening `availableConcepts` to include `aliases?`
  is additive and `course-tab.tsx` already loads aliases from
  `getCourseSummary`. No breakage.
- **Risk: React Flow's `useMemo` for `buildGraph` now depends on a
  function reference (`getName`).** Mitigation: `useConceptNames`
  memoizes `getName` against the concepts array identity so it
  re-creates only when concepts change, which is the correct trigger
  for re-laying out the graph.
- **Risk: reading view + graph + inspector all in the right pane
  may feel cramped.** Mitigation: the graph block is capped at ~40%
  height and is the *overview*, not the primary reading surface; the
  inspector slides in over the reading view (the existing behavior
  with the React Flow canvas); resizable-panels (sister feature in
  the epic) will eventually let authors give more room to one or the
  other.
- **Risk: aliases may be empty for canonical-pack concepts.**
  Mitigation: alias search is additive — name search alone still
  works. Aliases are nice-to-have. No regression if aliases is `[]`.

## Pre-mortem fallback

If the reading view turns out to feel too parallel-redundant with
the graph, the fallback is to make the graph collapsible (a
`<details>` element wrapper) so authors can hide it entirely and
work in the reading view alone. This is a one-CSS-rule change in a
follow-up if it surfaces in review.
