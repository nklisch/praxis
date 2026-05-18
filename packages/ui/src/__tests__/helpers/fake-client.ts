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
    session: {} as PraxisClient["session"],
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
    drafts: {} as PraxisClient["drafts"],
    quickCheck: {} as PraxisClient["quickCheck"],
    update: {} as PraxisClient["update"],
    subAgent: {} as PraxisClient["subAgent"],
    recommendations: {} as PraxisClient["recommendations"],
    citations: {} as PraxisClient["citations"],
    ...overrides,
  };
}
