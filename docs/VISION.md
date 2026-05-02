# Praxis

**An open framework for AI tutors that prioritize learning over answers.**

## Why this exists

The current generation of AI tutors are very good at being helpful — and that is the problem. A tutor that hands out answers fast feels great in the moment and produces nothing durable. The art of teaching is creating productive struggle, surfacing misconceptions, calibrating difficulty to the edge of what the student can do, forcing retrieval rather than recognition, and developing the student's capacity to learn — not just their grasp of one topic.

Praxis is built around the conviction that *learning is the goal*, and an AI tutor's job is to teach in ways that produce learning. That has to be defended at every layer: the prompts, the modes, the tools, the way the system handles "I'm stuck — just tell me." A helpful tutor that bypasses struggle is not a good tutor.

## What Praxis is

A framework for building AI tutors. Not a tutoring app — though it ships with a reference tutor on top. The framework is what survives years of feature growth; specific subjects, modes, study strategies, and exam packs are extensions on top of it.

Two products are fused inside it:

- **A content tutor** — teach this topic, this concept, this problem.
- **A metacognition coach** — teach the student *how to learn*: retrieval practice, spaced review, structured note-taking, source authority, productive struggle as a habit.

Both are top-billing. The metacognition coach surfaces in a dedicated mode, woven into other modes' prompts, eventually as a persistent observer of habits, and as work assigned alongside content.

## Who Praxis is for

- **Students from 1st grade through graduate study.** The initial wedge is grades 6–12 — students who can read and type, work somewhat independently, with parents still engaged, in the richest standards-mapped content domain. K–5 and undergrad/grad come later as different prompt profiles, modes, and study strategies — same core.
- **Parents and teachers** who want to author courses, set thresholds, customize teaching style, and watch their student's progress.
- **Self-directed learners** who want to onboard their own materials and learn at their own pace.

## How Praxis works

The tutor is always an agent with tools, looping — same shape as Claude Code, specialized for tutoring. It operates on structured artifacts: courses, lessons, assignments, exams, gates, flashcards, notes. Tools enforce verification — math goes through symbolic computation; code runs against tests; "from your textbook" comes from retrieval. Memory is recorded across sessions and projected into a student model the tutor reads to adapt.

The framework is engine-agnostic: Claude Code SDK, Codex SDK, and direct API providers are all thin adapters behind one normalized interface. That makes two deployments the same codebase:

- **Personal use**, running locally on a Claude Code or Codex CLI subscription.
- **Hosted product**, where the user supplies an API key (or, eventually, a managed service does).

## The verification principle

Praxis prefers the most authoritative source available, in this order: the student's own course material → deterministic computation → cited search → curated pedagogy research → model knowledge. Verification lives in tool design — the tool that grades math literally uses symbolic computation; the tool that quotes the textbook literally uses retrieval. The model is not trusted to be right about anything that can be checked.

When the tutor leans on its own knowledge — for analogies, motivating examples, conceptual scaffolding — it signals that. Source-awareness is itself a study skill the metacognition coach teaches.

## What success looks like

A student who uses Praxis over a school term:

- Shows measurable mastery growth on assessments — both Praxis's own and the ones their school gives.
- Develops working habits — uses retrieval practice, takes notes that get reused, schedules spaced reviews, and chooses sources thoughtfully — that generalize beyond the system.
- Trusts the system because it is honest with them: about what it knows, about what they have mastered, about what comes next.

A parent or teacher who uses Praxis:

- Authors a complete course in a few hours of guided configuration, not weeks of LMS struggle.
- Watches progress through a clear lens — concept mastery, time on task, working misconceptions, engagement — without crossing into surveillance.
- Adjusts teaching style and threshold knobs without writing code.

## How Praxis feels

Two posture commitments, alongside the verification principle, govern what Praxis feels like to use.

**Sessions are named arcs, not infinite chat.** A real tutor doesn't have one infinite conversation with a student; they have *lessons* — each with a before (today we'll work on X), a middle (the work), and an after (here's what we covered, here's what to practice). Praxis sessions are the same: each one has a topic, a structure, a beginning, and an end. They become artifacts you can revisit, not transcripts that scroll into oblivion. Multiple sessions of any mode can be open simultaneously as parallel tabs — algebra teach in one, calculus bootstrap in another — because real learners switch contexts.

**Editorial restraint over notification-driven design.** Praxis stands out by what it refuses to add. No streak counters. No badges. No notification bells. No dopamine-tap surfaces. The aesthetic is a literary review, not a chat app — italic display serif paired with uppercase mono kicker; real typographic ornaments instead of icons; whisper-faint mode tints; copy that reads as invitation rather than nag. Quiet intelligence beats loud engagement, and a tutor app is exactly where this matters most: the goal is that the student *focuses*, and the product never gets in the way of that.

## What Praxis is not

- Not an answer-generator. Designed against the use case of "do my homework for me."
- Not a tutoring app — a framework, with one reference tutor inside it.
- Not a Khan Academy clone. External educational content is referenced and linked, never downloaded or rehosted.
- Not an LMS or school management system. No grade-book sync, no district integration in v1.
- Not multi-student in v1. One student per installation; classroom support is a later concern.

## License and openness

Praxis is intended to be released as an open-source framework; specific license is to be settled in `SPEC.md`. The hosted product is a separate concern.
