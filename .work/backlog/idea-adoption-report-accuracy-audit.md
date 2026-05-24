---
id: idea-adoption-report-accuracy-audit
created: 2026-05-24
tags: [mockups, audit, documentation]
---

The `.mockups/adoption-report.md` was last written 2026-05-19 and asserts surface decisions ("chat-workspace aligned · keep mocks", "discovery-surfaces aligned · keep mock", etc.) without re-verifying them against the current production code. User flagged this during the `feature-design --only-questions --all` pass on 2026-05-24: "don't trust the adoption report — you should spawn some opus agents to make sure it is accurate and find discrepancy".

## What to do

Spawn parallel opus sub-agents (one per row in the `Surface decisions roll-up` table, ~15 rows) that each:

1. Read the surface's claimed mockup paths
2. Read the cited production code files
3. Re-verify the drift classification (ALIGNED / MINOR-DRIFT / MAJOR-DRIFT / IN-FLIGHT)
4. Surface any new drift introduced since the report's authoring (new components, refactored routes, removed mockup affordances, etc.)
5. Report findings as a structured delta

The orchestrator then:
- Updates the adoption report with verified findings
- Files any newly-discovered drift as substrate items (one per surface needing a mirror update)
- Notes the last-verified date on each row so future passes know how stale each decision is

## Why this matters now

This `--only-questions --all` pass had to lean on the adoption report's "chat-workspace · aligned" claim to know the existing chat-workspace mocks were ground truth that just needed state extensions. If that claim is wrong, the new state mocks (under `.mockups/screens/feature-composer-async-behavior/`, `.mockups/screens/feature-question-panel-rework/`) may have been built against a stale baseline. Worth verifying before the chat-UX features hit implementation.

Adjacent: the user also indicated a broader desire to "normalize to a set of mockups we consider our ground truth — clean stuff up so we have mockup truth to target". This audit is the input to that cleanup.

## Scope notes

- Read-only audit; no code changes from the audit itself
- Findings produce substrate items, which then get scoped and implemented through the normal pipeline
- Opus per surface because the verification needs cross-file understanding (mock + production code + design notes), not just keyword matching
