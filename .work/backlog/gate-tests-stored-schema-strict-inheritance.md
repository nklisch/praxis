---
id: gate-tests-stored-schema-strict-inheritance
kind: story
stage: backlog
tags: [testing, security]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-14
updated: 2026-05-14
---

# `EngineConfigStoredSchema` rejection of unknown top-level keys is untested

## Priority
Low

## Spec reference
Bound item: `epic-security-hardening-round-2-ipc-boundary-engine-config-shape`

Acceptance criterion: "`EngineConfigSchema` is `.strict()` — unknown
keys rejected." Spec says public is strict; stored schema extends
public — does stored inherit `.strict()`?

## Gap type
Adversarial-spec-silent (potential cross-boundary leak: if `Stored`
accepts arbitrary keys, a misuse could leak data via the
persistence-write path).

## Suggested test

```typescript
// packages/core/src/__tests__/engine-config.test.ts (addition)

it("EngineConfigStoredSchema rejects unknown top-level keys (inherits .strict)", () => {
  const result = EngineConfigStoredSchema.safeParse({
    engineId: "claude-code",
    attackerKey: "x",
  });
  expect(result.success).toBe(false);
});
```
