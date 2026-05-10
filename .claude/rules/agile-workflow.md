---
description: Agile-workflow substrate navigation rules
paths: ['.work/**', 'docs/**']
---

# Agile-Workflow Substrate Navigation

## Folder structure
.work/active/{epics,features,stories}/  in-flight, scoped
.work/backlog/                           parked, unscoped
.work/releases/<version>/                shipped bundles
.work/archive/                           done items not bound to a release

## Item kinds
epic     multi-feature arc; has children    parent of features
feature  design + implementation unit       parent of stories
story    single-session unit                leaf or has tasks
task     checklist line in parent body      not its own file
release  version bundle in releases/        binds items via release_binding

## Stages
epic     drafting → implementing → review → done
feature  drafting → implementing → review → done
story    implementing → review → done       (often skips drafting)
task     [ ] → [x]
release  planned → quality-gate → released

## Frontmatter
id, kind, stage, tags[], parent, depends_on[], release_binding,
gate_origin, created, updated

## Navigation primitives (run these; don't scan by hand)

# Items at a stage
grep -lr 'stage: implementing' .work/active/

# Items by tag
grep -lr 'tags:.*\bsecurity\b' .work/active/

# Children of an epic (hierarchy)
grep -lr 'parent: <epic-id>' .work/active/

# Items that depend on X (sequencing)
grep -lr 'depends_on:.*<id>' .work/active/

# Bound to a release
grep -lr 'release_binding: v1.2.0' .work/active/

# Compose: implementing & ready (no unmet deps)
.work/bin/work-view --stage implementing --ready

# Item history
git log -p -- .work/active/features/<id>.md

# Recent substrate changes
git log --since='1 day ago' -- .work/

## Session start checklist
1. cat .work/CONVENTIONS.md            project-specific overrides
2. .work/bin/work-view --stage review  items waiting on user
3. .work/bin/work-view --ready         items ready to work
4. Identify your work: explicit user ask, or pick the next ready item

## Stage transition discipline
- Update `stage:` and let PostToolUse hook auto-bump `updated:`
- Commit after each stage transition (one commit per item per transition)
- Do not pre-populate stages; advance only as work completes

## Foundation docs (rolling-forward principle)
docs/ holds standing context: VISION.md, SPEC.md, ARCHITECTURE.md, etc.
- Foundation docs describe the system as it is NOW
- Never add "previously this was…" or "note: in v1.2 we…"
- When implementation changes a foundation-doc assertion, update the doc
- Git history is the audit trail; the doc is the present
