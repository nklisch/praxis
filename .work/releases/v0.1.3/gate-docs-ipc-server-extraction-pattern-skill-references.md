---
id: gate-docs-ipc-server-extraction-pattern-skill-references
kind: story
stage: done
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: docs
created: 2026-05-18
updated: 2026-05-18
---

# Pattern skills still cite `ipc-server.ts` for handlers now in per-domain channel modules

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/per-domain-channel-module.md:7, 54-66`
- Doc: `.claude/skills/patterns/subscriber-fanout-stream.md:9, 25-52`
- Doc: `.claude/skills/patterns/ipc-channel-convention.md:12-31` (Example 1)
- Doc: `.claude/skills/patterns/ipc-envelope-handler.md:15, 32` (Examples 1 and 2)
- Code: `packages/desktop/electron/main/ipc-server.ts` (now ~183 lines, only
  invokes `register*Handlers`); `packages/desktop/electron/main/session-channel.ts`;
  `packages/desktop/electron/main/config-channel.ts`;
  `packages/desktop/electron/main/course-create-drafts-channel.ts`

## Current doc text
per-domain-channel-module.md:7 mentions `bootstrap-drafts` in the domain
list. Example 3 points at `ipc-server.ts:1291` and tail-list includes
`bootstrap-drafts-channel.ts:20`.

subscriber-fanout-stream.md:25-52 Example 2 references
`bootstrap-drafts-channel.ts:28` and channel string
`praxis.bootstrap.drafts.events.*`.

ipc-channel-convention.md Example 1 points at `ipc-server.ts:81`,
registering session and config channels inline.

ipc-envelope-handler.md Examples 1 and 2 point at `ipc-server.ts` for
config envelope handlers.

## Reality
- `ipc-server.ts` is a 183-line composition root that invokes 25+
  `register*Handlers` calls; it no longer registers any channels directly.
- The drafter-drafts channel file is `course-create-drafts-channel.ts`;
  the registered function is `registerCourseCreateDraftsHandlers`.
- The streaming channel base is `praxis.courseCreate.drafts.events`.
- Session channels (`praxis.session.*`) live in `session-channel.ts`,
  registered via `registerSessionHandlers`.
- Config channels live in `config-channel.ts`.

## Required edit
- per-domain-channel-module.md: rename `bootstrap-drafts` to
  `course-create-drafts` throughout. Replace Example 3's
  `ipc-server.ts:1291` line reference with the current location
  (~line 60-122 in `ipc-server.ts`). Update the tail-list file names.
- subscriber-fanout-stream.md: rename file paths to
  `course-create-drafts-channel.ts`, channel strings to
  `praxis.courseCreate.drafts.events.*`, and rationale paragraph from
  "bootstrap drafts" to "course-create drafts". Leave the
  `services.bootstrap.subscribe(...)` call as-is — the field key on
  `Services` was intentionally not renamed.
- ipc-channel-convention.md Example 1: replace with handlers pulled from
  `session-channel.ts` (registered through `registerSessionHandlers`).
  Update the "Adding a new domain" guidance to point at the per-domain
  channel module pattern, not `ipc-server.ts`.
- ipc-envelope-handler.md Examples 1 and 2: point at
  `packages/desktop/electron/main/config-channel.ts` with current line
  numbers.

Apply rolling-foundation: replace assertions in place.

## Implementation notes (2026-05-18)

- `per-domain-channel-module.md`: renamed `bootstrap-drafts` to `course-create-drafts` in the Rationale domain list; updated Example 3 file ref from `ipc-server.ts:1291` to `ipc-server.ts:60-122` (the current span of `register*Handlers` calls); updated tail instances list from `bootstrap-drafts-channel.ts:20` to `course-create-drafts-channel.ts:19` (line of `registerCourseCreateDraftsHandlers`); updated function name in the code block from `registerBootstrapDraftsHandlers` to `registerCourseCreateDraftsHandlers`.
- `ipc-channel-convention.md`: replaced Example 1 (which pointed at `ipc-server.ts:81` with inline session/config registrations) with a representative handler block from `session-channel.ts:34` showing `registerSessionHandlers`; updated "Adding a new domain" guidance to direct readers to create a `<newDomain>-channel.ts` and add one `register*Handlers` call to `ipc-server.ts` instead of adding inline to `ipc-server.ts`.
- Did not touch `ipc-envelope-handler.md` or `subscriber-fanout-stream.md` (owned by other in-flight stories).
- Verification: `grep -n -E "bootstrap-drafts|ipc-server\.ts:1291|ipc-server\.ts:81"` returns zero matches across both files.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: per-domain-channel-module.md and ipc-channel-convention.md updated correctly. bootstrap-drafts → course-create-drafts throughout. ipc-envelope-handler.md and subscriber-fanout-stream.md deferred to their dedicated pattern inconsistency stories (gate-patterns-inconsistency-*), which is appropriate scope separation.
