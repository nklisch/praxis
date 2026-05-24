---
id: feature-refactor-engine-adapter-shared-helpers-close-bridge
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-engine-adapter-shared-helpers
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Extract `closeBridgeIfPresent(bridge, log)` helper

## Brief
Both `packages/engines/src/claude-code/adapter.ts:287–298` and
`packages/engines/src/codex/adapter.ts:182–192` have identical error-tolerant
bridge-close logic:

```ts
async close(): Promise<void> {
  // (engine-specific cleanup)
  if (bridge) {
    try {
      await bridge.close();
    } catch (err) {
      log.warn("...adapter.bridge_close_failed", { err });
    }
  }
}
```

## Target
Extract a tiny helper in `packages/engines/src/common/close-bridge.ts`:
```ts
export async function closeBridgeIfPresent(
  bridge: ToolBridge | undefined,
  log: Logger,
  component: string,
): Promise<void> {
  if (!bridge) return;
  try {
    await bridge.close();
  } catch (err) {
    log.warn(`${component}.bridge_close_failed`, { err });
  }
}
```

Both adapters call `await closeBridgeIfPresent(this.bridge, this.log, "claudeCodeAdapter")`
(or `"codexAdapter"`).

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` green
- Both adapters use the helper
- Warn-log keys remain unique per adapter (preserves observability filters)
