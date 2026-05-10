---
id: gate-security-author-export-memory-target-path-validation
kind: story
stage: done
tags: [security]
parent: feature-release-v0.1.0-security-findings
depends_on: []
release_binding: v0.1.0
gate_origin: security
created: 2026-05-10
updated: 2026-05-10
---

# `praxis.author.exportMemory` accepts an arbitrary `targetPath` from the renderer

## Severity
Low

## Domain
API Security / Input Validation

## Location
`packages/desktop/electron/main/ipc-server.ts:735-739`,
`packages/core/src/services/memory/memory-service.ts:398-420`

## Evidence

```typescript
// ipc-server.ts:735
handle("praxis.author.exportMemory", async (_event, input: { targetPath: string }) => {
  await requireUnlocked();
  const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
  return services.authoring.exportMemory({ studentId, targetPath: input.targetPath });
});
```

```typescript
// memory-service.ts:418 — written without path validation
await writeFile(input.targetPath, json, "utf-8");
```

No path canonicalisation, no allowlist, no scoping under userData. A
renderer (or future remote surface that re-uses this client) can write a
JSON dump anywhere the Electron main process can write — overwriting files
in the user's home directory, dropping an `.envrc` in PATH, etc.

The `requireUnlocked` gate is per the substrate "UX gate, not a security
boundary" (per `lock-crypto.ts:5-8`) — once a user has unlocked the
configure surface, the main process trusts the renderer with arbitrary
file writes through this channel. Local-app threat model: the only
attacker is local-malware-in-the-renderer, which is already game-over —
but file-overwrite is a wider blast radius than data exfiltration.

## Remediation direction

Use a native save dialog (`dialog.showSaveDialog`) in the main process to
acquire the path, rather than accepting it from the renderer.

If the path must come from the renderer for UX reasons, validate it:
canonicalise via `path.resolve`, refuse paths outside
`app.getPath('downloads')` or `app.getPath('userData')` or a
user-confirmed directory, refuse paths whose basename starts with `.`.

## Implementation notes

Chose the renderer-supplies-path path (no `dialog.showSaveDialog` — avoids IPC
contract change). Validation added in `memory-service.ts::exportToFile` (not in
the IPC handler) so it applies regardless of call site. Two checks: (1) refuse
raw `..` segments in the input path, caught by splitting on `/\` and checking for
`".."` — this is checked *before* `pathResolve` so traversal intent is explicit
even though `resolve` would absorb it; (2) refuse a resolved basename starting
with `.` to block hidden-file injection (`.envrc`, `.bashrc`, etc.). We could not
use `app.getPath('downloads')`/`app.getPath('userData')` here because
`@praxis/core` has no Electron dependency — noted in a comment at the validation
site. `node:path` imports added: `basename` and `resolve as pathResolve`. The
write now uses the canonicalised `resolvedPath` rather than the raw
`input.targetPath`. Typecheck and lint (for touched files) both pass.

## Review (2026-05-10)

**Verdict: Approve.** Both checks are applied before write and the implementation note correctly explains why `app.getPath()` was not used. Placing validation in `memory-service.ts` (not the IPC handler) is the right call — defence-in-depth. `..` segment check on raw input before `pathResolve` plus basename starts-with-`.` block covers the stated threat scenarios cleanly.
