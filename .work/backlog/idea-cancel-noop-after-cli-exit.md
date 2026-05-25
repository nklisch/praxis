---
id: idea-cancel-noop-after-cli-exit
created: 2026-05-25
tags: [bug]
---

When the Claude CLI exits abnormally mid-turn (`CLIError: Claude CLI exited with code 1: CLI process exited without a result event`, observed on session `019e6082-5018-7050-998d-a78c162be2cc` after ~684s), the session is left in a state where the cancel control no longer does anything useful — the user can't recover the chat. Need to make cancel reliably tear down a session whose underlying CLI process has already died (or never produced a `result` event), surface the failure clearly, and either reset the chat for another turn or close the session cleanly instead of hanging. Likely lives around `packages/claude-cli-sdk/src/conversation.ts` `closeHandler` + the engine-session cancel path.
