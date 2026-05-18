---
id: cleanup-delete-deprecated-code-sandbox-exports
kind: story
stage: implementing
tags: [cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Story: delete deprecated codeSandboxInput and codeSandboxTool exports

## Brief

`packages/tools/src/sandbox/code-sandbox.ts` has two exports marked
`@deprecated` with the comment "Legacy static export — kept for backward
compat during Unit 7 transition. Unit 9 removes this once services.ts uses
createCodeSandboxTool exclusively." Unit 9 already happened —
`packages/desktop/electron/main/services.ts:215` uses
`createCodeSandboxTool(sandbox)`, not the deprecated static export. Verified:

```
$ grep -rn 'codeSandboxTool\|codeSandboxInput' packages/ tests/ | grep -v dist | grep -v node_modules
# Only matches: services.ts uses createCodeSandboxTool (the factory),
# code-sandbox.ts defines the deprecated exports (lines 84, 102),
# and the file's own internal use at lines 31, 52, 56, 113.
# Zero external consumers of the deprecated symbols.
```

The deprecated exports are pure dead code.

## Files

- `packages/tools/src/sandbox/code-sandbox.ts` — delete lines 80-130
  (the deprecated comment + `codeSandboxInput` const + `codeSandboxTool`
  ToolDefinition + handler)
- Verify barrel file at `packages/tools/src/sandbox/index.ts` or
  `packages/tools/src/index.ts` doesn't re-export them; if it does,
  remove the re-export

## Current State

```ts
// packages/tools/src/sandbox/code-sandbox.ts

// ── Legacy static export — kept for backward compat during Unit 7 transition. ──
// Unit 9 removes this once services.ts uses createCodeSandboxTool exclusively.

/** @deprecated Use createCodeSandboxTool(sandbox) instead. */
export const codeSandboxInput = z.object({ … });

/** @deprecated Use createCodeSandboxTool(sandbox) instead. */
export const codeSandboxTool: ToolDefinition<…> = { … };
```

## Target State

These exports do not exist. The factory `createCodeSandboxTool(sandbox)`
remains as the sole export, consumed by `services.ts`.

## Implementation Notes

- Final verification grep before deletion:
  ```
  grep -rn 'codeSandboxTool\|codeSandboxInput' packages/ tests/ --include='*.ts' --include='*.tsx' | grep -v dist | grep -v 'sandbox/code-sandbox.ts:'
  ```
  Expected result: only the `const codeSandboxTool = createCodeSandboxTool(...)`
  local assignment in `services.ts` (line 215) and its uses (line 535).
  The local `const` shadows nothing because the import would be
  `createCodeSandboxTool`, not the deprecated symbol.
- Also delete the section-comment marker `// ── Legacy static export …`.

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `grep -n '@deprecated' packages/tools/src/sandbox/code-sandbox.ts` returns 0 results
- [ ] File LoC reduced by ~50 lines

## Risk

**Very low** — verified zero external consumers; deletion is mechanical.

## Rollback

`git revert <commit>` — clean.
