---
id: idea-start-praxis-button-noop
created: 2026-05-24
tags: [bug, ui]
---

On the course-create screen, the "Start Praxis" button is a no-op — clicking it does nothing and doesn't navigate anywhere. The handler is either missing, wired to the wrong target, or failing silently before navigation fires. Trace the button's onClick path, confirm the intended destination (likely the new course's session / progress map), and restore navigation.
