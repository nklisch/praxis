---
name: praxis-gemini-engine
description: Reference for the Gemini / Antigravity engine path in Praxis. Auto-loads when an agent is touching Gemini, Antigravity, `@ai-sdk/google`, `direct.google`, `google-antigravity`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, or considering a new engine adapter for Google models. Captures the policy + technical constraints found in `docs/research/gemini-subscription-engine.md` (2026-05-19) so future agents don't re-discover them.
user-invocable: false
version-pinned: "@ai-sdk/google ^3.0.66, ai ^6, antigravity-2.0"
---

# Praxis Gemini engine — quick reference

Praxis ships Gemini support today through the **Direct engine** family
(`direct.google`), backed by Vercel `@ai-sdk/google` v6. There is **no
subscription-tier (Google AI Pro / Ultra) engine** and there is a specific
reason not to add one — read the policy section before designing anything.

## TL;DR for design decisions

| Want                                  | Build path                                                                  | Status                  |
|---------------------------------------|-----------------------------------------------------------------------------|-------------------------|
| Gemini via API key (per-token billing)| `direct.google` (already shipped)                                           | ✅ Available             |
| Google's official MCP-native loop     | New `antigravity` engine wrapping the Python `google-antigravity` SDK       | ⚠️ Possible, API-key only |
| Pro/Ultra subscription billing        | Subprocess the Antigravity CLI with the user's OAuth                        | ❌ **ToS violation**     |

## Policy landmines

### Subscription-OAuth proxying is off-policy

Google's abuse-mitigation policy (Feb 2026, effective **2026-03-25**)
explicitly calls out "using Gemini CLI oAuth with third-party software" as a
target for "more robust detection" — see
`google-gemini/gemini-cli#22970`. Third-party plugins that proxy the OAuth
token (e.g. `opencode-google-antigravity-auth`) have been linked to user
account bans and shadow-bans in the wild.

**Do not** build a Praxis engine that subprocesses the Antigravity CLI and
inherits a user's Google Sign-In session. The asymmetric risk (user loses
their Google account) is not worth the per-token savings, and we have no
public ToS carve-out to point to that says otherwise.

### Gemini CLI sunset

`gemini-cli` stops serving Pro/Ultra subscription traffic on **2026-06-18**;
Antigravity CLI is the successor for that market. Both ride the same
subscription policy — there is no Gemini path that gives a third-party app
subscription-paid traffic today.

## The shipped path: `direct.google`

`packages/engines/src/direct/providers.ts:10` declares the provider map; the
Google branch is API-key only:

```ts
import { google } from "@ai-sdk/google";

case "google":
  return google(modelId);   // reads GOOGLE_GENERATIVE_AI_API_KEY
```

`packages/engines/src/direct/adapter.ts:104` then runs the standard
`streamText` + `toVercelTools` loop — same code path as OpenAI / Anthropic /
Ollama under `direct.*`.

### Selecting Gemini

- `EngineConfig.engineId = "direct.google"`
- `EngineConfig.model` overrides the default. Current model status:
  - **`gemini-3.5-flash`** — GA 2026-05-19 (I/O 2026). **Default in `providers.ts`.** Outperforms 3.1 Pro on Terminal-Bench 2.1 / GDPval-AA / MCP Atlas, ~4× faster than other frontier models.
  - **`gemini-3.5-pro`** — Ships June 2026. Listed in the vision allow-list for forward-compat; users can opt in via `EngineConfig.model` the day it lands.
  - **`gemini-3.1-pro-preview`** — GA despite the `-preview` suffix (Feb 2026 release). Recommended Pro tier until `gemini-3.5-pro` lands.
  - **`gemini-3-pro-preview`** — DISCONTINUED 2026-03-26. Do not add to allow-lists.
  - Older `gemini-2.5-*` / `gemini-2.0-*` / `gemini-1.5-*` remain in the allow-list for backward compat with persisted user configs.
- Env: `GOOGLE_GENERATIVE_AI_API_KEY` set in the Praxis process before `createEngine`.
- Allow-list + default-vision-model SSOT: `packages/core/src/config/vision-models.ts`. The substring regex `/gemini-\d+\.\d+-(pro|flash|ultra)/i` is the forward-compat fallback that admits unreleased `gemini-X.Y-(pro|flash|ultra)` variants without an SSOT edit.

### Caveats

- `@ai-sdk/google` schema is a subset of OpenAPI 3.0 — **no union types** in
  tool args. Current Praxis tool schemas are fine; check if you add a new
  one with `z.union(...)` at the top level.
- For Gemma models the provider auto-prepends system instructions to user
  messages (Gemma has no native system slot). Affects Gemma only.
- `structuredOutputs: false` can be passed if a Zod schema trips the
  OpenAPI-subset constraint.

## If/when an Antigravity-SDK engine is added

The official SDK (`pip install google-antigravity`, Apache 2.0) gives
programmatic access to Google's internal agent harness with MCP support.
Use API key, not OAuth. Pattern to mirror:

- Sidecar Python subprocess (analogous to `packages/claude-cli-sdk` for
  Claude Code) — Node speaks JSON over stdio.
- Map the SDK's event stream → `EngineEvent` in
  `packages/engines/src/antigravity/events.ts` (follow the
  `sdk-event-mapping` and `async-generator-event-stream` patterns).
- Tool dispatch goes through the existing
  `packages/engines/src/mcp/tool-bridge.ts` — Antigravity SDK supports MCP,
  so no changes to the bridge are needed.
- Add `"antigravity"` to `EngineId` and wire it in `factory.ts:19`.

**Packaging cost**: Praxis is currently pure Node/Electron. An
Antigravity-SDK engine adds a Python runtime requirement to the desktop
bundle. Don't pay this cost speculatively — wait for concrete evidence
that Google's agent loop outperforms Vercel's for a Praxis tutoring use
case.

## Reload triggers

Re-evaluate this skill if any of the following change:

1. Google publishes an **official Node/TypeScript Antigravity SDK** (today
   only Python is official; `Kanezal/antigravity-sdk` on npm is third-party).
2. Google publishes a **written ToS carve-out** allowing third-party apps
   to use a user's Pro/Ultra subscription via OAuth.
3. Antigravity CLI documents a **stream-JSON / non-interactive output mode**
   that makes subprocess driving viable.
4. The Antigravity Python SDK adds a non-API-key auth path.

Until then, the recommendation stands: ship Gemini via `direct.google`, do
not build an Antigravity-CLI subscription engine.

## References

- `docs/research/gemini-subscription-engine.md` — full research write-up.
- `packages/engines/src/direct/providers.ts` — provider map.
- `packages/engines/src/direct/adapter.ts` — Direct engine session loop.
- `packages/engines/src/factory.ts` — engine-id dispatch.
- [@ai-sdk/google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)
- [Gemini CLI Discussion #22970](https://github.com/google-gemini/gemini-cli/discussions/22970)
- [google-antigravity/antigravity-sdk-python](https://github.com/google-antigravity/antigravity-sdk-python)
