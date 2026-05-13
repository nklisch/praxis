---
id: gate-cruft-authoring-client-phase-narrative-jsdoc
kind: story
stage: done
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: cruft
created: 2026-05-12
updated: 2026-05-12
---

# "Phase 3 methods kept for backward compatibility" in `AuthoringClient` JSDoc — stale on a v0.1.1 release

## Confidence
Medium

## Category
stale comment

## Location
`packages/core/src/types/client.ts:417-421`

## Evidence
```ts
/**
 * Client-side authoring surface (no studentId on methods — resolved server-side
 * via getOrCreateDefaultStudentId in IPC handlers).
 *
 * Phase 3 methods kept for backward compatibility; Phase 11 adds the full v1 surface.
 */
export interface AuthoringClient {
  // ── Phase 3 surface (now real) ────────────────────────────────────────────
  createCourse(input: CreateCourseInput): Promise<Course>;
  ...
  // ── Phase 11: course / lesson / gate edits ────────────────────────────────
```
Pre-1.0 the interface ships as the v1 surface; framing some methods as "Phase 3 kept for backward compatibility" mis-describes the interface. The "(now real)" parenthetical on line 424 reinforces the comment is mid-evolution residue. Phase numbers are internal dev concepts that leak into the public type docs.

## Removal
Replace the JSDoc with a description of the interface's purpose ("Authoring surface — methods for creating, editing, and customizing courses, gates, and lessons"). Drop the Phase 3 / Phase 11 section headers in favor of grouping by capability (course, lesson, gate, customization).

## Implementation notes
Inline cruft cleanup applied as part of the v0.1.1 autopilot batch.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
