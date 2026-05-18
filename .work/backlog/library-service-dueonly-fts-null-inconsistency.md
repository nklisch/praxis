---
id: library-service-dueonly-fts-null-inconsistency
kind: story
stage: implementing
tags: [bug]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# LibraryService dueOnly: FTS path treats NULL nextReviewAt as due, non-FTS path does not

## Problem

`LibraryServiceImpl.#ftsSearchFlashcards` applies the `dueOnly` filter as:

```sql
AND (fc.next_review_at IS NULL OR fc.next_review_at <= ?)
```

This treats flashcards with a `NULL` `next_review_at` as "due". However, the
non-FTS path uses:

```
lte(flashcards.nextReviewAt, new Date(now))
```

which, per Drizzle's `lte`, excludes NULL rows. The same convention is used
throughout the codebase in `FlashcardsServiceImpl.list` (line 115) and
`FlashcardsServiceImpl.dueCount` (line 210) — NULL means "not yet scheduled",
not "due now".

A fresh flashcard that has never been reviewed (`next_review_at IS NULL`)
therefore appears in `dueOnly+query` (FTS path) results but NOT in
`dueOnly` (non-FTS path) results, depending solely on whether a `query`
string is passed. This is a behavioral inconsistency that will confuse the
workspace catalogue UI.

## Fix

Remove the `IS NULL OR` clause from the FTS dueOnly filter:

```sql
AND fc.next_review_at <= ?
```

Add a test that inserts a flashcard with `nextReviewAt: null` and asserts
it does NOT appear in `dueOnly: true` results (both with and without `query`).

## Files

- `packages/core/src/services/library-service.ts` line 202
- `packages/core/src/services/__tests__/library-service.test.ts` (add test case)
