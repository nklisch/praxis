import type { CourseId, DocumentId, DocumentScope, SessionId } from "@praxis/core/types";
import { useMatches } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";
import { useTabs } from "./use-tabs.js";

/**
 * The scope inferred from the active route + active tab.
 *
 * - `{ kind: "course", id }` — user is in a course route and the active tab
 *   is a session (teach, quiz, etc.) or there is no active tab.
 * - `{ kind: "session", id }` — the active tab is a bootstrap session.
 * - `{ kind: "all" }` — library route, document tab with no scopes attached,
 *   no relevant context, or the default.
 */
export type DerivedScope = DocumentScope | { kind: "all" };

/**
 * Pick the "primary" scope of a document: prefer the first course scope; if
 * none, fall back to the first session scope. Used for branch 3 of
 * `useDerivedScope` where an active document tab needs a single scope to
 * key the documents sidebar against.
 *
 * Exposed for unit-test reuse; not part of the hook's external API.
 */
export function pickPrimaryScope(scopes: ReadonlyArray<DocumentScope>): DocumentScope | null {
  const course = scopes.find((s) => s.kind === "course");
  if (course) return course;
  const session = scopes.find((s) => s.kind === "session");
  if (session) return session;
  return null;
}

/**
 * Derives the "active scope" from the current route and the active tab.
 *
 * Decision tree (evaluated in order — first branch that fires wins):
 *
 * 1. **Course route AND active tab is NOT a document tab** → `{ kind: "course", id }`.
 *    The user is browsing or studying within a course; the sidebar shows
 *    that course's attached documents.
 *
 * 2. **Active tab has `modeId === "course-create"`** → `{ kind: "session", id }`.
 *    The course-create session is active; show the exploration session's documents.
 *
 * 3. **Active tab is a document tab (`kind === "document"`)** → that document's
 *    primary scope, resolved via `documentScopes.listScopesForDocument`. Course
 *    scope is preferred over session scope. Returns `{ kind: "all" }` while the
 *    fetch is in flight or when the document is attached to no scopes (orphan).
 *
 * 4. **Default** (library route, settings, workspace, no active tab, etc.) →
 *    `{ kind: "all" }`.
 *
 * The hook is intentionally side-effect-free beyond reading tabs state and
 * fetching scopes for the active document tab; the caller decides what to do
 * with the scope (e.g. which `documents.*` method to call, which empty-state
 * copy to render, etc.).
 *
 * Reference-stability note: the returned object is memoised on the primitives
 * `(kind, id)` so two consecutive renders with identical route + tabs state
 * return the same reference. This stabilises downstream loader identity in
 * consumers like `<chat.tsx>` where the scope feeds into `useResource`'s deps.
 */
export function useDerivedScope(): DerivedScope {
  const client = usePraxisClient();
  const matches = useMatches();
  const { openTabs, activeTabId } = useTabs();

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const courseMatch = matches.find((m) => {
    const id = m.routeId as string;
    return id === "/courses/$courseId" || id.startsWith("/courses/$courseId/");
  });

  // Branch 1 / Branch 2 / Branch 4 are computed synchronously below.
  let kind: DerivedScope["kind"] = "all";
  let id: string | null = null;
  let documentIdForBranch3: DocumentId | null = null;

  if (courseMatch && (activeTab === undefined || activeTab.kind !== "document")) {
    const params = courseMatch.params as Record<string, string | undefined>;
    const rawId = params.courseId;
    if (rawId) {
      kind = "course";
      id = rawId;
    }
  } else if (activeTab && activeTab.kind === "session" && activeTab.modeId === "course-create") {
    kind = "session";
    id = activeTab.sessionId;
  } else if (activeTab && activeTab.kind === "document") {
    documentIdForBranch3 = activeTab.documentId;
  }

  // Branch 3: fetch scopes for the active document, then derive the primary
  // scope. While the fetch is pending or if the document has no scopes,
  // return `{ kind: "all" }` as a graceful default.
  const loader = useCallback(async () => {
    if (!documentIdForBranch3) return null;
    return client.documentScopes.listScopesForDocument(documentIdForBranch3);
  }, [client, documentIdForBranch3]);

  const { data: scopes } = useResource(loader);

  if (documentIdForBranch3) {
    const primary = scopes ? pickPrimaryScope(scopes) : null;
    if (primary) {
      kind = primary.kind;
      id = primary.id;
    }
  }

  return useMemo<DerivedScope>(() => {
    if (kind === "course" && id) return { kind: "course", id: id as CourseId };
    if (kind === "session" && id) return { kind: "session", id: id as SessionId };
    return { kind: "all" };
  }, [kind, id]);
}
