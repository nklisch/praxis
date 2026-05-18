---
id: course-create-context-textarea-forwarding
kind: story
stage: implementing
tags: [ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Course-create context textarea — forward to bootstrap session

## Brief

The `/course-create` upload screen renders an optional context textarea
("Tell Praxis what you're trying to learn — optional but helpful") whose
value is currently collected into local state and then dropped on the floor.
The mock annotation promises that this textarea "improves Praxis's draft",
but `handleStart` ignores `context` and `openSessionInTab` has no initial-
message argument. This story wires the value through so the drafter agent
sees it as the first user message in the bootstrap session.

## Implementation plan

After `openSessionInTab` resolves and the bootstrap session id is known,
if `context.trim()` is non-empty, send `context` to the session via
`client.session.send` before navigating away. The send is fire-and-forget
from the route's perspective — the session is already mounted in its tab
and will stream the response there.

This is Option A from the original park note; Options B (intentional gap)
and C (drop the textarea) are rejected because the locked mock keeps the
textarea and the UX copy explicitly promises the agent will use it.

## Background (from park note)

`course-create.tsx` (the upload screen at `/course-create`) renders an
optional context textarea:

> "Tell Praxis what you're trying to learn — optional but helpful"
>
> Placeholder: "e.g. — I'm an adult learner returning to calculus to prep for
> an actuarial exam. I want to actually understand derivatives this time, not
> memorize them."

The locked mock annotation for step 2 says the textarea "improves Praxis's
draft". However, the implementation collects the `context` state but does not
pass it anywhere — `openSessionInTab` does not accept an initial message, and
the `handleStart` callback ignores `context`.

## Files

- `packages/ui/src/routes/course-create.tsx` — `handleStart` callback
