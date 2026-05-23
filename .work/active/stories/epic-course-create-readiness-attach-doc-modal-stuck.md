---
id: idea-course-create-attach-doc-modal-stuck
created: 2026-05-19
tags: [bug]
---

In the course-create (course design) flow, attaching documents shows a stacking
bug: after the user finishes the attach flow the "done" modal appears, but the
previous modal in the chain stays mounted underneath it instead of dismissing
— and once the user closes both, no attached documents are visible in the
course design surface. Likely a combination of a modal-dismissal regression
(previous step not unmounting before the success modal opens) and a refresh
gap on the course-create attachments list (state not re-reading from the
backing scope after attach). Worth investigating both the modal lifecycle in
the attach-from-library / inline-upload paths and the scopes refresh in
CourseCreate after `documentScopes.attach`.
