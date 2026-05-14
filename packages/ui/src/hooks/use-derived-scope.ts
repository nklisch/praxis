import type { CourseId, DocumentScope, SessionId } from "@praxis/core/types";
import { useMatches } from "@tanstack/react-router";
import { useMemo } from "react";
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
 *
 * Reference-stability note: the returned object is memoised on the primitives
 * `(kind, id)` so two consecutive renders with identical route + tabs state
 * return the same reference. This stabilises downstream loader identity in
 * consumers like `<chat.tsx>` where the scope feeds into `useResource`'s deps.
 */
export function useDerivedScope(): DerivedScope {
	const matches = useMatches();
	const { openTabs, activeTabId } = useTabs();

	const activeTab = openTabs.find((t) => t.id === activeTabId);

	// Compute (kind, id) tuple from route + active tab, then memoise the
	// returned object on those primitives. The branch logic is identical to
	// the prior decision tree — only the identity contract changes.

	const courseMatch = matches.find((m) => {
		const id = m.routeId as string;
		return id === "/courses/$courseId" || id.startsWith("/courses/$courseId/");
	});

	let kind: DerivedScope["kind"] = "all";
	let id: string | null = null;

	if (courseMatch && (activeTab === undefined || activeTab.kind !== "document")) {
		const params = courseMatch.params as Record<string, string | undefined>;
		const rawId = params.courseId;
		if (rawId) {
			kind = "course";
			id = rawId;
		}
	} else if (activeTab && activeTab.kind === "session" && activeTab.modeId === "bootstrap") {
		kind = "session";
		id = activeTab.sessionId;
	}
	// Document-tab branch + default fall through to { kind: "all" } per the
	// decision-tree comment above. The branch is preserved for future work
	// (listScopesForDocument wiring).

	return useMemo<DerivedScope>(() => {
		if (kind === "course" && id) return { kind: "course", id: id as CourseId };
		if (kind === "session" && id) return { kind: "session", id: id as SessionId };
		return { kind: "all" };
	}, [kind, id]);
}
