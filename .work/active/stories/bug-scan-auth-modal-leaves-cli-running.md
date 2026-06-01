---
id: bug-scan-auth-modal-leaves-cli-running
kind: story
stage: done
tags: [bug, resource-leak, high]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
bug_origin: scan
bug_severity: high
bug_domain: resource-leak
bug_location: packages/ui/src/components/claude-auth-modal.tsx:39
---

# Closing Claude auth modal does not abort the login stream or child process

**Location**: `packages/ui/src/components/claude-auth-modal.tsx:39` · **Severity**: high · **Pattern**: child_process / async stream not cancelled on UI teardown

The close/unmount path only flips a local `canceled` flag. If the auth stream is blocked waiting for the next event, the iterator never returns, the IPC cancel channel is not sent, and the CLI login process can continue after the modal is gone. Call `return()` on the iterator or thread an abort signal through the auth client.

```ts
const stream = client.claudeAuth.login();
let canceled = false;
cancelRef.current = () => {
  canceled = true;
};
for await (const event of stream) {
  if (canceled) break;
}
```

## Implementation notes

- Changed `packages/ui/src/components/claude-auth-modal.tsx` to hold the login stream iterator explicitly and call `return()` from modal close/unmount cancellation.
- Added coverage in `packages/ui/src/__tests__/claude-auth-modal.test.tsx` that closes the modal while `login()` is blocked and asserts the iterator is returned.
- Verification: `TMPDIR=/home/nathan/dev/praxis/.tmp/vitest pnpm vitest run packages/ui/src/__tests__/claude-auth-modal.test.tsx packages/ui/src/__tests__/use-streamed-send.test.tsx packages/ui/src/__tests__/course-create-tab-body-layout.test.tsx packages/ui/src/hooks/__tests__/use-sub-agent.test.tsx packages/ui/src/__tests__/note-editor-feynman.test.tsx`; `pnpm --filter @praxis/ui typecheck`; `pnpm exec biome check <touched UI files>`.

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Story fast lane. Verdict: Approve - story verified by implement; fast-lane advance. Full integration verification also passed with `TMPDIR=$PWD/.tmp pnpm test` (489 files, 5439 tests) and targeted Biome on the touched-code set.
