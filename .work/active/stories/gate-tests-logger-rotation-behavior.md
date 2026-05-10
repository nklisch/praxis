---
id: gate-tests-logger-rotation-behavior
kind: story
stage: review
tags: [testing]
parent: feature-release-v0.1.0-test-findings
depends_on: []
release_binding: v0.1.0
gate_origin: tests
created: 2026-05-10
updated: 2026-05-10
---

# Logger rotation / `maxFiles` / `maxFileSizeMb` behavior not asserted

## Priority
Low

## Spec reference
Item: `feature-logger-rolling-file-rotation`
Acceptance criterion: "A packaged Electron run produces a rolling JSONL
file under `userData/logs/`" — implicitly tests rotation.

## Gap type
Adversarial-spec-silent — the rotation property itself is the feature,
but only "writes to a file" is asserted.

## Suggested test

```ts
// Append to packages/desktop/electron/main/__tests__/logger.test.ts under
// "createMainLogger (smoke)"
it("rotates to a new file when maxFileSizeMb is exceeded", async () => {
  const log = await createMainLogger(smokeOpts({ maxFileSizeMb: 0.001 }));
  // Write enough records to exceed 1KB.
  for (let i = 0; i < 100; i++) log.info("rotate.test", { i, padding: "x".repeat(50) });
  await log.shutdown();
  const entries = readdirSync(smokeDir).filter((e) => e.startsWith("praxis.log"));
  expect(entries.length).toBeGreaterThan(1);
});
```

## Test location (suggested)
`packages/desktop/electron/main/__tests__/logger.test.ts`

## Rationale
The feature is named "rolling file rotation" but the only assertion that
rotation happens is the file-naming pattern (`praxis.log.1`). A
misconfigured pino-roll plugin (wrong `frequency` arg, wrong unit) would
silently produce one growing file. Low priority because pino-roll is
third-party and well-tested upstream; downgrade if the team prefers to
trust the dependency.

## Implementation notes
Added one test inside the existing `describe("createMainLogger (smoke)")` block in
`packages/desktop/electron/main/__tests__/logger.test.ts`. Also promoted `readdirSync` to the
static import (from dynamic) for reuse. Key finding: pino-roll's size-based rotation is
event-driven — `destination.on('write', ...)` fires after async `fs.write()` callbacks and
schedules the reopen on `drain`. A simple `setImmediate` yield is insufficient because multiple
async I/O cycles are needed before rotation files appear on disk. The test uses a polling loop
(20ms ticks, 3s deadline) to wait for more than one `praxis.log.*` file — reliable since 100
records × ~150 B ≈ 15 KB far exceeds the 1 KB threshold and rotation fires multiple times.
