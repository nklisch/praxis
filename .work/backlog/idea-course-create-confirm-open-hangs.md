---
id: idea-course-create-confirm-open-hangs
created: 2026-05-25
tags: [bug]
---

In course create, the "confirm and open" action on materialize hangs — clicking it doesn't appear to do anything: no navigation, no error surfaced, no visible state change. Likely a broken promise chain or missed event in the materialize → promote-scope → open-course flow. Worth tracing what fires on click and where it stalls (drafter materialization, scope promotion, tab open, or navigation).
