---
id: bug-scan-auth-modal-leaves-cli-running
kind: story
stage: implementing
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
