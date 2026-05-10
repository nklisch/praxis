---
id: epic-phase-19-onboarding-docs
kind: feature
stage: implementing
tags: [docs]
parent: epic-phase-19-ship-v1
depends_on: [epic-phase-19-first-run-flow]
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Onboarding documentation

## Brief

The v1 documentation pass — README + an onboarding video / screencast plan
— so a new user landing on the repo or the downloads page can install,
launch, and run their first teach session without dev tools or hand-holding.
ROADMAP Phase 19 names this as the "Documentation pass" deliverable.

What this feature covers:

- Rewrite the user-facing portions of `README.md`: a "What is Praxis"
  framing, a quickstart that matches the actual signed-installer flow,
  and a "Run your first session" walkthrough that mirrors the in-app
  first-run flow. The dev-setup section can stay as a deeper "for
  contributors" section.
- An onboarding screencast plan: short outline of the 2-4 minute video
  storyboard ("install → sign in → pick a pack → first teach turn"),
  the script, and where the artefact will be hosted (likely a GitHub
  release asset or a YouTube link in the README).
- In-app help text alignment: where the first-run flow surfaces copy,
  the onboarding doc and the in-app text use consistent terminology
  (no "lesson" in one and "module" in the other, etc.).
- A landing copy pass on `docs/VISION.md` framing where it leaks into
  README — making sure the "what" of Praxis matches what v1 actually
  does.

What this feature does NOT cover:

- Producing the screencast video file itself — that's an out-of-band
  artefact recorded by a human; this feature lands the plan and the
  hosting link, not the editing.
- Marketing copy / website — Praxis ships as a repo + downloads page
  for v1; a marketing site is post-v1.
- Per-mode tutorials inside the app — the in-app first-run flow is the
  tutorial.

## Epic context

- Parent epic: `epic-phase-19-ship-v1`
- Position in epic: depends on `first-run-flow` because the docs document
  the realised flow, not the planned one. The flow needs to exist
  before the docs can describe it accurately.

## Foundation references

- `docs/ROADMAP.md` — Phase 19 build list ("Documentation pass: README +
  onboarding video / screencast").
- `README.md` — the file under rewrite.
- `docs/VISION.md` — the source-of-truth framing the README pulls from.
- `docs/UX.md` — copy tone the doc must match.

## Design decisions

- **Don't rewrite the entire README.** The existing
  `README.md` opens with a clear tagline and a contributor-focused
  Quickstart. Both audiences (users + contributors) read README; the
  fix is to add a small "First run" section near the top that points
  end-users at `docs/ONBOARDING.md`, and an "Updates" subsection
  pointing at `docs/UPDATE-CHANNEL.md`. The contributor section
  underneath stays.
- **Onboarding lives in `docs/ONBOARDING.md` as a new foundation doc.**
  Foundation tone (present-tense, prescriptive). Holds the user-flow
  walkthrough, the screencast outline, and the in-app copy alignment
  notes. Cross-referenced from README.
- **Screencast plan, not screencast video.** The plan + storyboard +
  hosting decision land in this feature; recording the actual video is
  a human-only out-of-band action that the maintainer does when
  they're ready. The plan tells them exactly what to record.
- **In-app copy alignment is review-time work, not a refactor.** Walk
  the existing `COPY` module + onboarding strings; if any term
  conflicts with `docs/ONBOARDING.md`'s walkthrough, fix the COPY
  string (small edit). No new component; no new translation surface.
- **No child stories.** Three units: the new doc, the README
  additions, and a copy-alignment audit pass. All single-stride; one
  agent, one pass.

## Architectural choice

**Add `docs/ONBOARDING.md` + small README edits.** The feature
delivers user-facing documentation calibrated against the realised
first-run flow and the v1 distribution model.

Alternatives considered:

- *Full README rewrite split into "Users" and "Contributors" sections.*
  Rejected: invasive change for marginal benefit. README's current
  shape works for both audiences; a small bridge to user-facing docs
  is sufficient.
- *In-app `/help` route.* Rejected: a static doc + the first-run flow
  cover the v1 surface. An in-app help system is post-v1.

## Implementation Units

### Unit 1 (trickiest): `docs/ONBOARDING.md`
**File**: `docs/ONBOARDING.md` (new)

The standing user-facing onboarding doc. Outline:

1. **What Praxis is for users** — one paragraph framing in plain
   English, distinct from the README's contributor tagline.
2. **What you need before you start** — Apple ID / Google account / API
   key for the engine you'll use (Anthropic, OpenAI, Google, or Claude
   Code which uses your existing CLI auth); a few minutes for first
   run; ~500MB free disk.
3. **Install** — link to the project's downloads page (placeholder
   `<DOWNLOADS_URL>` — the maintainer fills this in pre-publish);
   per-platform install steps (drag .dmg → /Applications on macOS;
   .exe / .msi on Windows; .deb / .AppImage on Linux). Cross-reference
   `docs/CODE-SIGNING.md` for what the maintainer does to produce
   these.
4. **First run walkthrough** — three-step guided flow as it appears in
   the app:
   - **Welcome step**: one screen, one button. Set the tone.
   - **Engine step**: pick the model engine (Claude Code, direct
     Anthropic, direct OpenAI, etc.); enter API key OR sign in
     to Claude Code. Note: env-var paths take precedence.
   - **Course step**: choose Algebra (canonical), Biology (canonical),
     or "From your own syllabus". The first two start a bootstrap
     session pre-loaded for that subject; the third opens an empty
     bootstrap session.
   - "Skip" exits the flow at any step — power users land directly on
     the Library and can configure later via Settings.
5. **Your first teach session** — short narrative: open the bootstrap
   session, type what you want to learn, watch the agent build a
   course. Sketch math; submit homework; receive feedback. Two
   screenshots: the bootstrap-mode chat and the chat workspace
   mid-session.
6. **Updates** — pointer to `docs/UPDATE-CHANNEL.md`; explain that
   when an update banner appears, click "Download", run the new
   installer.
7. **Getting help** — link to GitHub issues / discussions; link to the
   relevant section in `docs/UX.md` for the editorial design rationale
   (so curious users can read the philosophy).
8. **Screencast plan** — embedded section. Storyboard:
   - Scene 1 (15s): "Praxis is an AI tutor that adapts to how you
     learn." Show the welcome screen.
   - Scene 2 (30s): Engine pick + API key.
   - Scene 3 (30s): Pick a course.
   - Scene 4 (60s): First teach turn — student asks for help with a
     concept; agent responds; student sketches a problem; agent
     verifies and offers feedback.
   - Scene 5 (15s): "Pause anytime; pick up where you left off."
     Show the activity rail / session resume.
   - Total target: ~2:30. Hosting: GitHub release asset (or YouTube
     unlisted link if file size is too large for GitHub releases).
   - Production tools: any standard screen recorder (QuickTime,
     OBS) + minimal editing.
9. **In-app copy alignment notes** — short section listing the
   touchpoints between this doc and `packages/ui/src/lib/copy.ts`:
   - "engine" terminology consistent with COPY.onboarding.
   - "course" / "lesson" / "concept" used the same way in doc and
     COPY.
   - "first run" / "onboarding" — pick one and stick with it
     (chosen: "first run" in user copy, "onboarding" in code paths).

**Implementation Notes**:

- Foundation-doc tone: present-tense, prescriptive, no historical
  notes. Mirrors `docs/CODE-SIGNING.md` and `docs/UPDATE-CHANNEL.md`.
- Use `<DOWNLOADS_URL>` as a placeholder. Real URL gets filled in
  by the maintainer at v1.0.0 publish time; an `XXX` flag tells
  reviewers it's not a real link.
- Screenshots are deferred — placeholder text indicates where they
  go. The maintainer captures them when running the screencast.

**Acceptance Criteria**:

- [ ] File exists at `docs/ONBOARDING.md`.
- [ ] All 9 outline sections present.
- [ ] Cross-references `docs/CODE-SIGNING.md`,
      `docs/UPDATE-CHANNEL.md`, and the editorial section of
      `docs/UX.md`.
- [ ] No real production URLs (placeholders only) — maintainer
      fills these in pre-publish.

### Unit 2: README additions
**File**: `README.md`

Two surgical additions:

1. After the opening tagline + before the Quickstart, add a "For users"
   section pointing at `docs/ONBOARDING.md`:
   ```markdown
   ## For users

   If you just want to use Praxis, see `docs/ONBOARDING.md` — it walks
   through install, first run, and your first teach session. The rest
   of this README is for developers building or contributing to Praxis.
   ```
2. Inside the existing "Build a distributable" section, add a one-line
   "Updates" pointer to `docs/UPDATE-CHANNEL.md`:
   ```markdown
   - Updates: when shipping new versions, host a feed JSON and set
     `PRAXIS_UPDATE_FEED_URL` so the in-app banner picks it up. See
     `docs/UPDATE-CHANNEL.md`.
   ```

**Implementation Notes**:

- Don't rewrite the contributor flow. Add minimal links and stop.

**Acceptance Criteria**:

- [ ] "For users" section present at top of README.
- [ ] "Updates" pointer present in the build-distributable notes.

### Unit 3: in-app copy alignment audit
**File**: `packages/ui/src/lib/copy.ts` (likely no changes; possibly
small wording fixes)

Walk the COPY module and the onboarding-flow component. For each user-
visible string in the onboarding flow, verify it matches
`docs/ONBOARDING.md`'s vocabulary. Expected outcome: zero or one small
wording adjustments.

**Implementation Notes**:

- This is a quick check, not a rewrite. If everything aligns, the unit
  produces no diff and the implementer notes that.

**Acceptance Criteria**:

- [ ] Onboarding strings (`COPY.onboarding.*`) use the same vocabulary
      as `docs/ONBOARDING.md`.
- [ ] No regressions: `pnpm test` still passes.

## Implementation Order

1. Unit 1 (`docs/ONBOARDING.md`) — the source of truth that the rest
   calibrates against.
2. Unit 2 (README additions) — small, derives from Unit 1's structure.
3. Unit 3 (copy-alignment audit) — runs against the doc just written.

After all: read the doc end-to-end as a sanity check; run `pnpm lint`
and `pnpm test` for the small COPY changes if any.

## Testing

### Automated tests

None added. Documentation features don't have a test surface; the
existing test suite acts as a regression check for any COPY edits in
Unit 3.

### Manual verification

The maintainer reads `docs/ONBOARDING.md` end-to-end after writing,
confirming every step matches the actual app behaviour. The
ship-checklist will exercise the user flow against the doc as part of
its acceptance script.

## Risks

- **Doc drift over time.** As Praxis evolves, `docs/ONBOARDING.md` can
  drift from the realised flow. Mitigation: when the first-run flow
  changes (new step, different copy, different course choices), the
  changing PR also updates `docs/ONBOARDING.md`. Foundation-doc
  rolling-forward principle handles this.
- **Maintainer hasn't recorded the screencast at v1.0.0.** Acceptable
  — the plan is the deliverable; the recording is an ongoing
  marketing/comms task.
- **Placeholder URLs in the doc.** The maintainer must remember to
  fill them in before publishing v1.0.0. The ship-checklist's
  acceptance criteria explicitly call this out.
- **Cross-platform install steps may drift from the actual installers.**
  e.g., if Linux .deb is dropped post-v1. Acceptable: doc updated
  alongside any such change.

## No child stories

Three small, sequentially dependent units. Single-stride, one agent.
