---
id: gate-cruft-quick-check-channel-dead-optional-guard
kind: story
stage: review
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: cruft
created: 2026-05-14
updated: 2026-05-14
---

# Dead `if (!services.quickCheck) return;` guard in quick-check-channel

## Confidence
High

## Category
defensive try/catch (dead branch)

## Location
`packages/desktop/electron/main/quick-check-channel.ts:22-26`

## Evidence
```typescript
if (!services.quickCheck) {
  // QuickCheckService is optional in the Services interface during transition.
  // If it's not wired, skip registering the handlers.
  return;
}
const quickCheck = services.quickCheck;
```

`Services.quickCheck: QuickCheckServiceImpl;` is declared required,
non-optional in `packages/desktop/electron/main/services.ts:162`. The
"optional during transition" rationale in the comment is stale —
Phase 17 has shipped and `quickCheckService` is unconditionally wired
at `services.ts:550, 617`.

## Removal
Delete lines 22-27 (the `if (!services.quickCheck) return;` block plus
the local `const quickCheck = services.quickCheck;` line). Replace
remaining `quickCheck.` references in this file with
`services.quickCheck.` (lines 45, 74) — or keep the local for brevity
but make it an unconditional `const quickCheck = services.quickCheck;`.

## Implementation

Chose Form B: deleted the 5-line dead guard block (the `if (!services.quickCheck) return;` block
with its stale comment), and replaced it with an unconditional
`const quickCheck = services.quickCheck;`. All existing `quickCheck.` call-sites in the file
remain unchanged.

Also fixed a pre-existing formatter violation on the adjacent `push({ kind: "error", ... })` line
(added by the sibling security fix) — biome required it to be split across multiple lines.

Verification:
- `pnpm --filter @praxis/desktop typecheck`: passed
- `pnpm --filter @praxis/desktop test`: 122 tests passed
- `pnpm biome check packages/desktop/electron/main/quick-check-channel.ts`: clean
- `grep -r "if (!services.quickCheck)"`: zero results in desktop package
