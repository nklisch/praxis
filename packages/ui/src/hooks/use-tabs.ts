/**
 * The tabs state lives in `TabsContext` (mounted near the router root in
 * `<TabsProvider>`); this file re-exports the shared types and the
 * `useTabs()` consumer for callers that still import from
 * `hooks/use-tabs.js`. Lifting state to a context eliminates the
 * duplicate `client.tabs.listOpen()` fetches that two parallel
 * `useTabs()` callers used to fire per route navigation.
 */

export type { UseTabsResult } from "../context/tabs-context.js";
export { TabsProvider, useTabs } from "../context/tabs-context.js";
