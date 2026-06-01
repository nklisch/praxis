import { useNavigate, useSearch } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteHeader } from "../components/route-header.js";
import { getRouteMeta } from "../components/route-meta.js";
import { COPY } from "../lib/copy.js";
import styles from "./workspace.module.css";

// Lazily imported sub-routes — keeps the workspace shell snappy.
const NotesList = lazy(() =>
  import("./workspace/notes-list.js").then((m) => ({ default: m.NotesListTab })),
);
const CardsList = lazy(() =>
  import("./workspace/cards-list.js").then((m) => ({ default: m.CardsListTab })),
);
const ReviewSession = lazy(() =>
  import("./workspace/review-session.js").then((m) => ({ default: m.ReviewSessionTab })),
);

type WorkspaceTab = "notes" | "cards" | "review";

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "notes", label: "Notes" },
  { id: "cards", label: "Cards" },
  { id: "review", label: "Review" },
];

function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  return TABS.some((tab) => tab.id === value);
}

/**
 * /workspace route — the student study workspace.
 *
 * Three tabs: Notes / Cards / Review.
 * Active tab is controlled via a `?tab=` search param.
 * Default tab is "notes".
 */
export function WorkspaceRoute() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: unknown };
  const activeTab: WorkspaceTab = isWorkspaceTab(search.tab) ? search.tab : "notes";
  const meta = getRouteMeta("workspace");

  const switchTab = (tab: WorkspaceTab) => {
    navigate({ to: "/workspace", search: { tab } });
  };

  return (
    <div className={styles.layout}>
      <RouteHeader
        ornament={meta.ornament}
        kicker={meta.kicker}
        title={meta.title}
        deck={meta.deck}
      />

      <nav className={styles.tabs} aria-label="Workspace tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tab} ${activeTab === t.id ? styles.active : ""}`}
            onClick={() => switchTab(t.id)}
            aria-selected={activeTab === t.id}
            role="tab"
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className={styles.content}>
        <Suspense fallback={<p className={styles.loading}>{COPY.loading.default}</p>}>
          {activeTab === "notes" && <NotesList />}
          {activeTab === "cards" && <CardsList />}
          {activeTab === "review" && <ReviewSession />}
        </Suspense>
      </div>
    </div>
  );
}
