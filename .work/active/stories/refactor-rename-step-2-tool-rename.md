---
id: refactor-rename-step-2-tool-rename
kind: story
stage: implementing
tags: [refactor, naming, tools]
parent: refactor-rename-bootstrap-and-explorer
depends_on: [refactor-rename-step-1-explorer-to-drafter]
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Step 2: Rename tool `course.start_exploration` → `course.start_drafting`

## Brief

Renames the model-facing tool from `course.start_exploration` to
`course.start_drafting`. Atomic at the wire level — every reference (mode
toolNames, prompt fragments, tests, label registry) must flip in the same
commit. Episodic events already persisted in the DB keep the old name in
their `eventJson.tool_name` payload — that's the historical record of what
the model called at that moment.

## Current State

```ts
// packages/tools/src/course/start-exploration.ts
export const startExplorationTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.start_exploration",
  description:
    "Run the concept-explorer agent on the selected source documents to build a course draft. ...",
  // ...
};
```

```ts
// packages/curriculum/src/modes/bootstrap.ts (file is still bootstrap.ts at this step)
toolNames: [
  // ...
  // Phase 16: explorer entry point (replaces propose_draft)
  "course.start_exploration",
  // ...
],
```

```ts
// packages/tools/src/labels/index.ts:63
"course.start_exploration": { present: "Reading your materials", spawnsSubAgent: true },
```

## Target State

```ts
// packages/tools/src/course/start-drafting.ts
export const startDraftingTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.start_drafting",
  description:
    "Run the drafter on the selected source documents to build a course draft. ...",
  // ...
};
```

```ts
// packages/curriculum/src/modes/bootstrap.ts (file is still bootstrap.ts at this step)
toolNames: [
  // ...
  // Phase 16: drafter entry point (replaces propose_draft)
  "course.start_drafting",
  // ...
],
```

```ts
// packages/tools/src/labels/index.ts
"course.start_drafting": { present: "Reading your materials", spawnsSubAgent: true },
```

## Files

**File renames (`git mv`)**:
- `packages/tools/src/course/start-exploration.ts` → `start-drafting.ts`
- `packages/tools/src/course/__tests__/start-exploration.test.ts` → `start-drafting.test.ts`

**Edits**:
- `packages/tools/src/labels/index.ts` — rename the entry key
- `packages/curriculum/src/modes/bootstrap.ts` — toolNames array entry
  (and the inline comment that references "explorer entry point")
- `packages/curriculum/src/modes/configure.ts` — toolNames array entry
  (configure mode also exposes this tool)
- `packages/curriculum/src/modes/fragments/bootstrap-role.ts` — prompt
  fragment that gives the model role instructions (multiple occurrences of
  the tool name in the body)
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` — tool
  roster prompt fragment
- `packages/curriculum/src/modes/fragments/configure-tools.ts` — same
- `packages/curriculum/src/modes/fragments/__tests__/drafter-configurator-posture.test.ts` — assertions on the tool name string
- `packages/curriculum/src/modes/fragments/__tests__/bootstrap-no-inline-outline.test.ts`
- `packages/curriculum/src/modes/__tests__/bootstrap-toolnames.test.ts`
- `packages/desktop/electron/main/services.ts` — import statement and tool registry composition
- Any other importer of `startExplorationTool` (grep first)

**Symbol renames**:
- `startExplorationTool` → `startDraftingTool`

**String renames** (atomic — all in one commit):
- `"course.start_exploration"` → `"course.start_drafting"`

**Description text update** (model-facing, included in the same commit):
- "Run the concept-explorer agent" → "Run the drafter"
- "the explorer" mentions in description prose → "the drafter"

**Out of scope for this step**:
- `course.draft_*` tool family (already aligned with new naming — see
  feature body's Step C inventory)
- Mode id rename (Step 3)

## Implementation Notes

- This is the atomic step for the tool name. All references must flip
  together because the model's prompt sees the name and mode toolNames
  filter against it.
- Historical episodic events stored in `episodic_events.event_json` with
  `tool_name: "course.start_exploration"` stay as-is — they're an audit
  record of what the model called at the time.
- Description prose can be updated freely; the model only reads the live
  description.
- After this step, the only place "exploration" should remain (other than
  generic UI prose) is the `bootstrap` directory path — that's intentional
  and gets renamed in Step 4.

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (including the `bootstrap-toolnames.test.ts` and
      posture tests that assert on the tool name)
- [ ] `pnpm lint` passes
- [ ] `grep -rn "start_exploration\|startExplorationTool" packages/ --include="*.ts" --include="*.tsx" | grep -v dist | grep -v archive` returns no results
- [ ] `grep -rn '"course\.start_drafting"' packages/` returns matches in the
      tool definition, both mode files, both prompt fragments, the label
      registry, and the test files
- [ ] Manual smoke test: open a bootstrap session, observe the agent has
      `course.start_drafting` in its tool list (or check via DB
      `SELECT event_json FROM episodic_events ORDER BY ts DESC LIMIT 1`
      after a tool call)

## Risk

**Medium** — atomic wire-level string. Pre-existing in-flight sessions might
have the old name cached in the prompt; new turns get the new prompt
verbatim, so behaviour switches at next turn.

## Rollback

`git revert <commit>` is atomic; no DB rows depend on this string for live
behavior. Historical episodic events stay as they are.
