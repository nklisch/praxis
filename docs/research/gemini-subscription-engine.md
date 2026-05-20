# Research: Supporting Gemini Pro subscriptions via Antigravity

## Context

The parked idea `idea-gemini-pro-via-antigravity` asks whether Praxis can add a
fourth engine adapter that rides on a user's **Google AI Pro / Ultra
subscription** the way the existing Claude Code adapter rides on a Claude Max
subscription and the Codex adapter rides on a ChatGPT Plus subscription. The
appeal is obvious — users on Google's subscription tier could drive Praxis
sessions without paying per-token API fees.

Google's I/O 2026 keynote (today, 2026-05-19) announced **Antigravity 2.0**
with a new Go-based CLI, a Python SDK, an updated desktop IDE, and Managed
Agents in the Gemini API. Antigravity is positioned as the official
successor to the existing `gemini-cli`, which **stops serving Pro/Ultra
subscription traffic on 2026-06-18**. So if the subscription path is going to
work at all, it has to work through Antigravity — which is what the idea
already anticipates.

The question this research answers is whether that path is technically and
contractually viable.

## Questions

1. Does the Antigravity CLI expose a programmatic / streaming / JSON-output
   interface suitable for being spawned as a subprocess from Praxis (the way
   `@praxis/claude-cli-sdk` drives the Claude Code CLI)?
2. Does the official Antigravity SDK authenticate against Google AI Pro / Ultra
   subscriptions, or only against `GEMINI_API_KEY`?
3. Does Google's Terms of Service permit a third-party application to drive
   Gemini on behalf of an end-user who is paying for a Google AI Pro / Ultra
   subscription (via any token / OAuth flow)?
4. If the subscription path is closed, what is the best API-key-backed Gemini
   engine path for Praxis, and how does it compare to a hypothetical official
   Antigravity-SDK adapter?

## Options Evaluated

### Option A — Antigravity CLI as subprocess (subscription path)

- **Maturity**: Shipped 2026-05-19. Built in Go. Bidirectional sync with the
  desktop app. SSH-friendly.
- **Auth**: System keyring + browser Google Sign-In. Rides the user's Google
  AI Pro / Ultra subscription (or Enterprise GCP project).
- **Programmatic surface**: **Not documented.** No streaming JSON output mode
  in the published material, no MCP-server-hosting flag in the install docs,
  no equivalent of `claude-code`'s `--output-format stream-json`. Designed
  for an interactive terminal user.
- **License posture for embedding**:
  - The Feb-2026 abuse-mitigation policy in `google-gemini/gemini-cli#22970`
    states Google is "implementing more robust detection for policy-violating
    use cases (e.g. using Gemini CLI oAuth with third-party software)" with
    enforcement from **2026-03-25**.
  - Real-world reports (OpenCode `opencode-google-antigravity-auth` plugin)
    document account bans and shadow-bans for users routing the OAuth token
    through a third-party agent harness.
  - Google has not officially distinguished "legitimate" from "prohibited"
    third-party use, so the safe read is that wrapping Antigravity CLI to
    serve another app's sessions is **off-policy**.
- **Fit**: Even setting policy aside, the lack of a documented stream
  interface means we'd be reverse-engineering an unstable surface for a use
  case Google has signalled they don't want. Two-sided risk: account bans for
  our users, and breakage at every CLI release.

### Option B — Official Antigravity Python SDK as subprocess

- **Maturity**: `pip install google-antigravity`. Apache 2.0. Same agent
  harness Google's own products use. Supports MCP servers for tools.
- **Auth**: `GEMINI_API_KEY` environment variable. **API-key only — no
  subscription path.**
- **Programmatic surface**: First-class — that's the SDK's whole point.
  Streaming and MCP tool registration both supported.
- **Language**: Python only. Praxis is Node/ESM; we'd have to spawn a Python
  subprocess and bridge the event stream over stdio (analogous to the
  `@praxis/claude-cli-sdk` worker pattern), which adds a new runtime
  dependency to the desktop bundle.
- **Fit**: Solves the "official looped Gemini agent" problem but does **not**
  solve the billing problem the user actually asked about. The user already
  has API-key Gemini today through Option D below — Option B's only
  incremental value would be Google's MCP-native agent loop semantics
  (planner, tool retry, etc.) versus the Vercel-AI-SDK loop the Direct engine
  builds itself.

### Option C — Antigravity TypeScript SDK

- Searched npm: `antigravity-sdk` exists but is **third-party**
  (`Kanezal/antigravity-sdk`, "The unofficial Antigravity SDK. Created
  without violating the TOS"). No official Google-published TS/Node SDK at
  this time.
- Result: not a real option for production. Future-proof move is to track
  whether Google ships an official Node SDK — Praxis is Node-first, so a
  Node SDK would change the calculus on Option B.

### Option D — Existing `direct.google` engine (`@ai-sdk/google` v6)

- **Maturity**: Already wired into Praxis. `direct.google` engineId, Vercel
  AI SDK v6, ships with `@ai-sdk/google` ^3.0.66.
- **Auth**: `GOOGLE_GENERATIVE_AI_API_KEY`. API-key only. **Same auth model
  as Option B from the user's wallet's perspective.**
- **Models supported**: Includes `gemini-3-pro-preview`,
  `gemini-3.1-pro-preview`, `gemini-2.5-pro`, plus the Flash family. Default
  in `providers.ts` is `gemini-2.5-flash`; users can override via
  `EngineConfig.model`.
- **Programmatic surface**: `streamText` + Vercel tool conversion
  (`toVercelTools`) — Praxis already runs this for OpenAI/Anthropic/Ollama
  via the same engine.
- **Limitations vs Option B**:
  - Tool-calling loop is Vercel's, not Google's. For tutoring sessions this
    is fine (we've shipped against it for OpenAI and Anthropic). For very
    long tool chains it may be less optimal than the Antigravity harness.
  - `@ai-sdk/google` schema is a subset of OpenAPI 3.0 (no unions) — already
    a non-issue in Praxis tool schemas, but worth noting if a future tool
    needs union args.
- **Fit**: Already shipped. Bumping the default model to `gemini-3-pro` and
  documenting the env-var is a same-day change.

## Recommendation

**Do not build an Antigravity-CLI subprocess engine.** Specifically:

1. **The subscription path the user asked about is not legally available.**
   Routing a Google AI Pro / Ultra subscription through a third-party agent
   harness violates Google's current abuse-mitigation policy and has caused
   user-account bans in the wild (OpenCode plugin precedent). Shipping it
   would put Praxis users at risk of losing their Google accounts. This is
   the asymmetric error: we cannot accept user-account-ban liability to save
   per-token API spend.

2. **The Antigravity CLI also lacks a programmatic interface.** Even if the
   policy changed, the CLI is documented only for interactive use — there is
   no published stream-JSON / non-interactive mode equivalent to
   `claude-code`'s SDK surface. Building against it would be
   reverse-engineering an unstable surface.

3. **The user-facing equivalent already ships.** `direct.google` already
   gives Praxis users Gemini 3 Pro via API key, with streaming and tool
   calling, using the same `@ai-sdk/google` provider Praxis already uses for
   the other Direct engines.

### Next steps (small, optional)

- **Bump `DEFAULT_MODELS.google`** in
  `packages/engines/src/direct/providers.ts:10` from `gemini-2.5-flash` to
  `gemini-3-pro-preview` (or `gemini-3-flash-preview` if cost-sensitive is
  the better default).
- **Document** the `GOOGLE_GENERATIVE_AI_API_KEY` env var and the
  `direct.google` engineId in the user-facing setup (README "Native modules"
  section already covers per-engine setup for Claude Code and Codex; add a
  Gemini block).
- **Watch for**: (a) Google publishing an official Node Antigravity SDK,
  (b) Google publishing a clear ToS carve-out for third-party harnesses
  using user-supplied OAuth, (c) a documented stream/JSON surface on the
  Antigravity CLI. Any of those flips the recommendation.
- If a future need arises for Google's *agent loop* (Option B) — e.g. very
  long tool chains where the Antigravity planner outperforms Vercel's — we
  can revisit by adding an `antigravity` engine that subprocesses the Python
  SDK and bridges events over stdio, mirroring the `@praxis/claude-cli-sdk`
  pattern. That is still API-key auth, so it doesn't solve the billing
  problem.

The original parked idea
(`.work/backlog/idea-gemini-pro-via-antigravity.md`) should be **closed as
won't-do** with a pointer to this document.

## Implementation Notes (if/when Option B becomes worthwhile)

- The Python SDK would have to be spawned as a sidecar from
  `packages/engines/src/antigravity/`, with a stdio JSON event stream the
  Node side parses. Pattern to mirror:
  `packages/claude-cli-sdk/src/cli/args.ts` (subprocess args) +
  `packages/engines/src/claude-code/events.ts` (event mapping).
- Auth would read `GOOGLE_GENERATIVE_AI_API_KEY` (Vercel name) or
  `GEMINI_API_KEY` (Google SDK name) — `EngineConfig.apiKey` already exists
  on the type, so this is a config-only change at the contract layer.
- Tool dispatch would route through the existing `@praxis/engines/mcp`
  bridge — Antigravity SDK supports MCP servers, so `startToolBridge` plugs
  in unchanged.
- Distribution cost: the desktop bundle would gain a Python runtime
  requirement. Today Praxis is pure Node/Electron; adding a Python sidecar
  for one engine is a meaningful packaging tax. This is a separate reason
  to defer Option B until there's concrete tutoring-quality evidence the
  Antigravity loop beats Vercel's.

## References

- [Google I/O 2026 developer highlights — Antigravity 2.0, Gemini API, AI Studio](https://blog.google/innovation-and-ai/technology/developers-tools/google-io-2026-developer-highlights/) — announcement of Antigravity 2.0, CLI, SDK, Managed Agents.
- [Google Developers blog — Transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/) — Gemini CLI sunset date 2026-06-18 for Pro/Ultra.
- [google-antigravity/antigravity-sdk-python on GitHub](https://github.com/google-antigravity/antigravity-sdk-python) — official Python SDK, Apache 2.0, `GEMINI_API_KEY` auth.
- [google-antigravity/antigravity-cli on GitHub](https://github.com/google-antigravity/antigravity-cli) — official Go CLI, browser-OAuth auth, no published programmatic interface.
- [Gemini CLI Discussion #22970 — Service update: mitigating abuse](https://github.com/google-gemini/gemini-cli/discussions/22970) — Google's abuse-mitigation policy, Feb 2026, enforcement from 2026-03-25.
- [shekohex/opencode-google-antigravity-auth on GitHub](https://github.com/shekohex/opencode-google-antigravity-auth) — third-party OAuth-proxy plugin pattern; precedent for reported account bans.
- [@ai-sdk/google provider docs](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai) — current model list (Gemini 3 Pro, 2.5 Pro), streaming, tool calling, `GOOGLE_GENERATIVE_AI_API_KEY`.
- `packages/engines/src/direct/providers.ts:10` — `DEFAULT_MODELS.google` in Praxis.
- `packages/engines/src/direct/adapter.ts` — `DirectEngine` implementation that already serves Gemini today.
