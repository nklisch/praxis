---
id: feature-refactor-engine-adapter-shared-helpers-close-bridge
kind: story
stage: done
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

## Implementation notes

**Helper file**: `packages/engines/src/common/close-bridge.ts`

The helper accepts `ToolBridgeHandle | null | undefined` (adapters store `null` for "no bridge") and calls `serializeError` on the caught error to match the existing inline patterns.

**Warn keys preserved** (key = `${component}.tool_bridge_close_failed`):
- Claude Code adapter passes `"engine.claude-code"` → key `"engine.claude-code.tool_bridge_close_failed"`
- Codex adapter passes `"engine.codex"` → key `"engine.codex.tool_bridge_close_failed"`

**Adapters updated**:
- `packages/engines/src/claude-code/adapter.ts` — added `closeBridgeIfPresent` import; replaced 3-line `if (this.bridge) { await this.bridge.close().catch(...) }` in `close()` with single `await closeBridgeIfPresent(...)` call
- `packages/engines/src/codex/adapter.ts` — same replacement pattern; `serializeError` import retained (still used in `open()` error path)

**Verification**: `pnpm typecheck` green; `pnpm test` 4745 passed; no lint issues on changed files.

## Review

**Verdict: done** — no blockers, no important findings, no nits.

Checklist:
- Helper signature matches spec: `closeBridgeIfPresent(bridge: ToolBridgeHandle | null | undefined, log: Logger, component: string): Promise<void>` — correct.
- Early return on falsy bridge — correct (`if (!bridge) return`).
- `bridge.close()` wrapped in try/catch — correct.
- `serializeError` applied to caught error — correct, matching inline patterns.
- Warn key for Claude Code: `"engine.claude-code.tool_bridge_close_failed"` — preserved.
- Warn key for Codex: `"engine.codex.tool_bridge_close_failed"` — preserved.
- Both adapters delegate to helper with correct component strings — confirmed.
- ESM `.js` extension on import — correct.
- `import type` used for `Logger` and `ToolBridgeHandle` — correct (`verbatimModuleSyntax` compliance).
