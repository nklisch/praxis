/**
 * Editorial metadata for each non-session route. Single source of truth —
 * adding a new route is one entry here, not scattered across three files.
 *
 * Sibling to mode-meta.ts, which covers active session modes.
 */

export interface RouteMeta {
  readonly ornament: string;
  readonly kicker: string;
  /** Italic display title. Empty for dynamic routes (e.g. courseDetail) — caller fills it in. */
  readonly title: string;
  /** Deck line shown beneath the title. Empty for dynamic routes. */
  readonly deck: string;
}

export const ROUTE_META: Readonly<Record<string, RouteMeta>> = {
  // Phase 14 will add a /library entry that supersedes /courses + /packs;
  // both pre-Phase-14 routes get their own treatment for the duration of Phase 13.
  courses: {
    ornament: "¶",
    kicker: "COURSES",
    title: "courses",
    deck: "what you're learning",
  },
  packs: {
    ornament: "§",
    kicker: "PACKS",
    title: "knowledge packs",
    deck: "available curriculum",
  },
  workspace: {
    ornament: "❦",
    kicker: "WORKSPACE",
    title: "your workspace",
    deck: "notes and review",
  },
  configure: {
    ornament: "⁂",
    kicker: "CONFIGURE",
    title: "configure",
    deck: "author and tune",
  },
  settings: {
    ornament: "·",
    kicker: "SETTINGS",
    title: "settings",
    deck: "engine and preferences",
  },
  courseDetail: {
    ornament: "¶",
    kicker: "COURSE",
    title: "", // dynamic — caller passes the live course title
    deck: "", // dynamic — caller passes e.g. "wk 4 · 12 lessons"
  },
  courseMap: {
    ornament: "§",
    kicker: "COURSE MAP",
    title: "concept map",
    deck: "how concepts connect",
  },
};

export function getRouteMeta(routeId: keyof typeof ROUTE_META): RouteMeta {
  const meta = ROUTE_META[routeId];
  if (!meta) {
    throw new Error(`No route metadata found for routeId: "${String(routeId)}"`);
  }
  return meta;
}
