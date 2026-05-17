---
id: gate-tests-stored-schema-strict-inheritance
kind: story
stage: done
tags: [testing, security]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-14
updated: 2026-05-17
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

## Implementation notes

- **Test added**: `packages/core/src/__tests__/engine-config.test.ts` lines 438–446 — `"EngineConfigStoredSchema rejects unknown top-level keys (inherits .strict from public schema)"` added adjacent to the existing `"stored schema accepts the encrypted blob field"` test.
- **Schema fixed**: `packages/core/src/config/schema.ts` lines 71–80 — `.strict()` chained before `.superRefine(visionModelRefine)` so unknown-key rejection runs before the vision refinement. Docstring updated to explicitly note strictness.
- **Caller audit**: Only one production caller — `packages/core/src/config/engine-config.ts:164` — parses a row read directly from the DB; no extra keys pass through that path.
- **All 36 tests pass** after the fix; typecheck clean across all packages.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Diff inspected at commit `c144e88`. Two-part change:
- `schema.ts`: `.strict()` added before `.superRefine(visionModelRefine)` on `EngineConfigStoredSchema`; docstring updated. Order is correct (strict runs before refine).
- `engine-config.test.ts`: new test asserts unknown top-level keys are rejected; failed before the source change, passes after.
Sole production caller (`engine-config.ts:164`) parses DB rows containing only schema-declared fields, so no migration risk from the tightening. Persistence-boundary contract pinned.
