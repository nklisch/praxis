---
id: idea-course-create-context-textarea-forwarding
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

# Decision needed: course-create context textarea — forward to bootstrap session?

## Background

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

## Decision needed

Should the context textarea value be forwarded to the bootstrap session?

**Option A — Send as initial user message**: after opening the bootstrap
session (via `openSessionInTab`), send `context` as the first message via
the session's send channel. This lets the drafter agent read the context as
part of the conversation before it starts exploring.

**Option B — Intentional scope cut**: the agent is instructed in its system
prompt to infer learning context from the attached documents. The textarea
is aspirational UI (present in the mock, not yet wired). Accept the gap and
track it explicitly here.

**Option C — Drop the textarea**: if the agent doesn't use context, remove
the textarea to avoid misleading the student.

## Preferred direction

Option A is most consistent with the mock intent and the UX copy ("improves
Praxis's draft"). The change is small: after `openSessionInTab` resolves,
if `context.trim()` is non-empty, call `client.session.send` with the
context text before navigating away.

## Files

- `packages/ui/src/routes/course-create.tsx` — `handleStart` callback
