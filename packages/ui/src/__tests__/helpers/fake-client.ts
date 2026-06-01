import type { PraxisClient } from "@praxis/core/types";

/**
 * Build a deeply-stubbed PraxisClient for tests. Every field is an empty
 * object cast to its type — usable when the test doesn't exercise that
 * service. Override specific fields via `overrides`.
 *
 * Single SOT — when PraxisClient gains a new field, only this helper updates,
 * and every test gets it for free.
 */
export function makeFakeClient(overrides?: Partial<PraxisClient>): PraxisClient {
  return {
    session: {
      // empty-session-cleanup: closeTab fires discardIfUnpromoted; always no-op in tests
      // unless the test overrides session entirely.
      discardIfUnpromoted: async () => ({ discarded: false }),
    } as PraxisClient["session"],
    artifacts: {} as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {} as PraxisClient["packs"],
    notes: {} as PraxisClient["notes"],
    flashcards: {} as PraxisClient["flashcards"],
    claudeAuth: {} as PraxisClient["claudeAuth"],
    shell: {} as PraxisClient["shell"],
    tabs: {} as PraxisClient["tabs"],
    sketches: {} as PraxisClient["sketches"],
    conceptMaps: {} as PraxisClient["conceptMaps"],
    documentScopes: {} as PraxisClient["documentScopes"],
    activity: {} as PraxisClient["activity"],
    drafts: {
      // Default no-op generator so CourseCreateTabBody's finalization useEffect
      // doesn't throw in tests that don't need to exercise draft events.
      events: async function* () {},
    } as unknown as PraxisClient["drafts"],
    quickCheck: {} as PraxisClient["quickCheck"],
    update: {} as PraxisClient["update"],
    subAgent: {} as PraxisClient["subAgent"],
    recommendations: {} as PraxisClient["recommendations"],
    citations: {} as PraxisClient["citations"],
    library: {} as PraxisClient["library"],
    progress: {
      rollup: async () => [],
    } as PraxisClient["progress"],
    log: {
      record: () => {},
    },
    ...overrides,
  };
}
