---
id: idea-configure-end-to-end-conceptmaps-missing
created: 2026-05-19
tags: [typecheck, tech-debt]
---

`tests/configure-end-to-end.test.ts:197` fails typecheck with `TS2741: Property 'conceptMaps' is missing in type '{ db, log, artifacts, memory, configuratorId, studentId, promptCustomization }' but required in type 'AuthoringServiceDeps'`. This was hidden behind the now-fixed session-service.ts baseline error (`story-fix-session-service-exactoptional-baseline`) — typecheck used to short-circuit before reaching the integration test. Surfaced after that fix landed. Story-sized; the fix is to thread a `conceptMaps` service (or a stub fake) into the deps bag at line 197. Confirm whether the test predates the `conceptMaps` field being added to `AuthoringServiceDeps`, in which case the test setup just needs the missing key.
