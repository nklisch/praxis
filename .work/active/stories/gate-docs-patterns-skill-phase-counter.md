---
id: gate-docs-patterns-skill-phase-counter
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# `.claude/skills/patterns/SKILL.md` says "Phases 1–14 shipped"

## Drift category
repo-skill-staleness

## Location
- Doc: `.claude/skills/patterns/SKILL.md:12`
- Code: n/a — phase progression evidenced as in
  gate-docs-readme-phase-counter.

## Current doc text
> Structural patterns for the Praxis AI tutoring framework
> (Phases 1–14 shipped). Read individual pattern files for full details,
> implementation notes, and common violations. The dense index is in
> `.claude/rules/patterns.md`.

## Reality
Through v0.1.0 the project has shipped Phases 1–19 plus the
activity-rail and language-sandbox-registry chunks.

## Required edit
Either bump the phrase to "Phases 1–19 shipped" or drop the phase
counter entirely (the SKILL doesn't depend on it; "for the Praxis AI
tutoring framework" is sufficient).
