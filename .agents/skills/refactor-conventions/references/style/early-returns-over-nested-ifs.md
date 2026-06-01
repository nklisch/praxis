# Style Rule: early-returns-over-nested-ifs

> Use guard clauses + early returns. A function body should not nest
> more than 2 levels of control flow (`if`, `for`, `while`, `try`).
> Re-shape with early returns, helper extraction, or `continue` /
> `break` before pushing nesting deeper.

## Motivation

Praxis services already lean strongly on guard clauses — the dominant
shape in `course-create-service.ts`, `artifacts-service.ts`, and the
session loop is *N early returns, then the linear happy path*. Codifying
this prevents new code from drifting into deep arrow-pyramid blocks
where the happy path is buried inside three `if` checks.

Honest assessment: this rule mostly serves as a **stake-in-the-ground
for future code**, not a refactor driver. The audit found very few
3+-level nests; the value is keeping that property as the codebase
grows.

## What Counts

A function violates this rule when its body — measured at the deepest
point — has 3 or more open `{ }` control-flow scopes simultaneously,
where each scope is an `if`/`else`, `for`, `while`, `try`, `switch
case`, or callback closure.

```ts
function bad(x: X) {
  if (cond1) {              // depth 1
    for (const y of x.ys) { // depth 2
      if (cond2(y)) {       // depth 3  <- violation
        doSomething(y);
      }
    }
  }
}
```

Pure indentation isn't the metric — object literals and JSX trees are
not control flow.

## Before / After

### Synthetic example: nested-if pyramid → guard clauses

**Before**
```ts
function attachDocument(input: AttachInput): Result {
  if (input.documentId) {
    const doc = this.docs.get(input.documentId);
    if (doc) {
      if (this.canAttach(doc, input.scope)) {
        return this.doAttach(doc, input.scope);
      } else {
        return { ok: false, reason: "permission_denied" };
      }
    } else {
      return { ok: false, reason: "document_not_found" };
    }
  } else {
    return { ok: false, reason: "missing_document_id" };
  }
}
```

**After**
```ts
function attachDocument(input: AttachInput): Result {
  if (!input.documentId) return { ok: false, reason: "missing_document_id" };
  const doc = this.docs.get(input.documentId);
  if (!doc) return { ok: false, reason: "document_not_found" };
  if (!this.canAttach(doc, input.scope)) {
    return { ok: false, reason: "permission_denied" };
  }
  return this.doAttach(doc, input.scope);
}
```

### From this codebase: shape to preserve

`packages/core/src/services/course-create-service.ts:203-222`
(`addConcept`) — 5 early returns before the main mutation, depth never
exceeds 2. This is the target shape; the rule exists so new code
matches it.

## Exceptions

- **Switch statements** with one `case` body per branch and no nested
  `if` inside each — the `switch` is one scope; the cases don't
  compound depth.
- **JSX trees** — visual nesting in render functions is not control
  flow. (UI components with deep JSX are a separate code-organization
  concern, not this rule's territory.)
- **Try/catch surrounding a single linear block.** `try { ... } catch
  (e) { ... }` is depth 1 in each branch; the rule cares about nested
  conditionals *inside* the try, not the try itself.
- **Reducer-style state machines** with `switch (state.kind)` and
  per-case logic — depth 2 inside cases is acceptable.

## Scope

- **Applies to**: All TS/TSX in `packages/*/src/` and `apps/*/src/`.
- **Does NOT apply to**:
  - Generated parser code, state-machine code emitted from a spec.
  - Test files (test setup nesting is its own concern).
  - Vendored / forked third-party utilities.

## Detection

There is no precise grep — depth-of-nesting needs an AST. The cheap
heuristic that catches most offenders:

```bash
rg -n --type ts -g 'packages/*/src/**' -g '!**/__tests__/**' \
  -e '^\s{12,}(if|for|while|try)\b'
```

Lines starting with 12+ spaces of indentation hitting a control keyword
are almost always 3+-deep. Manually inspect each match and verify
nesting depth.

For a more rigorous pass, use the `simplify` skill or a temporary TS
script that walks the AST. The detection grep is just for picking
likely candidates.

For High Value entries: cite `file:line` (the deepest line), quote the
nested block, and propose the guard-clause reshape with concrete early
returns. Mark **Worth Considering** if the function is otherwise simple
and the nesting isn't really hurting readability.
