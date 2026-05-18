---
id: gate-tests-course-start-drafting-wire-identifier
kind: story
stage: backlog
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-18
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
