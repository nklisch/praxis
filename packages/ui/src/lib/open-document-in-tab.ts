import type { DocumentId, PraxisClient, TabId } from "@praxis/core/types";
import type { NavigateFn } from "@tanstack/react-router";

/**
 * Open a document in a viewer tab and navigate to it.
 *
 * Mirrors the `openSessionInTab` pattern from `session-tab-open-flow`.
 *
 * Call order:
 *  1. `client.tabs.openDocument({ documentId, title })` — creates a document tab row.
 *  2. `navigate({ to: "/chat/$tabId", params: { tabId: tab.id } })` — lands in the chat workspace.
 *
 * The tab body dispatcher (`chat-tab-body.tsx`) will need a `kind === "document"` branch
 * to render `<DocumentTabBody>` — that lands in the sibling viewer story.
 *
 * Returns the new TabId so callers can act on it if needed.
 *
 * The `title` should be the document filename truncated to ~40 chars; it is stored
 * on the tab row at open time so re-opens don't require a document fetch.
 *
 * Note: The `NavigateFn` type is `ReturnType<typeof useNavigate>` from TanStack Router.
 */
export async function openDocumentInTab(opts: {
  client: PraxisClient;
  navigate: NavigateFn;
  documentId: DocumentId;
  title: string;
}): Promise<TabId> {
  const tab = await opts.client.tabs.openDocument({
    documentId: opts.documentId,
    title: opts.title,
  });
  await opts.navigate({ to: "/chat/$tabId", params: { tabId: tab.id } });
  return tab.id;
}
