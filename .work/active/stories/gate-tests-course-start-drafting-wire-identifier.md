---
id: gate-tests-course-start-drafting-wire-identifier
kind: story
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-19
---

# `course.start_drafting` tool-name rename has no test asserting MCP-bridge wire identifier

## Priority
Low

## Spec reference
Item: `refactor-rename-step-2-tool-rename`

Acceptance criterion: "`grep -rn 'start_exploration|startExploration' packages/`
returns no results" plus "Atomic step: every reference to the tool name
string must flip in the same commit."

The grep is a build-time check, not a runtime assertion. A regression that
re-emitted `course.start_exploration` somewhere would slip past `pnpm test`.
`course-create-toolnames.test.ts:29` asserts
`toolNames.includes("course.start_drafting")` for the mode's tool list, but
doesn't assert the underlying `ToolDefinition.name` matches what's wired
into the registry.

## Gap type
missing test for wire-protocol contract

## Suggested test
```ts
// packages/tools/src/course/__tests__/start-drafting.test.ts
it("ToolDefinition.name is the wire identifier 'course.start_drafting'", () => {
  expect(startDraftingTool.name).toBe("course.start_drafting");
});

// In a registry-level test:
it("the tool registry exposes 'course.start_drafting' and not 'course.start_exploration'", () => {
  const names = registry.list().map(t => t.name);
  expect(names).toContain("course.start_drafting");
  expect(names).not.toContain("course.start_exploration");
});
```

## Test location (suggested)
`packages/tools/src/course/__tests__/start-drafting.test.ts`

## Implementation Notes

### Files changed
- `packages/tools/src/course/__tests__/start-drafting.test.ts` — added 4 new tests in a `describe("course.start_drafting — wire identifier")` block; also added two imports (`InProcessToolRegistry`, `COURSE_TOOLS`).

### Assertions added
1. `startDraftingTool.name === "course.start_drafting"` — direct wire-identifier contract assertion.
2. `startDraftingTool.name !== "course.start_exploration"` — negative guard against regression.
3. `COURSE_TOOLS` barrel does not contain `"course.start_exploration"` — guards the barrel.
4. Registry built from `[...COURSE_TOOLS, startDraftingTool]` (mirroring `services.ts` production wiring) exposes `"course.start_drafting"` and not `"course.start_exploration"` via `InProcessToolRegistry.list()`.

### Registry approach
`startDraftingTool` is intentionally excluded from the `course/index.ts` barrel (circular-import guard). The registry-level test is placed in `start-drafting.test.ts` (which already imports both `startDraftingTool` and `COURSE_TOOLS` is added here) and builds an `InProcessToolRegistry` mirroring the production `services.ts` wiring.

### Verification status
- `pnpm vitest run packages/tools/src/course/__tests__/start-drafting.test.ts` — 8/8 pass (4 pre-existing + 4 new).
- `pnpm test` — 4540 tests pass, 23 skipped, 0 failures.
- `pnpm typecheck` — pre-existing `@praxis/desktop` failure (`IndexerOrchestrator | undefined` type mismatch in `session-service.ts`) confirmed present before this change; not introduced here.
- `pnpm lint` — pre-existing failures in `.mockups/` HTML files; the changed `.ts` file is lint-clean.

## Review (2026-05-19)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Tests assert the wire-identifier contract directly (tool-level + registry-level), match the gate spec, mirror production registry wiring in the registry test (`[...COURSE_TOOLS, startDraftingTool]`), and add two defensive negative assertions against the old `course.start_exploration` name without over-engineering. Test names are descriptive. 8/8 pass in the file, full suite green. Item stays in `active/` per `release_binding: v0.1.3` — will move to `releases/v0.1.3/` on release-deploy.
