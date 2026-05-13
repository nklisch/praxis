---
id: idea-lock-button-no-op
created: 2026-05-13
tags: [bug]
---

There's a lock button in the UI that doesn't do anything when clicked — no visible state change, no persistence, no effect on downstream behavior. Likely candidate is the prompt-customization lock affordance (lock a customized fragment so default changes don't overwrite it), but could be a lock control elsewhere in the configure surface. Needs investigation: identify which lock button, what it was intended to do, and either wire it up to its handler or remove it if the feature was deferred.
