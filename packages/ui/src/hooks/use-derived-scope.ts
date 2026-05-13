import type { CourseId, DocumentScope } from "@praxis/core/types";
import { useMatches } from "@tanstack/react-router";
import { useTabs } from "./use-tabs.js";

/**
 * The scope inferred from the active route + active tab.
 *
 * - `{ kind: "course", id }` — user is in a course route and the active tab
 *   is a session (teach, quiz, etc.) or there is no active tab.
 * - `{ kind: "session", id }` — the active tab is a bootstrap session.
 * - `{ kind: "all" }` — library route, document tab (pending `listScopesForDocument`),
 *   no relevant context, or the default.
 */
export type DerivedScope = DocumentScope | { kind: "all" };

/**
 * Derives the "active scope" from the current route and the active tab.
 *
 * Decision tree (evaluated in order — first branch that fires wins):
 *
 * 1. **Course route AND active tab is NOT a document tab** → `{ kind: "course", id }`.
 *    The user is browsing or studying within a course; the sidebar shows
 *    that course's attached documents.
 *
 * 2. **Active tab has `modeId === "bootstrap"`** → `{ kind: "session", id }`.
 *    The bootstrap explorer is active; show the exploration session's documents.
 *
 * 3. **Active tab is a document tab (`kind === "document"`)** → that document's
 *    primary scope. Graceful fallback: `listScopesForDocument` is not yet exposed
 *    on the client API, so this branch currently returns `{ kind: "all" }`.
 *    When `DocumentScopesClientApi.listScopesForDocument` is added, wire it here
 *    using a `useResource` async fetch keyed on `activeTab.documentId`.
 *
 * 4. **Default** (library route, settings, workspace, no active tab, etc.) →
 *    `{ kind: "all" }`.
 *
 * The hook is intentionally side-effect-free beyond reading tabs state; the
 * caller decides what to do with the scope (e.g. which `documents.*` method
 * to call, which empty-state copy to render, etc.).
 */
export function useDerivedScope(): DerivedScope {
  const matches = useMatches();
  const { openTabs, activeTabId } = useTabs();

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  // ── Branch 1: course route ─────────────────────────────────────────────────
  // Any match whose routeId is /courses/$courseId or a sub-route of it
  // (e.g., /courses/$courseId/map, /courses/$courseId/concepts) fires this branch.
  // Exclude when the active tab is a document tab — in that case branch 3 applies.
  const courseMatch = matches.find((m) => {
    const id = m.routeId as string;
    return id === "/courses/$courseId" || id.startsWith("/courses/$courseId/");
  });

  if (courseMatch && (activeTab === undefined || activeTab.kind !== "document")) {
    const params = courseMatch.params as Record<string, string | undefined>;
    const rawId = params.courseId;
    if (rawId) {
      return { kind: "course", id: rawId as CourseId };
    }
  }

  // ── Branch 2: bootstrap tab is active ──────────────────────────────────────
  if (activeTab && activeTab.kind === "session" && activeTab.modeId === "bootstrap") {
    return { kind: "session", id: activeTab.sessionId };
  }

  // ── Branch 3: active document tab ─────────────────────────────────────────
  // The tab-kind story has landed: `activeTab.kind === "document"` now fires.
  // Full implementation requires `client.documentScopes.listScopesForDocument(documentId)`.
  // That method is not yet on `DocumentScopesClientApi`, so we return "all" as
  // a safe default until it's added and wired here.
  //
  // To complete this branch in a future stride:
  //   1. Add `listScopesForDocument(documentId: DocumentId): Promise<DocumentScope[]>`
  //      to `DocumentScopesClientApi` and implement the IPC handler.
  //   2. Replace the `{ kind: "all" }` return below with a `useResource` fetch
  //      keyed on `activeTab.documentId` that picks the first course scope
  //      (else first session scope, else "all").
  if (activeTab && activeTab.kind === "document") {
    return { kind: "all" };
  }

  // ── Branch 4: default ─────────────────────────────────────────────────────
  return { kind: "all" };
}
