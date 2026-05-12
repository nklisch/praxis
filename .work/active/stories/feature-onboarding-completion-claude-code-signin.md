---
id: feature-onboarding-completion-claude-code-signin
kind: story
stage: review
tags: [ui, onboarding]
parent: feature-onboarding-completion
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Inline Claude Code sign-in in EngineStep

## Scope

Story 1 of `feature-onboarding-completion`. When the user picks
`claude-code` as their engine during onboarding, render a "Sign in to
Claude Code" button that opens `<ClaudeAuthModal>`. Use `useAuthStatus()`
(or the actual hook name; verify in code) to flip the button label between
signed-in and not-signed-in states.

Closes Gap 1 from the parent feature: today, a user who picks Claude Code
at onboarding has to skip the flow and sign in from settings before they
can run a session. After this story, they can sign in inline.

## Files to touch

- `packages/ui/src/components/onboarding-flow.tsx` — extend `EngineStep`. When `config.engineId === "claude-code"`, render the sign-in button alongside the engine selector. Read auth state via the existing hook.
- `packages/ui/src/__tests__/onboarding-flow.test.tsx` (or wherever onboarding tests live) — add cases for the new behavior.

## Acceptance criteria

- [ ] When `config.engineId === "claude-code"` and the user is not signed in, the sign-in button is visible and labeled "Sign in to Claude Code".
- [ ] When signed-in, button label reads "Signed in" (or similar) and is visually muted but still clickable (lets the user re-auth or switch accounts).
- [ ] Clicking the button opens `<ClaudeAuthModal />`.
- [ ] When `engineId !== "claude-code"`, the sign-in button is not rendered.
- [ ] Existing apiKey field logic (hidden for claude-code / ollama; visible otherwise) is unchanged.
- [ ] At least 2 new tests lock the contract (rendering visibility + click behavior).

## Implementation notes

- Existing patterns: `<ClaudeAuthModal>` should already exist in the codebase — search for it before re-implementing. The `useAuthStatus()` hook may be named differently; verify.
- Button styling: match the existing engine-step controls (probably a styled `<button>` consistent with the design system; theme tokens from the recently-landed editorial polish pass apply).

## References

- Design: `.work/active/features/feature-onboarding-completion.md` (Story 1)
- Origin idea: `.work/backlog/idea-onboarding-claude-code-signin.md`

<!-- Implementation Notes accumulate here as work progresses. -->

## Implementation notes

**Hook/component names found:**

- `ClaudeAuthModal` — exists at `packages/ui/src/components/claude-auth-modal.tsx`. Props: `onClose: () => void`, `onSignedIn: () => void`. Renders the full sign-in flow including the Claude CLI auth URL exchange.
- Auth state: The `useAuthStatus()` hook in `packages/ui/src/context/auth-context.tsx` tracks `needsAuth` (a reactive flag set when an in-session auth error occurs), NOT the upfront "is logged in" boolean. That boolean lives in `ClaudeAuthStatus.loggedIn` returned by `client.claudeAuth.status()`.
- The EngineStep therefore calls `client.claudeAuth.status()` directly (via `useEffect` gated on `config.engineId === "claude-code"`) to get `loggedIn`. `useAuthStatus()` is not used in this component.

**Button styling decisions:**

- Not-signed-in state: `styles.primaryButton` (accent-colored, matches the Continue button) — draws attention since action is needed.
- Signed-in state: `styles.signedInButton` (new class, muted border/text, ghosted appearance) — still clickable for re-auth but visually de-emphasized.
- Button is placed inside a `<div className={styles.field}>` with a `<span className={styles.fieldLabel}>` matching the API key field structure — same vertical rhythm as the key input.

**Tests added** (`packages/ui/src/__tests__/onboarding-flow.test.tsx`):

1. Shows "Sign in to Claude Code" when `engineId === "claude-code"` and `loggedIn: false`.
2. Shows "Signed in to Claude Code ✓" when `engineId === "claude-code"` and `loggedIn: true`.
3. Sign-in button is absent for non-claude-code engines.
4. Clicking the button renders `<ClaudeAuthModal>` (mocked via `vi.mock`).
5. After `onSignedIn()` fires, the button label flips to the signed-in state.

`ClaudeAuthModal` is mocked in tests to avoid pulling in `client.claudeAuth.login()` stream infrastructure. The mock exposes `data-testid="claude-auth-modal"` and stub "Close" / "Signed In" buttons to simulate both close and success paths.

**Verification:** `pnpm --filter @praxis/ui typecheck` ✓, `pnpm typecheck` ✓, `pnpm --filter @praxis/ui test` ✓ (827 tests pass). Lint: no new errors in changed files (pre-existing unrelated failures in root lint not introduced by this change).
