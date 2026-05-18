---
id: idea-rename-bootstrap-and-explorer
created: 2026-05-17
tags: [refactor]
---

Internal CS jargon ("bootstrap", "explorer") was bleeding through into student/configurator UI surfaces. UI mocks have been retrofitted to use **"Create a course"** (replaces "bootstrap") and to **drop the named agent entirely** — framing the work ("Praxis is drafting", "the draft is taking shape") instead of personifying an internal agent ("the explorer is exploring"). Backend code, tool names, mode ids, prompt files, and documentation should be aligned so the UI naming stays consistent and future refactors don't reintroduce the bleed. Likely renames: mode id `bootstrap` → `course_create` (or treat as an authoring action, not a session mode), agent class `Explorer` / `ExplorerAgent` → `Drafter` or remove the named agent abstraction, tool `course.start_exploration` → `course.start_drafting`, prompt files `bootstrap/explorer-prompt.ts` → `course-create/drafter-prompt.ts`, docs/CURRICULUM.md + docs/ARCHITECTURE.md sections referencing the bootstrap explorer. This is a meaningful refactor with cross-package surface area (curriculum, tools, core/services, ui copy, docs) and warrants its own feature scope rather than a side-effect of mock cleanup.
