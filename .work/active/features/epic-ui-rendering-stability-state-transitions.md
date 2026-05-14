---
id: epic-ui-rendering-stability-state-transitions
kind: feature
stage: done
tags: [ui, bug]
parent: epic-ui-rendering-stability
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# State transitions — question-card retirement and sub-agents panel collapse

## Brief

Two bugs both land on "the component is showing the wrong final state."
The inline quick-check question card remains visible after the student
submits an answer, instead of retiring (collapse to a compact summary
row or disappear). The expected resolved-state event — likely a
`gradeQuestion` tool result or an episodic write of kind
`question-answered` — isn't reaching the card's state machine, or the
machine doesn't have an answered branch. Separately, the sub-agents
panel doesn't collapse the layout when toggled hidden: the panel's
allocated vertical space stays reserved. Either the flex/grid sizing
rule is keyed on mount instead of visibility, or the toggle is
`display:none`-ing without telling the parent container to redistribute
the space.

This feature bundles both because they share the diagnostic shape —
identify the missing or incorrect terminal state, decide whether the
fix is in the component's local state machine, in the parent's layout
contract, or in the dispatch path that should be sending the
state-change event — and because both are small (1–2 implementation
units each) but worth one consolidated design pass on "what does
'finished / hidden' actually mean for these surfaces."

## Epic context

- Parent epic: `epic-ui-rendering-stability`
- Position in epic: paired with `…-loop-flickers`. Independent — runs
  in parallel.

## Scope absorbed from backlog

- `bug-question-card-persists-after-answer` — quick-check card stays
  visible after answer submit; needs a resolved-state transition.
- `bug-sub-agents-panel-collapse` — panel's vertical space doesn't
  collapse when hidden; likely a flex/grid rule keyed on mount, or a
  `display:none`-vs-unmount mismatch.

## Foundation references

- `docs/ARCHITECTURE.md` — quick-check / assessment flow, sub-agent
  transparency contract
- `CLAUDE.md` — patterns `tab-body-isolation` (display:none vs unmount
  idiom), `subscriber-fanout-stream` (sub-agent panel data source)

## Anchors (current implementation)

- Quick-check card —
  `packages/ui/src/components/QuestionCard.tsx` (or equivalent;
  search for the inline assessment card)
- Question card grade / answered event source — the tool that grades
  the question is in `packages/tools/src/runtime/`; episodic events
  flow through the engine session loop
- Sub-agents panel —
  `packages/ui/src/components/SubAgentBlock.tsx` (or similar) plus the
  parent container that allocates its vertical space (likely a chat
  workspace layout component)
- Sub-agent toggle —
  search for `subAgentsVisible` or `showSubAgents` state in the chat
  workspace
- Tab-body-isolation pattern reference for the display:none vs.
  unmount design call

## Pre-design decisions (2026-05-14)

- **Question card final state**: collapse to compact summary row.
  After answer submit, the card shrinks to a one-line summary —
  question stem + answer + correct/incorrect badge. Matches the
  `epic-tutor-session-feel-tool-call-thread-persistence` shape so
  card retirement looks consistent with tool-call entries. Still
  readable when the student scrolls back.
- **Sub-agents panel hide mechanism**: unmount, not `display:none`.
  When the panel is toggled hidden, it removes from the tree
  entirely so parent flex/grid layout collapses naturally. Live
  `SubAgentRegistry` data re-renders fresh on re-show because the
  registry is the SSOT (subscriber-fanout-stream); no local React
  state to preserve. Diverges from the `tab-body-isolation` pattern
  intentionally — tabs need state preserved, this panel does not.

## Design decisions

- **Correctness signal source for the collapsed summary**: derive
  client-side from the `AssignmentItem` already passed into the card.
  For `single-choice`, compare `answer.selectedIndex ===
  item.correctOptionIndex` (treat `-1` sentinel as "ungraded — no
  badge"). For `multi-select`, exact-set match against
  `item.correctOptionIndices`. For `short-answer`, run the same
  normalize-and-match the server uses (`exact` / `substring` /
  `normalized`) against `item.acceptedAnswers`. For `matching`,
  exact-set match of `(leftId, rightId)` pairs against
  `item.correctPairs`. For `structured-question` there is no
  ground-truth field on the item — render the collapsed row WITHOUT
  a badge (answer-only summary). Rationale: the tool handler already
  knows the answer key and we want the badge to flip the instant the
  student submits, before any server round-trip. No new IPC, no
  echo-back of `correct` from the resolved event.
- **Where the resolved-state trigger lives**: locally, in the card's
  existing `setSubmitted(true)` branch inside `handleSubmit`. The
  collapsed view is gated on `submitted === true`, so the transition
  fires the moment `onResolve` resolves — same instant the existing
  "· submitted" label appears. No engine-event subscription needed.
  The server-side `resolved` `QuickCheckEvent` already arrives at the
  bridge and could also be used, but the local submit-handler is
  earlier and simpler — keep both consistent: card local state =
  visual collapse; bridge `resolved` = source of truth for late
  remounts. (A re-mount after server-side resolve would re-load
  `pending: [{ resolved: true }]` from the bridge — the card must
  initialise `submitted` from a `resolved` prop so re-mounted cards
  render collapsed. This is unit 1a, not a separate story — it's
  hygiene on the same component.)
- **Where the "sub-agents panel" lives**: ambiguous in the feature
  brief — there are two surfaces. (a) `<SubAgentBlock>` in
  `chat-tab-body.tsx` (the inline collapsible step list inside the
  chat thread). (b) `<SubAgentPanel>` in `bootstrap-tab-body.tsx`
  (the right-pane transcript panel in bootstrap mode). The bug
  description ("collapse vertical space when hidden") fits (b) —
  `SubAgentPanel` always renders an outer `<div className={panel}>`
  with toggle button plus 1rem top margin + border-top + 0.5rem
  padding-top, which occupies vertical space in the bootstrap right
  pane even when the inner transcript is hidden. (a) does not
  toggle "hidden" — it expands to show steps and is part of the
  chat thread, so its space is always "occupied." Scope this
  feature to fixing (b); leave (a) alone.
- **What "unmount" means concretely**: change the toggle UX so the
  panel is mounted only when the user wants the transcript visible.
  Render only the toggle button when collapsed, and render the
  full panel chrome (border-top, padding, header, transcript) only
  when expanded — i.e., move the outer `<div className={panel}>`
  inside the `visible` branch. The toggle button must remain
  always-visible (when `parentCallId !== null`) so the user can
  re-open. This is the minimal "unmount" delta: when collapsed,
  vertical footprint is exactly one button-line; when expanded,
  the panel fills its content height.

## Architectural choice

Two independent bugs, two independent units. Both are local-state
fixes inside existing UI components — no service-layer, IPC, or
schema work. Considered and rejected:

1. **Centralise card terminal state via a new `QuickCheckResult`
   service event** (server computes correctness and pushes via a
   new `resolved-with-grade` event). Optimises for a future where
   correctness criteria change server-side. Rejected: doubles the
   IPC surface for a UI hygiene fix, and the answer key already
   lives on the item the card already has.
2. **Lift sub-agent panel visibility into a `useSubAgentPanel()`
   hook with persistence** (remember user's hide/show preference
   across sessions). Optimises for repeat users who always hide
   the panel. Rejected: scope creep. The bug is "the layout
   doesn't collapse," not "preference doesn't persist." A user
   story for persistence can be filed separately if the muscle
   memory matters.

Chosen: minimal local fixes, one unit per bug, one child story per
unit. Pair them in the feature because they share the diagnostic
shape (terminal-state hygiene) and both are 1-unit jobs.

## Implementation Units

### Unit 1: Question-card resolved-state transition
**File**: `packages/ui/src/components/quick-check-card.tsx` (and `.module.css`)
**Story**: `epic-ui-rendering-stability-state-transitions-question-card-collapse`

Replace the entire `submitted` rendering branch with a compact
summary row matching `<ToolEntry>`'s settled-state shape. The
expanded (pre-submit) and collapsed (post-submit) views are two
distinct render branches inside the same component.

```tsx
// New helper, colocated in quick-check-card.tsx
function gradeAnswer(item: AssignmentItem, answer: QuickCheckAnswer): boolean | null {
  // Returns true (correct) / false (incorrect) / null (ungraded — no badge).
  // Mirrors the per-kind grading the server-side handler does, see
  // packages/tools/src/quick-check/{single-choice,multi-select,short-answer,matching}.ts
  switch (item.kind) {
    case "single-choice":
      if (item.correctOptionIndex < 0) return null;
      if (answer.kind !== "single-choice") return null;
      return answer.selectedIndex === item.correctOptionIndex;
    case "multi-select":
      if (item.correctOptionIndices.length === 0) return null;
      if (answer.kind !== "multi-select") return null;
      return setsEqual(answer.selectedIndices, item.correctOptionIndices);
    case "short-answer":
      if (item.acceptedAnswers.length === 0) return null;
      if (answer.kind !== "short-answer") return null;
      return matchShortAnswer(answer.text, item.acceptedAnswers, item.acceptedAnswerMatch);
    case "matching":
      if (item.correctPairs.length === 0) return null;
      if (answer.kind !== "matching") return null;
      return pairSetsEqual(answer.pairs, item.correctPairs);
    default:
      return null;
  }
}

// Card render — collapsed branch
{submitted ? (
  <button
    type="button"
    className={styles.collapsedSummary}
    onClick={() => setExpanded((v) => !v)}
    aria-expanded={expanded}
  >
    <span className={styles.disclosure} aria-hidden="true">{expanded ? "▾" : "▸"}</span>
    <span className={styles.collapsedStem}>{stemOf(item)}</span>
    <span className={styles.collapsedAnswer}>· {summariseAnswer(item, lastAnswer)}</span>
    {correct === true  && <span className={styles.badgeCorrect}>✓</span>}
    {correct === false && <span className={styles.badgeIncorrect}>✗</span>}
    {/* correct === null → no badge (formative probe with no answer key) */}
  </button>
) : (
  /* existing expanded form: prompt + body + reasoning + submit */
)}
{submitted && expanded && (
  <div className={styles.collapsedDetails}>
    {/* the full body subcomponent in disabled mode + reasoning if present */}
  </div>
)}
```

Local state additions:
- `lastAnswer: QuickCheckAnswer | null` — captured at submit so the
  collapsed view can render it. Stored once, never re-computed.
- `correct: boolean | null` — captured at submit by calling
  `gradeAnswer(item, lastAnswer)` once. Memoised by storage.
- `expanded: boolean` — disclosure state for the collapsed row.

Hygiene fix on the same component (per design decisions):
- Add optional prop `initialResolved?: boolean` and optional
  `initialAnswer?: QuickCheckAnswer`. When `initialResolved === true`,
  initialise `submitted` and `lastAnswer` from props so a card that
  re-mounts after a server-side resolved event renders collapsed
  immediately. Callsite in `chat-tab-body.tsx` passes
  `check.resolved` and would need the bridge to surface the answer.
  (Optional — fine to ship without if the bridge doesn't track the
  answer; current bridge does not. Story decides: defer if extra
  bridge work is needed, just document the gap.)

**Implementation Notes**:
- The `setsEqual` / `pairSetsEqual` helpers exist in the server-side
  tools (`packages/tools/src/quick-check/multi-select.ts`,
  `matching.ts`) but are not exported. Copy the 2-line bodies locally
  in `quick-check-card.tsx`; do NOT introduce a new shared package
  dependency for two trivial helpers (Fail-Fast + SSOT trade-off:
  server is SSOT for grading semantics, so if logic drifts we have
  a divergence risk — accept it for v1 and file a follow-up only if
  drift surfaces).
- `stemOf(item)` returns `item.prompt` for all kinds except
  `structured-question`, which renders `item.questions[0]!.prompt`
  (truncated to ~80 chars) — the structured shape has multiple
  prompts; the summary keeps the first as the "stem".
- `summariseAnswer(item, answer)` produces a 1-line human-readable
  rendering: `"A"` for single-choice (option label, not index),
  `"A, C"` for multi-select, the user's text for short-answer,
  `"2 pairs"` for matching, `"submitted"` for structured-question
  fallback.
- CSS: add `.collapsedSummary`, `.collapsedStem`, `.collapsedAnswer`,
  `.badgeCorrect`, `.badgeIncorrect`, `.collapsedDetails`,
  `.disclosure` to `quick-check-card.module.css`. Match the visual
  vocabulary of `tool-entry.module.css` (`.settled`, `.summary`,
  `.disclosure`, `.text`). Use `composes: editorial from global;`
  on the stem like other text in this surface. Badge colors:
  `var(--color-success)` / `var(--color-warning)` with fallbacks.
- Keep the existing `.card.submitted` class — it now applies the
  visual collapse (smaller padding, reduced gap), so the whole
  component still goes through a single root element.
- `<StructuredQuestionCard>` (sibling component) gets the same
  treatment in a follow-on if the user requests it — but the
  feature pre-design only names "the question card." `<QuickCheckCard>`
  handles the four quick-check tools; that's the bug's locus.
  Structured-question collapse is a known-deferred nit.

**Acceptance Criteria**:
- [ ] After submit, the card's expanded body (prompt + options +
  submit button) is replaced by a one-line summary row containing
  the stem, the student's answer, and a correct/incorrect badge
  (or no badge for ungraded items).
- [ ] The collapsed row is a `<button>` with `aria-expanded` and
  clicking it toggles a `details` block that re-renders the full
  body in read-only mode.
- [ ] For `single-choice` with `correctOptionIndex === -1` (the
  formative-probe sentinel), no badge is rendered.
- [ ] For `structured-question`, the collapsed row renders without
  a badge (no ground truth available).
- [ ] Existing `QuickCheckCard` tests still pass:
  - "renders the item prompt" (passes — prompt remains visible
    expanded; test runs before submit)
  - "locks inputs after submission" — UPDATE: the test currently
    asserts `screen.getByText(/submitted/i)`. After the change,
    the collapsed row shows the answer summary; assert on the
    presence of the badge or stem instead, and that the radios
    are no longer in the document (they've been removed by the
    branch swap). One test edit.
- [ ] New tests:
  - Correct answer → `✓` badge present, `✗` not present.
  - Incorrect answer → `✗` badge present, `✓` not present.
  - Ungraded (correctOptionIndex === -1) → neither badge present.
  - Click collapsed row toggles expanded details (read-only body).
  - Multi-select set equality (e.g. `[0, 2] === [2, 0]` → ✓).
  - Short-answer with `acceptedAnswerMatch === "normalized"`
    matches case-insensitively after trim.

---

### Unit 2: Sub-agents panel unmount on hide
**File**: `packages/ui/src/components/sub-agent-panel.tsx` (and `.module.css`)
**Story**: `epic-ui-rendering-stability-state-transitions-sub-agent-panel-unmount`

Move the outer panel chrome inside the `visible` branch so the
collapsed footprint is just the toggle button. The parent
`bootstrap-tab-body`'s `outlinePane` is a normal flex column; with
the panel chrome gone, the flow collapses naturally.

```tsx
export function SubAgentPanel({ parentCallId }: SubAgentPanelProps): JSX.Element | null {
  const [visible, setVisible] = useState(false);

  if (parentCallId === null) return null;

  // Collapsed: render only the toggle button. No outer .panel div,
  // no top margin, no border-top, no padding. Vertical footprint =
  // one button-line.
  if (!visible) {
    return (
      <button
        type="button"
        className={styles.toggleCollapsed}
        onClick={() => setVisible(true)}
        aria-expanded={false}
      >
        show sub-agent transcript
      </button>
    );
  }

  // Expanded: full panel chrome + transcript.
  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setVisible(false)}
        aria-expanded={true}
      >
        hide sub-agent transcript
      </button>
      <SubAgentTranscript parentCallId={parentCallId} />
    </div>
  );
}
```

**Implementation Notes**:
- The `<SubAgentTranscript>` inner component already subscribes via
  `useSubAgent(parentCallId)` and is only mounted when visible. The
  `subscriber-fanout-stream` pattern means re-mount triggers a fresh
  `snapshot` event, so live state recovers on re-show without any
  cross-mount caching. This is the exact reason the pre-design
  picked "unmount, not display:none" — the SSOT is `SubAgentRegistry`
  in core; the UI is a pure projection.
- CSS: add `.toggleCollapsed` — same visual as `.toggle` (muted
  small text, editorial) but with NO `border-top`, NO `margin-top`,
  NO `padding-top`. Sits flush in the bootstrap right-pane flow.
- No change to `bootstrap-tab-body.tsx` callsite. The panel still
  accepts the same `parentCallId` prop and the two return shapes
  (`null` and `JSX.Element`) are unchanged from the consumer's
  perspective.
- The existing `.panel` class can be left as-is (now used only in
  the expanded branch) — keep the visual treatment consistent for
  when the transcript IS open.

**Acceptance Criteria**:
- [ ] When `parentCallId === null`, the component returns null
  (unchanged).
- [ ] When `parentCallId` is set and `visible === false`, the
  rendered output is a single `<button>` with text "show sub-agent
  transcript" and `aria-expanded={false}`. No surrounding `<div>`,
  no border, no top margin.
- [ ] When `visible === true`, the full panel chrome and transcript
  are rendered, with a "hide sub-agent transcript" toggle and
  `aria-expanded={true}`.
- [ ] Toggle round-trip preserves the user's most recent show/hide
  intent across a single component lifetime (state local; this is
  not a persisted preference — see design decisions).
- [ ] New test for `sub-agent-panel.tsx`:
  - Renders null when `parentCallId === null`.
  - Renders only the toggle (no `.panel` div) when collapsed.
  - Renders the transcript subscription target after clicking show.
  - Snapshot: collapsed DOM has zero descendants other than the
    `<button>` and its text node (proves "vertical footprint =
    one button-line").

---

## Implementation Order

The two units are fully independent — different files, no shared
helpers, no dependency arrow between them. The wave-of-one
implementor or two parallel agents both work. The orchestrator's
default fan-out (up to 3 parallel Sonnet agents) covers this.

1. `epic-ui-rendering-stability-state-transitions-question-card-collapse`
   (Unit 1) — no dependencies
2. `epic-ui-rendering-stability-state-transitions-sub-agent-panel-unmount`
   (Unit 2) — no dependencies

After both stories land at `stage: review`, the parent feature
auto-advances to `stage: review`.

## Testing

### Unit 1 tests
**File**: `packages/ui/src/__tests__/quick-check-card.test.tsx` (edit + extend)

- Keep the four pre-submit tests (prompt rendering, submit button
  presence, single-choice answer dispatch, validation gating).
- Edit "locks inputs after submission" to assert on the collapsed
  row's presence (stem + answer + badge) and the absence of the
  pre-submit form controls.
- Add five new tests for the collapsed view, listed in Unit 1
  acceptance criteria.

### Unit 2 tests
**File**: `packages/ui/src/components/__tests__/sub-agent-panel.test.tsx` (NEW)

- Mirror `sub-agent-block.test.tsx`'s shape — mock `useSubAgent` via
  `vi.mock("../../hooks/use-sub-agent.js", () => ({ useSubAgent:
  vi.fn() }))`.
- Three rendering tests + one snapshot (per Unit 2 acceptance).

## Risks

- **Local grading divergence** (low). The card grades client-side;
  the server-side tool handler grades independently. If grading
  semantics change (e.g., `acceptedAnswerMatch` gets a new mode),
  the card silently shows the wrong badge. Mitigation: file a
  follow-up to extract a shared `gradeQuickCheckAnswer(item,
  answer)` helper into `@praxis/tools/grading` (or similar) once
  a real divergence is observed. The two trivial helpers
  (`setsEqual`, `pairSetsEqual`) are pure and unlikely to drift.
- **Re-mount lost answer** (low, narrow). If a `QuickCheckCard`
  re-mounts (rare — tabs use `display:none`, so this only happens
  on tab unmount, which is full session teardown) after the
  student already submitted, the card initialises with
  `submitted === false` and a fresh `useState("")` for `response`.
  The bridge marks the check `resolved`, so the card SHOULD render
  collapsed but won't. Mitigation: the optional `initialResolved`
  prop in Unit 1 hygiene fix addresses this — but it requires the
  bridge to track the answer (not just the resolved flag). Deferred
  unless the gap surfaces; documented in Unit 1.
- **CSS regression risk** (low). The collapsed row visual must
  match the `tool-entry` shape closely enough that students don't
  perceive an inconsistent surface. Pre-merge: side-by-side visual
  diff in the running app, not just unit tests. Reviewer call.
- **Pyodide / native tests unaffected** — both units are pure
  React component changes; no DB, no engine, no Pyodide. Skip
  `PRAXIS_RUN_SLOW_TESTS` gating concerns.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Both children at done. Quick-check-card collapses to summary row with correct/incorrect badge; sub-agent panel unmounts chrome when hidden. Children-complete.
