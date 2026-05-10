# v1.0.0 ship checklist

The end-to-end acceptance script for v1.0.0 of Praxis. The maintainer
runs this against a clean macOS account using the signed installer
produced by the production pipeline. The output is a go/no-go signal
that justifies running `/agile-workflow:release-deploy v1.0.0`.

## What this covers

- Install + first launch from the signed `.dmg` on a clean machine.
- The full first-run flow as a real user encounters it.
- Course creation from a canonical pack, a teach session including a
  sketch + assignment, persistence across launch, notes + flashcards,
  exam + gate unlock, and the update-banner flow.

Windows and Linux installers ship unsigned for v1.0.0; the rehearsal
focuses on macOS. A separate post-v1 checklist will cover the other
platforms when their signing pipelines come online.

## Prerequisites for running the checklist

- A clean macOS account (or a fresh VM). "Clean" means no Praxis dev
  paths, no Praxis-specific keychain entries, no leftover
  `~/Library/Application Support/Praxis/` directory.
- A signed `.dmg` produced via:
  ```bash
  MAC_SIGNING_IDENTITY="..." \
  APPLE_ID="..." \
  APPLE_APP_SPECIFIC_PASSWORD="..." \
  APPLE_TEAM_ID="..." \
  pnpm --filter @praxis/desktop dist:mac
  ```
  See `docs/CODE-SIGNING.md` for the signing setup.
- The pre-publish placeholders in `docs/ONBOARDING.md` filled in
  (`<DOWNLOADS_URL>` replaced; screenshots captured).
- API keys ready for at least one direct provider (Anthropic, OpenAI,
  or Google) AND Claude Code CLI auth ready (run `claude` once on the
  test account if it isn't already authenticated).
- (Optional) A second machine or a separate keychain entry to confirm
  the installer launches on a truly clean environment.

## Stage 1 — Install + launch

| # | Step | Expected |
|---|------|----------|
| 1.1 | Copy the `.dmg` to the clean account, mount it, drag Praxis to /Applications, eject. | No Gatekeeper warning. No "downloaded from internet" prompt requiring explicit approval. |
| 1.2 | `xcrun stapler validate /Applications/Praxis.app` (or against the `.dmg`). | Reports "validate action worked". |
| 1.3 | Double-click Praxis in /Applications to launch. | App opens. First-run flow appears. |

## Stage 2 — First-run flow

| # | Step | Expected |
|---|------|----------|
| 2.1 | Welcome step renders with the "Welcome to Praxis" copy. Click **Continue**. | Engine step renders. |
| 2.2 | In the engine step, pick **Direct — Anthropic (Claude)**, paste an API key, click **Continue**. | Course step renders. Engine config is saved (verified later in Stage 4). |
| 2.3 | Click **Algebra (canonical)**. | Bootstrap chat session opens. The first-run flag is now set; relaunch would land on Library, not first-run. |

## Stage 3 — Teach + sketch + assignment

| # | Step | Expected |
|---|------|----------|
| 3.1 | In the bootstrap session, type: "Use the canonical algebra-1 pack to create my course." | Agent calls `course.use_canonical_pack`; course + lessons appear in the left rail; bootstrap session transitions toward teach mode. |
| 3.2 | Switch to (or follow agent into) teach mode. Ask: "Teach me how to solve linear equations step-by-step." | Agent picks the first concept; explains; offers a worked example. |
| 3.3 | Open the sketch composer; sketch `2x + 5 = 11` and the steps to solve it. Submit. | Sympy verifies the final answer; agent gives feedback (correct or specific correction). |
| 3.4 | When the agent issues a quick check or assignment, submit a deliberately wrong answer first, then a right one. | Both submissions grade reasonably. Wrong → constructive feedback; right → confirmation + next step. |
| 3.5 | Ask: "What should I work on next?" | Agent uses the adaptive router; suggests a sensible next concept (router output reflects mastery + interleaving). |

## Stage 4 — Persistence

| # | Step | Expected |
|---|------|----------|
| 4.1 | Quit Praxis cleanly (⌘Q). Re-launch. | App opens directly to Library — no first-run flow this time. |
| 4.2 | Confirm the algebra course is listed; mastery scores from Stage 3 are intact; the session from Stage 3 is in the tab strip. | Yes to all. |
| 4.3 | Open the existing session. | Conversation history fully restored, including sketches and grades. |

## Stage 5 — Notes + flashcards

| # | Step | Expected |
|---|------|----------|
| 5.1 | In the teach session, ask the agent: "Take a Cornell-style note from this lesson." | Note appears in the workspace tab. |
| 5.2 | From the note, generate flashcards. | Flashcards appear in the review queue. |
| 5.3 | Run a flashcard review (rate one card "good", one "again"). | FSRS scheduling updates `nextReviewAt` timestamps in the order expected — "good" pushes further out, "again" stays soon. |
| 5.4 | Edit a note manually in the editor. Quit + relaunch. | Edit persists. |

## Stage 6 — Exam + gate unlock

| # | Step | Expected |
|---|------|----------|
| 6.1 | Trigger an exam from the course (via the gate-progress UI or the agent's prompt). | Exam mode launches with the reduced tool set (`assignment.show`, `assignment.read_grade`, `sketch.read`, `clarification`). |
| 6.2 | Complete the exam at or above the pass threshold and submit. | Grading completes; gate unlocks. |
| 6.3 | Confirm the previously-gated content is now accessible. | Yes. |

## Stage 7 — Update channel

| # | Step | Expected |
|---|------|----------|
| 7.1 | Launch with `PRAXIS_UPDATE_FEED_URL` unset. | No update banner; no spurious network request to a feed endpoint (verify in Console.app or via packet capture if curious). |
| 7.2 | Set `PRAXIS_UPDATE_FEED_URL` to a synthetic feed advertising version `9.9.9` and a download URL. Relaunch. | Update banner appears with the version + download link. Click "Dismiss"; banner disappears. Relaunch — banner stays hidden (per-version dismissal). |

## Failure-triage rubric

After running the script, classify each divergence into one of three
tiers:

| Tier | Definition | Action |
|------|------------|--------|
| **Block-ship** | Capability-breaking divergence. Examples: signed installer fails Gatekeeper; teach session crashes; canonical pack import fails; exam never grades; persistence loses data. | File a story at `.work/active/stories/<slug>.md` with `stage: implementing`, `tags: [bug]`, parented under this feature. v1.0.0 release does NOT proceed. |
| **Important-but-shippable** | Visible imperfection that a real user would notice but does not break the capability. Examples: copy typo, layout glitch on a specific screen size, slow first response. | File a backlog item at `.work/backlog/<slug>.md` with the appropriate tag. v1.0.0 ships; the issue is queued for v1.0.1+. |
| **Cosmetic** | Subjective or trivial. Examples: a colour you'd tweak, a wording you'd reconsider. | Inline note in the run record only; no item filed. |

All filed items get `gate_origin: null` (review-driven, not gate-driven).

## Go/no-go decision

Recorded in this feature's `## Review` section after the rehearsal
completes. The maintainer pastes the run summary (stages passed, list
of filed items, classification per tier) into the review record. The
verdict line is:

- **Go**: zero block-ship findings. `release-deploy v1.0.0` runs.
- **No-go**: one or more block-ship findings. The feature returns to
  `stage: implementing` until the items clear; the rehearsal is
  re-run from Stage 1.

Important-but-shippable findings do NOT block ship; they are tracked
for the next release.

## Pre-publish maintainer tasks

Before tagging v1.0.0, confirm each:

- [ ] `<DOWNLOADS_URL>` placeholder in `docs/ONBOARDING.md` replaced
      with the real downloads page URL.
- [ ] Screenshot placeholders in `docs/ONBOARDING.md` replaced with
      real images (captured during the screencast recording session).
- [ ] `MAC_SIGNING_IDENTITY` certificate is current — not expired,
      not revoked. Apple Developer Portal shows it as valid.
- [ ] `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`
      are valid (last successful notary submission within ~30 days).
- [ ] Decide whether to ship with `PRAXIS_UPDATE_FEED_URL` set:
      recommended **yes**, pointing at a placeholder feed announcing
      v1.0.0 itself, so the update-check infrastructure is exercised
      in the wild from day one.
- [ ] Onboarding screencast recorded and hosted (GitHub release asset
      or YouTube unlisted link); README references the hosted URL.
- [ ] CHANGELOG entry for v1.0.0 (if the project keeps one).
- [ ] Git tag `v1.0.0` ready to push after `release-deploy` runs.

## Known acceptable divergences

These are expected and do NOT count as block-ship findings:

- **Windows / Linux installers are unsigned for v1.0.0.** Users see
  Gatekeeper / SmartScreen warnings on Windows and unsigned-package
  warnings on Linux. Documented in `README.md` and
  `docs/CODE-SIGNING.md`. Cross-platform signing is post-v1.
- **Ollama support is not exercised in this checklist.** Local-model
  flow requires a running Ollama server; out-of-scope for the
  reference rehearsal.
- **macOS is single-arch in v1.0.0.** Only the maintainer's host arch
  (typically `arm64`) is built. Intel Mac users either build their
  own or wait for a multi-arch follow-up. Tracked in
  `idea-electron-multi-arch-rebuild`.
- **First teach turn latency depends on the engine.** Direct providers
  return responses in seconds; Claude Code through the CLI subprocess
  has a one-time spin-up cost on first turn. Either is acceptable.
- **The first-run flow's "Skip onboarding" works at every step.** A
  user who skips the engine step will hit the engine error on first
  message in any session — this is expected, not a defect.

## After a successful run

1. Append the run summary to this feature's `## Review` section.
2. Verdict line: **Go** (or **No-go** with the list of block-ship
   findings).
3. If **Go**: cut the v1.0.0 release tag locally; run
   `/agile-workflow:release-deploy v1.0.0` to bind Phase 19's items
   into the release directory and run the gate sweep.
4. If **No-go**: convert block-ship findings into stories (see the
   triage rubric); do NOT tag the release until they clear and the
   rehearsal is re-run.

The shipped release becomes the reference for v1.0.1+ checklists, which
will be substantially shorter — they only need to verify what changed.
