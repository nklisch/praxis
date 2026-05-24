---
id: story-refactor-remove-dead-use-current-sub-agent
kind: story
stage: implementing
tags: [refactor, cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Remove dead `useCurrentSubAgent` hook (zero consumers)

## Brief
`packages/ui/src/hooks/use-current-sub-agent.ts` exports `useCurrentSubAgent()` (line 15).
It has zero consumers — the only references in the workspace are:
- The definition itself
- The compiled `.d.ts` in `packages/ui/dist/` (build output)

The companion `useSubAgent` hook IS wired into components; `useCurrentSubAgent` was
planned for the agent-transparency UX work but never actually wired. The feature shipped
in `.work/releases/v0.1.1/feature-agent-transparency-ux-subagent-ui.md`; the unused
hook is residue.

## Verification
```
grep -rn "useCurrentSubAgent" packages --include="*.ts" --include="*.tsx"
```
Returns only the definition line and the `.d.ts` build artifact. Zero production /
test consumers.

## Target
Delete `packages/ui/src/hooks/use-current-sub-agent.ts`. If the hook was a hub /
re-export site, remove it from any index file too (verify during implementation).

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` green
- File deleted
- No stale re-exports

## Risk: Low
Zero consumers verified. If the hook is needed later, `useSubAgent` is the live hook;
the dead version is recreatable from git history.
