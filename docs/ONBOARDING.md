# Onboarding

Welcome to Praxis. This document walks you from "I just downloaded the
installer" through "I'm in my first teach session." Read it once before
you launch the app and you'll skip past the parts that feel
unnecessary.

## What Praxis is

Praxis is an AI tutor that runs locally on your machine. It teaches
through structured courses built from canonical concept graphs or from
your own materials, and it adapts to how you learn — which strategies
help you, which concepts you struggle with, when to back off
difficulty, when to push.

Every session is a conversation; the agent has tools that let it draw
math, grade your work, suggest next concepts, take notes, and build
flashcards. Praxis is open-source and your data stays on your machine.

## What you need before you start

- A few minutes for the first run.
- ~500MB free disk space (the canonical packs are tiny; the
  embeddings model and Pyodide together are the bulk).
- A model engine to drive the tutor:
  - **Claude Code** — uses your existing Claude Code CLI auth. Free
    with Claude Pro / Max.
  - **Direct providers** (Anthropic, OpenAI, Google) — you bring an
    API key.
  - **Codex** — Codex CLI auth.
  - **Ollama** — local models, no API key.
- macOS, Windows, or Linux. macOS is the v1 launch platform with a
  signed installer; Windows and Linux ship unsigned for v1 (download
  warnings will appear).

## Install

Visit the project's downloads page and grab the installer for your
platform: <DOWNLOADS_URL>.

- **macOS**: open the `.dmg`, drag Praxis to /Applications, eject.
  Double-click to launch.
- **Windows**: run the `.exe` installer; follow prompts.
- **Linux**: install the `.deb` (`sudo dpkg -i Praxis-*.deb`) or run
  the `.AppImage` directly.

For the maintainers shipping these installers — see
`docs/CODE-SIGNING.md` for the production signing pipeline.

## First run

The first time you launch Praxis, you'll see a guided welcome flow.
Three short steps:

### Step 1 — Welcome

A one-screen introduction. Click **Continue** to start setup, or
**Skip onboarding** to jump straight to the Library if you want to
configure things manually.

### Step 2 — Engine

Pick the model engine you'll use:

- **Direct — Anthropic (Claude)** / **Direct — OpenAI (GPT)** /
  **Direct — Google (Gemini)**: enter your API key. The key is
  encrypted at rest with Electron's `safeStorage` (Keychain on macOS,
  DPAPI on Windows, libsecret / kwallet on Linux) — only your OS user
  account can decrypt it, and it never leaves your machine except in
  API requests to the chosen provider. On platforms where no OS keyring
  is available, Praxis refuses to save the key and asks you to use the
  `PRAXIS_API_KEY` environment variable instead.
- **Claude Code**: no API key needed — Praxis uses your existing
  Claude Code CLI authentication. A **Sign in to Claude Code** button
  appears next to the engine selector; click it to run the sign-in
  flow inline. The button reads "Signed in" once authentication has
  completed.
- **Codex**: similar to Claude Code; uses Codex CLI auth.
- **Direct — Ollama (local)**: no key needed; Praxis talks to your
  local Ollama server.

Setting `PRAXIS_API_KEY` (or the provider-specific
`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`)
in your environment overrides anything entered here. Useful if you
manage secrets through a password manager or shell profile.

Click **Continue** to save and move on, or **Skip onboarding** to
configure later via Settings.

### Step 3 — Course

Choose where you want to start:

- **Algebra (canonical)** — a CCSS-aligned algebra-1 concept graph.
  Good for learners 9-12.
- **Biology (canonical)** — an NGSS-aligned high-school biology graph
  spanning cells, genetics, evolution, and ecosystems.
- **From your own syllabus** — drop in a syllabus, textbook outline,
  or course description and the bootstrap agent explores it with you
  to draft a course.

Picking any option lands you in a fresh chat session in bootstrap
mode. Type your first message — for canonical packs, ask the tutor to
use the pack: *"Start me on the algebra-1 canonical pack."* For your
own syllabus, paste it in or describe what you want to learn.

[Screenshot: bootstrap mode chat]

## Your first teach session

Once a course is created, the chat workspace becomes your home:

- **Left rail**: your courses, sessions, library documents.
- **Centre**: the conversation with your tutor.
- **Right rail**: the per-mode tab body — assignments, drafts,
  flashcards due, the activity rail.
- **Composer**: text + sketch input. Tap the sketch toggle to draw
  math equations on a canvas; the tutor reads them via vision.

Try this in your first session:

1. Ask: *"Teach me how to solve linear equations step-by-step."* The
   agent picks the first concept and walks you through it.
2. When the agent issues a quick check or assignment, sketch your
   answer in the composer and submit. The tutor grades it and offers
   feedback or corrections.
3. After a few concepts, ask: *"What should I work on next?"* The
   adaptive router uses your mastery scores, mistakes, and engagement
   signals to choose.

[Screenshot: chat workspace mid-session]

You can pause anytime. Close the app — the next launch picks up where
you left off, with all your progress, notes, and flashcards intact.

## Updates

Praxis checks for new versions on launch when the maintainer has
configured an update feed. When a newer version is available, an
in-app banner appears with a download link. Click it, run the new
installer, and your data carries over.

For the technical details of how the update flow works, see
`docs/UPDATE-CHANNEL.md`. For maintainers cutting releases, that doc
also covers the operational steps.

## Getting help

- **Bugs and issues**: open one at the project's GitHub issues page.
- **Feature ideas**: GitHub discussions.
- **Design philosophy**: `docs/UX.md` — the editorial design system,
  the tone, what we mean by "tutor." Worth reading if you want to
  understand why Praxis feels different from a chat app.

## Screencast plan

The user-facing onboarding screencast is a short video the maintainer
records once and updates rarely. Storyboard:

| Scene | Time | Content |
|-------|------|---------|
| 1 | 0:00 - 0:15 | Tagline + welcome screen. "Praxis is an AI tutor that adapts to how you learn." |
| 2 | 0:15 - 0:45 | Engine pick + API key entry. Show the dropdown, type an API key into the password field, click Continue. |
| 3 | 0:45 - 1:15 | Course pick. Click "Algebra (canonical)" — show the bootstrap session opening. |
| 4 | 1:15 - 2:15 | First teach turn. Student asks for help with a concept; agent responds; student sketches a problem; agent verifies and offers feedback. |
| 5 | 2:15 - 2:30 | "Pause anytime — your progress carries over." Show the activity rail and a session resume. |

Total target: ~2:30. Production:

- **Recording**: any standard screen recorder (QuickTime on macOS, OBS
  cross-platform).
- **Editing**: minimal — basic cuts; no animated text overlays
  required for v1.
- **Hosting**: GitHub release asset for v1.0.0. If file size exceeds
  the GitHub Release cap, upload to YouTube as an unlisted video and
  link from the release.

The maintainer records this once before publishing v1.0.0; future
versions update only when the first-run flow itself changes.

## In-app copy alignment

The terminology in this doc must match `packages/ui/src/lib/copy.ts`'s
onboarding strings. The vocabulary list:

| Term | Used for | Avoid |
|------|----------|-------|
| **engine** | The model backend (Claude, GPT, etc.) | "model", "AI", "backend" |
| **course** | A top-level learning track | "class", "subject" |
| **lesson** | A unit within a course | "section", "chapter" |
| **concept** | A specific idea taught within a lesson | "topic", "skill" |
| **session** | A single conversation in the workspace | "chat", "thread" |
| **first run** | The initial guided flow this doc describes | "tutorial", "wizard" |
| **onboarding** | Internal name for the same flow (in code paths only) | — |

When this doc and the in-app copy disagree, fix whichever is wrong.
The doc tracks the realised flow; the COPY module is the source of
strings the user actually sees.
