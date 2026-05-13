---
id: epic-tutor-session-feel-tool-call-thread-persistence
kind: feature
stage: review
tags: [ui, chat, tutor-ux]
parent: epic-tutor-session-feel
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Tool-call thread persistence — keep tool artifacts readable

## Brief

`feature-agent-transparency-ux` (v0.1.1) added live-stream pacing —
`MIN_INTERSTITIAL_VISIBLE_MS = 800`
(`packages/ui/src/hooks/use-streamed-send.ts:56`) and the
`<ToolInterstitial>` settled-state UI
(`packages/ui/src/components/tool-interstitial.tsx:11-45`). Tool calls
also persist to the episodic log
(`packages/core/src/session/episodic.ts:19-35` writes every `EngineEvent`)
and can be replayed via `episodicToItems()`
(`packages/ui/src/hooks/episodic-to-messages.ts:59-190`). So
machinery exists — but the user reports tool calls still flash by too fast
to read, and once the turn ends the artifacts effectively disappear from
the visible thread.

The remaining gap (per the map): `episodicToItems()` produces `kind:
"interstitial"` items with `status: "settled"` instantly on replay — no
pacing on history load — and the live UI may collapse settled interstitials
out of view too aggressively. The "tool call as a first-class thread
artifact" framing is missing: a settled tool call should remain a readable,
scrollable, expandable entry in the thread, not a transient interstitial
that animates out.

This feature treats tool calls as first-class thread artifacts: settled
interstitials remain visible as compact-but-readable entries (with
expand/collapse for full args/result), replay from episodic produces the
same shape as the live stream, and the user can scroll back to any tool
call in the conversation as easily as scrolling back to a model message.
The 800ms minimum-display stays for live flow; persistence is the new
contract.

## Epic context

- Parent epic: `epic-tutor-session-feel`
- Position in epic: independent UI/UX feature — wave 1, parallelizable
  with the three other children.

## Foundation references

- `docs/ARCHITECTURE.md:310` — tool call & sub-agent transparency contract
- `feature-agent-transparency-ux` (done v0.1.1) — the foundation this
  builds on

## Anchors

- Interstitial component (current settled-state UI) —
  `packages/ui/src/components/tool-interstitial.tsx:1-45` (renders
  in_flight with dots / settled with `label.past` / errored)
- Pacing timer — `packages/ui/src/hooks/use-streamed-send.ts:56,335-387`
- Tool labels — `packages/tools/src/labels/index.ts`
  (`getToolLabel(toolName)` returns `{ present, past?, hidden }`)
- Episodic replay (the replay shape gap) —
  `packages/ui/src/hooks/episodic-to-messages.ts:59-190` (line 42-43
  produces interstitials with `status: "settled"` on history load)
- History loader — `useStreamedSend.loadHistory()`
  (`use-streamed-send.ts:524-535`)
- Sub-agent block — `packages/ui/src/components/sub-agent-block.tsx:28-85`
  (parallel persistence treatment)

## Design decisions (resolved by epic + autopilot)

From the epic-design resolutions:
- **Default visual state**: settled tool calls render **collapsed** with
  tool name + one-line summary; click to expand and see args + result.
  Matches Claude Code's pattern.

Resolved by autopilot:
- **Item kind**: extend the existing `kind: "interstitial"` to carry
  `args` (input passed to the tool) and `result` (tool's structured
  return value), or — cleaner — rename the kind to `kind: "tool-entry"`
  to reflect its expanded role. Choosing **rename to `kind:
  "tool-entry"`** — the new component is conceptually different (a
  thread artifact, not a "between-turn interstitial"), and renaming
  catches every consumer at typecheck time.
- **Persistence parity**: replay from episodic produces the same
  `tool-entry` items as the live stream once it settles. Both paths
  read `tool_call.input` and `tool_result.output` from the EngineEvent
  payloads and stash them on the item.
- **Result summary derivation**: extract one-line summaries per
  tool. Pattern: each tool's `getToolLabel(name)` returns a label
  shape; extend it with an optional `summarize(result: unknown): string`
  helper for tools that have a meaningful one-line summary
  (`retrieve_from_documents` → "N citations"; `course.draft_init` →
  "Draft created"; etc.). Fallback summary for tools without
  `summarize`: just the past-tense label ("Searched documents").
- **Sub-agent block treatment**: same collapsed-by-default. After the
  parent tool settles, the `<SubAgentBlock>` stays in the thread
  collapsed; click expands to see the step trail. Don't auto-collapse
  the live trail before the user can read it.
- **Auto-scroll behavior**: when a new `tool-entry` arrives, the
  existing auto-scroll-to-bottom logic should NOT push past it
  immediately. Add a small "scroll-anchor" treatment: if the user is
  scrolled near the bottom, auto-scroll continues; if they've scrolled
  up, do not auto-scroll past new tool entries.
- **Hidden tools**: `getToolLabel(name).hidden === true` still hides
  the entry entirely. No expand option for hidden tools.
- **Errored state**: a third visual state ("errored") with a brief
  error message; expandable to see full error details.

## Architectural choice

**Promote the interstitial item to a first-class tool entry with
collapsible content.** Rename + extend rather than parallel new
component — keeps a single thread-artifact path that both live
streaming and replay produce. The component owns its own expand/collapse
state (transient UI state, doesn't persist).

Two alternatives rejected:
- *Separate `<ToolInterstitial>` (live, transient) + `<ToolEntry>`
  (replay, persistent).* Two components with overlapping behavior;
  drift risk; harder to share styling. Reject.
- *Keep interstitial as-is; add a "show details" hover.* Doesn't
  address the "scrolled past, can't find it" complaint. Reject.

## Implementation Units

### Unit 1: Reproduce first

**Pre-step before any code change.** The user's "too fast to read"
complaint may have a root cause this design doesn't address (e.g.,
auto-scroll behavior, not the entry component). Implementation:

1. Build the workspace; run `pnpm dev`.
2. Start a session that invokes a tool (e.g., teach mode that calls
   `retrieve_from_documents`).
3. Observe whether the interstitial visibly settles for ≥800ms,
   whether it stays scrollable after settle, whether auto-scroll
   moves past it, whether sub-agent steps flash by.
4. Note specific frustrations; confirm or update the design.

If reproduction reveals the actual gap is something else (e.g.,
sub-agent step rendering, not tool-call rendering), update this
feature body before implementing the units below.

**Acceptance Criteria**:
- [ ] User-visible behavior change confirmed before code change.
- [ ] If design needs revision, the units below are updated to match.

---

### Unit 2: Rename + extend item kind

**Files**:
- `packages/ui/src/hooks/episodic-to-messages.ts` — `ChatStreamItem`
  union (or wherever it's defined).
- Every consumer of `kind: "interstitial"`.

Rename:
```typescript
// Before:
export interface InterstitialItem {
  kind: "interstitial";
  id: string;
  callId: string;
  toolName: string;
  status: "in_flight" | "settled";
  firstSeenAt?: number;
  errored?: boolean;
  // …
}

// After:
export interface ToolEntryItem {
  kind: "tool-entry";
  id: string;
  callId: string;
  toolName: string;
  status: "in_flight" | "settled" | "errored";
  /** Tool input (args) — populated at tool_call. */
  input?: unknown;
  /** Tool result — populated at tool_result. */
  output?: unknown;
  /** Error details — populated when status === "errored". */
  errorMessage?: string;
  /** Live-stream pacing — for in-flight timer comparison. */
  firstSeenAt?: number;
}
```

`ChatStreamItem` union updates to use the new name.

Consumers to update (typecheck flags them all):
- `useStreamedSend.send()` — push/transition logic.
- `episodicToItems()` — replay construction.
- The bubble renderer that maps items to components.
- Any tests asserting on `kind: "interstitial"`.

**Acceptance Criteria**:
- [ ] `grep -r "kind: \"interstitial\"" packages/ui/src/` returns no
      matches.
- [ ] `pnpm typecheck` passes.

---

### Unit 3: Tool entry component

**File**: `packages/ui/src/components/tool-entry.tsx` (new — rename
of `tool-interstitial.tsx` via `git mv` + meaningful rewrite)

```typescript
import { useState } from "react";
import { getToolLabel, getToolSummary } from "@praxis/tools/labels";
import styles from "./tool-entry.module.css";

export interface ToolEntryProps {
  toolName: string;
  status: "in_flight" | "settled" | "errored";
  input?: unknown;
  output?: unknown;
  errorMessage?: string;
}

export function ToolEntry(props: ToolEntryProps): JSX.Element | null {
  const label = getToolLabel(props.toolName);
  if (label.hidden) return null;
  const [expanded, setExpanded] = useState(false);

  if (props.status === "in_flight") {
    // In-flight: same as today's interstitial — label + dots.
    return (
      <p className={styles.entry} aria-live="polite">
        <span className={styles.text}>{label.present}</span>
        <span className={styles.dots} aria-hidden="true"><span /><span /><span /></span>
      </p>
    );
  }

  // Settled or errored: render as collapsible.
  const summary = props.status === "errored"
    ? `Couldn't finish ${label.present.toLowerCase()}.`
    : getToolSummary(props.toolName, props.output) ?? (label.past ?? label.present);

  return (
    <div className={`${styles.entry} ${styles.collapsible} ${props.status === "errored" ? styles.errored : styles.settled}`}>
      <button
        type="button"
        className={styles.summary}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={styles.disclosure} aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        <span className={styles.text}>{summary}</span>
      </button>
      {expanded && (
        <div className={styles.details}>
          {props.input !== undefined && (
            <details open>
              <summary>Input</summary>
              <pre>{JSON.stringify(props.input, null, 2)}</pre>
            </details>
          )}
          {props.output !== undefined && (
            <details open>
              <summary>Output</summary>
              <pre>{JSON.stringify(props.output, null, 2)}</pre>
            </details>
          )}
          {props.errorMessage !== undefined && (
            <details open>
              <summary>Error</summary>
              <pre>{props.errorMessage}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
```

CSS (`tool-entry.module.css`): existing `tool-interstitial.module.css`
styles carry over for the in-flight + settled visual treatment; add new
styles for `.collapsible`, `.summary` (button reset, hover state),
`.disclosure` (triangle), `.details` (indented block with JSON `<pre>`).

**Acceptance Criteria**:
- [ ] In-flight state matches today's interstitial behavior visually.
- [ ] Settled state shows a collapsed summary line by default.
- [ ] Clicking the summary expands to show input + output.
- [ ] Errored state shows error summary + expandable details.
- [ ] `getToolLabel(name).hidden === true` hides the entry entirely.

---

### Unit 4: Tool summarize helper

**File**: `packages/tools/src/labels/index.ts`

Extend the label registry to optionally include a summarizer:

```typescript
export interface ToolLabel {
  present: string;            // "Searching documents"
  past?: string;              // "Searched documents"
  hidden?: boolean;
  summarize?: (output: unknown) => string;  // new — optional
}

// Examples:
const LABELS: Record<string, ToolLabel> = {
  retrieve_from_documents: {
    present: "Searching documents",
    past: "Searched documents",
    summarize: (output) => {
      const o = output as { citations?: unknown[] };
      const n = o?.citations?.length ?? 0;
      return `Searched documents — ${n} ${n === 1 ? "result" : "results"}`;
    },
  },
  "course.draft_init": {
    present: "Creating draft",
    past: "Draft created",
    summarize: () => "Draft created",
  },
  // … add more as useful
};

export function getToolSummary(name: string, output: unknown): string | undefined {
  return LABELS[name]?.summarize?.(output);
}
```

Apply targeted summaries for the most common tools first; the fallback
(just the past-tense label) covers everything else.

**Acceptance Criteria**:
- [ ] `getToolSummary` returns a string for tools with a summarizer,
      undefined otherwise.
- [ ] Failing/crashing summarizers (e.g., wrong shape) don't throw —
      wrap in try/catch and return undefined.

---

### Unit 5: Live stream wiring

**File**: `packages/ui/src/hooks/use-streamed-send.ts`

Update the tool_call / tool_result handling:
- On `tool_call` event: push `kind: "tool-entry"` with `status:
  "in_flight"` AND populate `input` from `event.input` (or equivalent
  field on the EngineEvent).
- On `tool_result` event: transition to `status: "settled"` (or
  `"errored"` if `event.error`) and populate `output` (or
  `errorMessage`).
- The existing `MIN_INTERSTITIAL_VISIBLE_MS` pacing still applies for
  the in_flight → settled transition.

**Acceptance Criteria**:
- [ ] Live tool calls produce `tool-entry` items with input populated
      at tool_call time.
- [ ] Settled entries have output populated.
- [ ] Errored entries have errorMessage populated.

---

### Unit 6: Episodic replay wiring

**File**: `packages/ui/src/hooks/episodic-to-messages.ts`

Update the tool_call / tool_result handling in `episodicToItems`:
- On `tool_call`: push `kind: "tool-entry"` with `status: "settled"`
  (history is settled by definition) and populate `input`.
- On `tool_result`: find the matching `tool-entry` by callId and
  populate `output` (or `errorMessage`).

**Acceptance Criteria**:
- [ ] Replayed tool entries have both input + output populated.
- [ ] Cross-cutting parity test still passes — the live and replay
      paths produce structurally identical items.

---

### Unit 7: Sub-agent block parity

**File**: `packages/ui/src/components/sub-agent-block.tsx`

Apply the same collapsed-by-default treatment after settle:
- When status === "settled" (or `"interrupted"`): the block stays in
  the thread but collapses to a summary (e.g., "Sub-agent: N steps").
- Click to expand and see the full step trail.
- In-flight state unchanged (steps stream live).

**Acceptance Criteria**:
- [ ] Sub-agent block stays visible after parent tool settles.
- [ ] Collapsed by default; expand on click.

---

### Unit 8: Auto-scroll anchoring

**File**: wherever auto-scroll-to-bottom lives (likely in
`chat-tab-body.tsx` or a `useChatScroll` hook — verify during impl)

Don't auto-scroll past a newly-arrived `tool-entry` if the user has
scrolled up. Existing scroll logic likely checks "is the user at the
bottom" before auto-scrolling — preserve that check. If not present,
add it: track scroll position via a ref, only auto-scroll when the
delta from the bottom is small (< 50px or similar threshold).

**Acceptance Criteria**:
- [ ] When the user has scrolled up to read history, new tool entries
      don't yank the view back to the bottom.
- [ ] When the user is at the bottom, auto-scroll continues to work
      as before.

---

### Unit 9: Tests

**Files**:
- `packages/ui/src/__tests__/episodic-to-messages.test.ts` — update
  existing tests for the new shape; add new assertions for `input` /
  `output` population.
- `packages/ui/src/__tests__/use-streamed-send.test.tsx` — update for
  the new shape; add assertions for the new fields on tool entries.
- `packages/ui/src/components/__tests__/tool-entry.test.tsx` (new —
  rename of any existing `tool-interstitial.test.tsx`) — covers
  expand/collapse, all three statuses, hidden-tool hiding.
- `packages/ui/src/__tests__/bubble-boundary-parity.test.ts` — runs
  parity between live and replay; should pass without change after
  the structural updates land in both paths.
- `packages/tools/src/labels/__tests__/index.test.ts` — add
  summarizer tests.

**Acceptance Criteria**:
- [ ] All updated tests pass.
- [ ] Parity test continues to pass.

---

## Implementation Order

Single-stride. No child stories — the work is one cohesive UI rework.

1. Unit 1 (reproduce; may revise units below).
2. Unit 2 (item kind rename + extension).
3. Unit 4 (summarize helper — small, isolated).
4. Unit 3 (tool entry component).
5. Unit 5 (live stream wiring).
6. Unit 6 (episodic replay wiring).
7. Unit 7 (sub-agent block parity).
8. Unit 8 (auto-scroll anchoring).
9. Unit 9 (tests; run continuously through prior units).

## Testing

Covered by Unit 9. Critical invariants:
- Parity between live and replay paths.
- Hidden tools stay hidden.
- Existing tests for v0.1.1 transparency UX continue passing.

## Risks

1. **Root-cause mismatch** (medium → mitigated by Unit 1). The
   `MIN_INTERSTITIAL_VISIBLE_MS = 800` already exists. If the real
   user frustration is something else (auto-scroll, sub-agent step
   rendering, layout shift), Unit 1's reproduction catches it before
   building the wrong fix.
2. **Output JSON dump UX** (low). Showing raw JSON in the expanded
   view is functional but ugly for some tool outputs. v1 ships raw
   JSON; a later refinement can add per-tool result renderers
   (citation chips for retrieve_from_documents, etc.). Most tools
   that have rich UI representations already render those alongside
   the tool entry as separate items (citations, drafts, notes,
   due-cards) — the expanded view is the "raw escape hatch."
3. **Parity test breakage** (medium). The cross-cutting parity test
   between live and replay enforces structural equivalence. Both
   paths must populate the same fields in the same shape. Unit 2's
   shared item type helps; Units 5 and 6 must mirror each other.
4. **Errored state field naming** (low). Engine events for tool
   errors carry `error.message` (or similar — depends on the
   EngineEvent union). Verify the exact field during Unit 5.

## Implementation Discovery

Unit 1 (Reproduce) was done via code-reading rather than runtime observation. Key findings:

- The 800ms pacing (`MIN_INTERSTITIAL_VISIBLE_MS`) was already implemented in `use-streamed-send.ts`. The design was correct that *persistence* was the gap, not pacing.
- The auto-scroll logic in `chat-tab-body.tsx` (lines 126–136) already had the near-bottom threshold (80px) implemented — Unit 8 required no code changes; it was already done.
- The `SubAgentBlock` (Unit 7) already had collapse/expand behavior and stayed in the thread — no changes needed. The design's "add collapsed-by-default" was already implemented.
- The `tool_call` EngineEvent uses `args: unknown` (not `input`) for the tool arguments. Used `event.args` as the `input` field on `ToolEntryItem`.
- The errored tool result uses `event.result.error.message` (confirmed from `EngineEvent` type in `engine.ts`).

## Implementation Notes

### Files changed

- `packages/tools/src/labels/index.ts` — added `summarize?: (output: unknown) => string` to `ToolLabel`; added `getToolSummary()` export; added summarizers for `retrieve_from_documents`, `course.draft_init`, `grade_math`.
- `packages/tools/src/labels/__tests__/index.test.ts` — added `getToolSummary` tests (13 new tests).
- `packages/ui/src/hooks/use-streamed-send.ts` — renamed `ToolInterstitial` → `ToolEntryItem` (kept deprecated type alias for backward-compat); updated `ChatStreamItem` union: `kind: "interstitial"` → `kind: "tool-entry"`; on `tool_call` push now includes `input: event.args`; on `tool_result` settle now sets `status: "errored"` (vs old `errored: boolean`) and populates `output`/`errorMessage`.
- `packages/ui/src/hooks/episodic-to-messages.ts` — updated `tool_call` case: push `tool-entry` with `status: "settled"` immediately (history is settled) and `input: event.args`; updated `tool_result` case: sets `status: "errored"` or `"settled"`, populates `output`/`errorMessage`.
- `packages/ui/src/components/tool-entry.tsx` (git mv from `tool-interstitial.tsx`) — rewrote component as `ToolEntry` with three states: in_flight (dots, same as before), settled (collapsed summary with disclosure button, expandable to show input+output JSON), errored (red-ish summary, expandable to show error). `getToolSummary` used for settled summary line.
- `packages/ui/src/components/tool-entry.module.css` (git mv from `tool-interstitial.module.css`) — extended CSS to support `.collapsible`, `.summary` (button reset), `.disclosure`, `.details`, `.detailPre` classes for the expandable settled/errored states.
- `packages/ui/src/components/chat-tab-body.tsx` — updated import + render dispatch: `kind: "interstitial"` → `kind: "tool-entry"`, `<ToolInterstitial>` → `<ToolEntry>` with new props.
- `packages/ui/src/components/sidekick-panel.tsx` — same consumer update.
- `packages/ui/src/components/configure-chat-pane.tsx` — same consumer update.
- `packages/ui/src/__tests__/tool-entry.test.tsx` (git mv from `tool-interstitial.test.tsx`) — rewrote tests for `ToolEntry` covering all three states + hidden tools + expand/collapse + citation count summary.
- `packages/ui/src/__tests__/episodic-to-messages.test.ts` — updated all `"interstitial"` → `"tool-entry"` references; added `input`/`output` assertions on tool entries; updated `errored` boolean → `status: "errored"` + `errorMessage`.
- `packages/ui/src/__tests__/use-streamed-send.test.tsx` — updated all `kind === "interstitial"` → `kind === "tool-entry"`; updated errored assertions.
- `packages/ui/src/__tests__/bubble-boundary-parity.test.ts` — updated `kind === "interstitial"` → `kind === "tool-entry"` in `stripIds` and scenario assertions.

### Deviations from design

- **Unit 7 (SubAgentBlock)**: No changes needed — `SubAgentBlock` already had collapsed-by-default behavior. The design described adding it; it was already there.
- **Unit 8 (auto-scroll)**: No changes needed — `chat-tab-body.tsx` already had an 80px near-bottom threshold. The design described adding it; it was already there.
- **`errored` field**: Changed from `errored?: boolean` to `status: "errored"` (clean enum extension) and `errorMessage?: string`. More type-safe than the old boolean flag.
- **`tool-entry.tsx` hook ordering**: Used `useState` before the `label.hidden` guard (moved state declaration unconditionally upward) to satisfy React hook ordering rules.

### Test status

- 115 tests across the 5 target test files: all pass.
- Full workspace test suite: 2954 passing, 13 failing (all in `course-documents-service.test.ts` — pre-existing parallel story failure, not related to this feature).
- Parity test (`bubble-boundary-parity.test.ts`): 8/8 pass.
