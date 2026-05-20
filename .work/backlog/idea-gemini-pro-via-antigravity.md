---
id: idea-gemini-pro-via-antigravity
created: 2026-05-19
tags: [engines, wont-do]
---

Add engine support for Gemini Pro plans by wrapping the Antigravity CLI (or equivalent subscription-based CLI surfaces) as a new engine adapter under `@praxis/engines`, parallel to the existing Claude Code and Codex adapters. This would let users on Google AI Pro / Ultra plans drive Praxis sessions without burning API credits, broadening the set of subscription tiers Praxis can ride on alongside Claude Max and ChatGPT Plus.

## Research outcome (2026-05-19)

Researched the same day Antigravity 2.0 shipped at Google I/O 2026. **Recommendation: do not build.** See `docs/research/gemini-subscription-engine.md` for the full write-up.

Two blockers, either of which is sufficient on its own:

1. **Policy**: Google's Feb-2026 abuse-mitigation policy (effective 2026-03-25) explicitly targets "using Gemini CLI oAuth with third-party software". Third-party plugins that proxy the subscription OAuth (e.g. the OpenCode `opencode-google-antigravity-auth` plugin) have caused user account bans in the wild. Shipping a Praxis engine that does the same thing would put users at risk of losing their Google accounts — an asymmetric error we cannot accept to save per-token spend.
2. **No programmatic surface**: the new Antigravity CLI is Go-based with browser-OAuth + system-keyring auth, but Google has not published a stream-JSON / non-interactive mode equivalent to `claude-code`'s SDK surface. Even setting the policy aside we'd be reverse-engineering an unstable interactive CLI.

The official Antigravity **SDK** (`pip install google-antigravity`, Python only) uses `GEMINI_API_KEY` — API-key only, so it does not solve the subscription billing problem the idea was about. Adding it later as an `antigravity` engine remains possible if we want Google's MCP-native agent loop for tutoring sessions, but it would still be API-key auth (no subscription path) and would add a Python runtime to the desktop bundle.

The user-facing equivalent is already available: `direct.google` (Vercel `@ai-sdk/google` v6) supports Gemini 3 Pro and Gemini 2.5 Pro today via `GOOGLE_GENERATIVE_AI_API_KEY`.

**Reload triggers** (any of these would flip the recommendation): Google publishes an official Node/TS Antigravity SDK, Google publishes a ToS carve-out for third-party subscription proxying, the Antigravity CLI gains a documented stream-JSON mode, or the Antigravity SDK adds a non-API-key auth path.
